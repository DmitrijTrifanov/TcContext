// tc-com.ts
/**
 * Module containing the main TcCom Class, responsible for establishing ADS Connection and managing communication
 * between {@link TcContext} and the PLC
 * 
 * 
 * Licensed under MIT License.
 * 
 * Copyright (c) 2020 Dmitrij Trifanov <d.v.trifanov@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS 
 * IN THE SOFTWARE.
 * 
 * @packageDocumentation
 */


//----IMPORTS...
import Debug from 'debug';
// @ts-ignore
import { Client } from 'ads-client';

import { TcContext } from './tc-context';
import { TcEmitter, TcComConnectedEvent, TcComDisconnectedEvent, TcComSourceChangedEvent, TcComConnectionLostEvent, TcComReconnectedEvent } from './tc-event';
import { TcComBusyException, 
    TcComConnectException, 
    TcComIsInvalidException, 
    TcComChangeDetectionException, 
    TcComUnsubscribeException, 
    TcComDisconnectException, 
    TcComToRawException, 
    TcComFromRawException, 
    TcComDataWriteException, 
    TcComDataReadException,
    TcComSubscribeException,
    TcComTypeQueryException,
    TcComSymbolQueryException,
    TcComMethodCallException } from './tc-exception';

/**
 * Class responsible for establishing connection and managing all communication and data transformation
 * to and from the Target PLC over TwinCAT's ADS layer. 
 * 
 * Is used as a wrapper for the [ads-client](https://github.com/jisotalo/ads-client) library.
 * 
 */
export class TcCom extends TcEmitter {

    /**
     * Constructor, which stores the {@link TcComSettings} used for establishing communication, as well as 
     * the callback, which is triggered upon Code Change detection
     * 
     * @param context - Parent {@link TcContext}, of whom `TcCom` is part of, and whom to propagate events to
     * @param settings - Settings used for communicating over ADS. Definition of connection settings can be found at [ads-client](https://github.com/jisotalo/ads-client) library
     * @param onChange - Callback, which is called when Code Changes are detected. This callback is called after the `sourceChanged` event is emitted
     * @param debug - If enabled, will produce debug information
     */
    constructor(context : TcContext, settings : TcComSettings, onChange? : () => void, debug : boolean = false) {
        super(context);
        this.__context = context;
        this.__settings = { ...TcCom.defaultSettings, ...settings };
        this.__callOnChange = onChange;
        this.__log.enabled = debug;
        this.__log('Creating TcCom Object...')
    }

    /**
     * Access to the previously used {@link TcComSettings} for establishing connection to the TwinCAT PLC
     */
    get settings() : TcComSettings { return this.__settings };

    /**
     * Returns `true` if the current `TcCom` Object is in a valid state, and can be used for communication
     */
    get isValid() : boolean { return this.__ads !== undefined };


    /**
     * Initializes the `TcCom` Object, by establishing a connection to the TwinCAT PLC, with the previously provided {@link TcComSettings}, as well as
     * setting up Code Change monitoring, if the Source Code on the PLC Changes, during run-time
     * 
     * @throws {@link TcComBusyException} - Connection has already been created previously
     * @throws {@link TcComConnectException} - Failed to establish a connection to the TwinCAT PLC over ADS
     * @throws {@link TcComChangeDetectionException} - Failed to set up Code Change monitoring
     * 
     * @return - The initialized `TcCom` Object
     */
    async initialize() : Promise<TcCom> { 

        this.__log(`initialize() : Initializing TcCom Object for ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);

        //Check to see if a connection was already made with this Object. 
        if (this.__ads || this.__changeHndl) throw new TcComBusyException(this.__context, this, 'TcCom already has an active ADS Connection. Consider calling .kill() before calling .initialize() for re-initialization');
        
        //Attempt to connect to the TwinCAT Target, and if successful set up the Code Change monitoring
        const ads = new Client(this.__settings);
        await ads.connect()
            .catch((err : any) => { throw new TcComConnectException(this.__context, this, `TcCom encountered an error when connecting to ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`, err) });

        this.__log(`initialize() : Connection established to ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);

        const changeHndl = await ads.subscribe(TcCom.CHANGE_COUNTER, this.__callback.bind(this))
            .catch(async (err : any) => { 

                //Clean up the connection, if Code Change monitoring has failed before exiting
                await ads.disconnect(true);
                throw new TcComChangeDetectionException(this.__context, this, `TcCom encountered an error when linking Source Changes Monitoring to ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`, err) });

        this.__log(`initialize() : Link to monitor Source Changes established with ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);

        //Attach listeners for the Connection Lost and Reconnect events
        ads.on('connectionLost', () => { this.emit('connectionLost', new TcComConnectionLostEvent(this.__context, this))})
        ads.on('reconnect', () => { this.emit('reconnected', new TcComReconnectedEvent(this.__context, this))})

        //This point will only be reached if all the previous steps were successful, so
        //it is safe to store the created ADS Client and Code Change Handle
        this.__ads = ads;
        this.__changeHndl = changeHndl;

        this.__log(`initialize() : TcCom Object connected to ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);
        this.emit('connected', new TcComConnectedEvent(this.__context, this, this.__settings));

        return this;
    }

    /**
     * Disconnects the previously established connection to the TwinCAT PLC, and cleans up all subscription handles.
     * The `TcCom` Object is no longer usable after this point, unless `TcCom.initialize()` is once again called, to 
     * reestablish the connection.
     * 
     * @throws {@link TcComUnsubscribeException} - Failed to unsubscribe the Handles
     * @throws {@link TcComDisconnectException} - Failed to disconnect from the TwinCAT PLC
     * 
     */
    async disconnect() {
        
        this.__log(`disconnect() : Disconnecting TcCom Object for ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);

        //Check if there is a valid ADS Connection, else skip execution
        if (this.__ads) {

            this.__log(`disconnect() : Removing all Subscription handles from TcCom Object at ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);

            //Unsubscribe all the Change Handles, which were created during the lifetime of 
            //the TcCom Object. Regardless of success or failure of this action, perform a disconnected
            //when done, and clean up remaining variables
            await this.__ads.unsubscribeAll()
                .catch(err => { throw new TcComUnsubscribeException(this.__context, this, `TcCom encountered an error when unsubscribing all handles from ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`, err) })
                .finally(() => {
                    
                    this.__changeCounter = undefined;
                    this.__changeHndl = undefined;

                    this.__log(`disconnect() : Disconnecting from TcCom Object at ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);
                    return this.__ads?.disconnect(true)
                        .catch(err => { throw new TcComDisconnectException(this.__context, this, `TcCom encountered an error when disconnecting from ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`, err) })
                        .finally(() => {
                            
                            this.__ads = undefined;
                            this.__log(`disconnect() : TcCom Object killed at ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);
                            this.emit('disconnected', new TcComDisconnectedEvent(this.__context, this));

                        })
                })
      
        } else {

            this.__log(`disconnect() : TcCom Object was already disconnected at ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);
            this.emit('disconnected', new TcComDisconnectedEvent(this.__context, this));
        }

    }

    /**
     * Converts a given Buffer of data to Javascript Data, based on the TwinCAT Type. 
     * **This conversion works for primitive types, and not structured**
     * 
     * @param type - The TwinCAT Type, whose data is to be converted 
     * @param buffer - The Buffer of Raw Data, that is to be converted
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for conversion
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @return - The Javascript equivalent of `buffer` data converted from the TwinCAT `type`
     *  
     */
    async fromRaw(type : string, buffer : Buffer) : Promise<boolean | number | bigint | string> {
        
        if (this.__ads) {

            this.__log(`fromRaw() : Transforming Buffer to type [${type}]`);
            const data = await this.__ads.convertFromRaw(buffer, type)
                .catch(err => { throw new TcComFromRawException(this.__context, this, `TcCom encountered an error when transforming Buffer to type [${type}]`, err)});
                
            this.__log(`fromRaw() : Transforming Buffer to type [${type}] result ${data}`);
            return data;
            
        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to convert Buffer to Data using a TcCom Object, which was not initialized or was killed previously`);
    }

    /**
     * Converts a primitive non-structured Javascript Value to a Buffer of Data, which can be
     * passed to a TwinCAT Type, as specified by the `type` argument.
     * **This conversion works for primitive types, and not structured**
     * 
     * @param type - The TwinCAT Type, to whom the value is converted
     * @param value - The Javascript value, which is converted to Raw Data
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for conversion
     * @throws {@link TcComToRawException} - Failed to convert to Raw Data
     * 
     * @return - The Data Buffer, which can be passed to a TwinCAT Symbol of Type `type`, representing the passed `value`
     *  
     */
    async toRaw(type : string, value : boolean | number | bigint | string) : Promise<Buffer> {

        if (this.__ads) {

            this.__log(`toRaw() : Transforming value [${value}] to Buffer for type [${type}]`);
            
            const buffer = await this.__ads.convertToRaw(value, type)
                .catch(err => { throw new TcComToRawException(this.__context, this, `TcCom encountered an error when transforming value [${value}] to Buffer for type [${type}]`, err)});
            return buffer;
            
        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to convert Data to Buffer using a TcCom Object, which was not initialized or was killed previously`);
    }

    /**
     * Subscribes to a TwinCAT Symbol, with a callback, which is invoked, whenever the Symbol value changes.
     * The detection of change speed can be set through the `sampling` argument, in case the value changes too fast
     * and such detection is not needed
     * 
     * @param sampling - The speed in `ms` of detecting change. Any change in this interval will not trigger change events 
     * @param pointer - The Symbol Pointer, to which to subscribe
     * @param callback - The callback that is invoked, whenever Symbol change is detected
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComSubscribeException} - Failed to subscribe to the provided pointer
     * 
     * @return - The Subscription Handle, that can be used to unsubscribe in the future
     */
    async subscribe(sampling : number, pointer : TcSymbolPointer, callback : () => void) : Promise<TcSubscription> {

        if (this.__ads) {

            this.__log(`subscribe() : Subscribing to memory pointer { indexGroup : ${pointer.indexGroup}, indexOffset : ${pointer.indexOffset}, size : ${pointer.size}`);
            const hndl = await this.__ads.subscribeRaw(pointer.indexGroup, pointer.indexOffset, pointer.size, callback, sampling)
                .catch(err => { throw new TcComSubscribeException(this.__context, this, `TcCom encountered an error when subscribing to memory pointer { indexGroup : ${pointer.indexGroup}, indexOffset : ${pointer.indexOffset}, size : ${pointer.size}`, err)});
            return hndl;
            
        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to issue subscription command through a TcCom Object, which was not initialized or was killed previously`);
    
    }

    /**
     * Unsubscribes the previously created TwinCAT Handle for value change event
     * 
     * @param hndl - The previously create active subscription handle to a TwinCAT Symbol  
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComUnsubscribeException} - Failed to unsubscribe the handle
     * 
     */
    async unsubscribe(hndl : TcSubscription) : Promise<void> {
        
        if (this.__ads) {

            this.__log(`unsubscribe() : Unsubscribing from handle`);
            await hndl.unsubscribe()
                .catch(err => { throw new TcComUnsubscribeException(this.__context, this, `TcCom encountered an error when unsubscribing from handle`, err)});
            return
            
        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to issue unsubscribe command through a TcCom Object, which was not initialized or was killed previously`);
    
        
    }

    /**
     * Performs a write operation over ADS to the TwinCAT PLC of the provided `TcDataPackages`.
     * When sending more than 500+ packages at once, the packages will be split in groups of 500 due to a limitation of ADS
     * 
     * @param dataPackages - The packages with symbol location and data to be send to the Target
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComDataWriteException} - Failed to write data packages
     * 
     */
    async write(dataPackages : TcDataPackage[]) : Promise<void> {

        if (this.__ads) {

            this.__log(`write() : Writing to memory pointers[${dataPackages.length}]`);

            const split = this.__splitData(dataPackages);
            for (let i = 0; i < split.length; i++) {
                await this.__ads.writeRawMulti(split[i])
                    .catch(err => { throw new TcComDataWriteException(this.__context, this, `TcCom encountered an error when writing memory packages[${dataPackages.length}]`, err)});
            }
            return;

        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to write to memory pointers through a TcCom Object, which was not initialized or was killed previously`);
    
    }

    /**
     * Performs a read operation over ADS of the TwinCAT Symbol Pointers.
     * When requesting more than 500+ packages at once, the pointers will be split in groups of 500 due to a limitation of ADS
     * 
     * @param pointer - The symbol pointers, whose data to be queried
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComDataReadException} - Failed to read data pointers
     * 
     * @return - The data packages which were queried by the Symbol Pointers
     */
    async read(pointer : TcSymbolPointer[]) : Promise<TcDataPackage[]> {

        if (this.__ads) {


            this.__log(`read() : Reading memory pointers[${pointer.length}]`);

            const split = this.__splitData(pointer);
            const result : TcDataPackage[] = [];

            for (let i = 0; i < split.length; i++) {
                const response = await this.__ads.readRawMulti(split[i])
                    .catch(err => { throw new TcComDataReadException(this.__context, this, `TcCom encountered an error when reading memory pointers[${pointer.length}]`, err)});
                result.push(...response);
            }

            return result;
            
        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to read memory pointers through a TcCom Object, which was not initialized or was killed previously`);
    
    }

    /**
     * Performs a call to a method of a specific variable over ADS
     * 
     * @param variable - The variable name, whose method is called
     * @param method - The name of the method that is to be called
     * @param parameters - The parameters, which are passed to the method
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComMethodCallException} - Failed to call the Rpc Method on the PLC Side
     * 
     * @return - The result of the method call
     */
    async callMethod(variable : string, method : string, parameters : any) : Promise<{result : any, outputs? : any }> {

        if (this.__ads) {

            this.__log(`callMethod() : Calling method ${variable}#${method}`);
            const result = await this.__ads.invokeRpcMethod(variable, method, parameters)
                .catch(err => { throw new TcComMethodCallException(this.__context, this, `TcCom encountered an error when calling method ${variable}#${method}`, err)})
            
            for(let key in result.outputs) {
                if (result.outputs.hasOwnProperty(key)) {
                    return {
                        result : result.returnValue,
                        outputs : result.outputs
                    }
                }
            }

            return {
                result : result.returnValue
            }


        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to call method through a TcCom Object, which was not initialized or was killed previously`);
    }

    /**
     * Queries the raw ADS Type Data from the Target PLC
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComTypeQueryException} - Failed to query Type Data
     * 
     * @return - The map of all the ADS Types currently present in the TwinCAT PLC
     */
    async types() : Promise<TcTypeInfoMap> {

        if (this.__ads) {

            this.__log(`types() : Reading types...`);
            const results = await this.__ads.readAndCacheDataTypes()
                .catch(err => { throw new TcComTypeQueryException(this.__context, this, `TcCom encountered an error when reading types`, err)});
            return results;

        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to read types through a TcCom Object, which was not initialized or was killed previously`);

    }

    /**
     * Queries the raw ADS Symbol Data from the Target PLC
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComSymbolQueryException} - Failed to query Symbol Data
     * 
     * @return - The map of all the ADS Symbols currently present in the TwinCAT PLC
     */
    async symbols() : Promise<TcSymbolInfoMap> {
        if (this.__ads) {

            this.__log(`symbols() : Reading symbols...`);
            const results = await this.__ads.readAndCacheSymbols()
                .catch(err => { throw new TcComSymbolQueryException(this.__context, this, `TcCom encountered an error when reading symbols`, err)});
            return results;

        } else throw new TcComIsInvalidException(this.__context, this, `Attempting to read symbols through a TcCom Object, which was not initialized or was killed previously`);

    }


    
    //----EVENTS...

    /**
     * Emitted when `TcCom` connects to the Target PLC
     * @event connected
     */
    on(event : 'connected', listener : (e : TcComConnectedEvent) => void) : any;
    
    /**
     * Emitted when `TcCom` disconnects from the Target PLC
     * @event disconnected
     */
    on(event : 'disconnected', listener : (e : TcComDisconnectedEvent) => void) : any;
    
    /**
     * Emitted when `TcCom` detects Code Changes in the Target PLC
     * @event sourceChanged
     */
    on(event : 'sourceChanged', listener : (e : TcComSourceChangedEvent) => void) : any;


    /**
     * Emitted when `TcCom` looses connection to the Target PLC
     * @event sourceChanged
     */
    on(event : 'connectionLost', listener : (e : TcComConnectionLostEvent) => void) : any;

    
    /**
     * Emitted when `TcCom` reconnects to the Target PLC
     * @event sourceChanged
     */
    on(event : 'reconnected', listener : (e : TcComReconnectedEvent) => void) : any;

    on(eventName : string | symbol, listener : (e : any) => void) : any {
        super.on(eventName, listener);
        return this;
    }

    /**
     * The Default settings, used for connecting to a TwinCAT PLC, located at localhost.
     * These settings are merged in, with whatever custom settings are provided during construction
     */
    static readonly defaultSettings = {
        ...Client.defaultSettings(),
        targetAmsNetId : '127.0.0.1.1.1',
        targetAdsPort: 851,
        readAndCacheSymbols: true,
        readAndCacheDataTypes: true,
        disableStructPackModeWarning : true
    }


    /**
     * Internal function, which is invoked whenever Code Changes are detected by the `TcCom` object.
     * Will emit the `sourceChanged` event, as well as invoke a callback which was provided
     * 
     * @param response - The current PLC Last code change stamp which is used to see if changes have happened
     * 
     */
    private __callback(response : { value : number }) : void {
        if (this.__changeCounter !== undefined && this.__changeCounter !== response.value) {
            this.__log(`TcCom Object detected Source Change at ${this.__settings.targetAmsNetId}:${this.__settings.targetAdsPort}`);
            this.emit('sourceChanged', new TcComSourceChangedEvent(this.__context, this));
            if (this.__callOnChange) { this.__callOnChange() };
        }
        this.__changeCounter = response.value;
    }

    /**
     * Internal function, which splits SymbolPointers into groups of 500,
     * due to a TwinCAT ADS limitation, used by the `TcCom.read()` function
     * 
     * @param data - List of Symbol Pointers to split
     * 
     * @return - Groups of 500 Symbol Pointers 
     */
    private __splitData(data : TcSymbolPointer[]) : TcSymbolPointer[][]

    /**
     * Internal function, which splits Data Packages into groups of 500,
     * due to a TwinCAT ADS limitation, used by the `TcCom.write()` function
     * 
     * @param data - List of Data Packages to split
     * 
     * @return - Groups of 500 Data Packages
     */
    private __splitData(data : TcDataPackage[]) : TcDataPackage[][]
    private __splitData(data : any[]) : any[] {
        const result : any[] = [];
        let startIndex = 0;
        let endIndex = 0;
        do {
            endIndex = endIndex + 500;
            endIndex = (endIndex > data.length) ? data.length : endIndex;
            result.push(data.slice(startIndex, endIndex));
            startIndex = endIndex;
        } while (startIndex < data.length);
        return result;
    }

    /**
     * The low-level ADS Communication Module
     * @internal
     */
    private __ads? : ADS;

    
    /**
     * The `TcContext`, which acts as a parent to the `TcCom` and to whom events are propagated
     * @internal
     */
    private __context : TcContext;

    /**
     * Copy of the settings, which are used for establishing a connection to the PLC Target
     * @internal
     */
    private __settings : TcComSettings;

    /**
     * Tracker of Code Changes. If a Change is detected, the new value is compared to this tracker
     * to deduce if changes in the Source have happened
     * @internal
     */
    private __changeCounter? : any;

    /**
     * Subscription handle, for the Code Change Tracker
     * @internal
     */
    private __changeHndl : TcSubscription | undefined;

    /**
     * Callback, which is called after the `sourceChanged` event is emitter, when Code Changes are detected
     * @internal
     */
    private __callOnChange : (() => void) | undefined;

    /**
     * Path to the PLC Symbol, used as the Code Change Tracker
     * @internal
     */
    private static CHANGE_COUNTER : string = 'TwinCAT_SystemInfoVarList._AppInfo.AppTimestamp';

    
    /**
     * @internal
     */
    private __log : debug.Debugger = Debug(`TcContext::TcCom`);

}

/**
 * Expected structure schema, of all potential ADS Communication Settings, that can be passed to the {@link TcCom} Object.
 * These settings are mirror of the settings for the [ads-client](https://github.com/jisotalo/ads-client) library.
 */
export interface TcComSettings {
    targetAmsNetId : string;
    targetAdsPort : number;
    objectifyEnumerations : boolean;
    convertDatesToJavascript : boolean;
    readAndCacheSymbols : boolean;
    readAndCacheDataTypes : boolean;
    disableSymbolVersionMonitoring : boolean;
    disableStructPackModeWarning : boolean;
    routerTcpPort : number;
    routerAddress : string;
    localAddress : string;
    localTcpPort : number;
    localAmsNetId : string;
    localAdsPort : number;
    timeoutDelay : number;
    hideConsoleWarnings : boolean;
    autoReconnect : boolean;
    reconnectInterval : number;
    checkStateInterval : number;
    connectionDownDelay : number;
    allowHalfOpen : boolean;
}

/**
 * Typescript wrapper for the [ads-client](https://github.com/jisotalo/ads-client) library. 
 * @internal
 */
interface ADS {
    connect() : Promise<any>
    disconnect(force : boolean) : Promise<any>,
    unsubscribeAll() : Promise<any>
    subscribe(variableName : string, callback : (response : { value : number }) => any, cycleTime? : number, onChange? : boolean) : Promise<TcSubscription>
    subscribeRaw(indexGroup : number, indexOffset : number, size : number, callback : () => void, cycleTime : number) : Promise<TcSubscription>
    convertToRaw(value : any, dataTypeName : string) : Promise<Buffer>
    convertFromRaw(rawData : Buffer, dataTypeName : string) : Promise<any>
    readRawMulti(src : TcSymbolPointer[]) : Promise<TcDataPackage[]>,
    writeRawMulti(dst : TcDataPackage[]) : Promise<void>,
    readAndCacheDataTypes() : Promise<TcTypeInfoMap>,
    readAndCacheSymbols() : Promise<TcSymbolInfoMap>,
    invokeRpcMethod(variableName : string, methodName : string, parameters : any) : Promise<{returnValue : any, outputs : any}>,
    on(eventName : string, listener : any) : void
}

/**
 * Base information from the ADS about a TwinCAT Type
 */
export interface TcTypeBase {
    attributes? : TcAttribute[],
    adsDataType : number,
    offset? : number,
    name : string,
    type : string,
    size : number,
}

/**
 * Represents the location in the PLC, where a given TwinCAT Symbol resides
 */
export interface TcSymbolIndex {
    indexGroup : number;
    indexOffset : number;
}

/**
 * A Data Package, which can be send over ADS to the TwinCAT PLC with Symbol location
 * and what Buffer of Data to write to it
 */
export interface TcDataPackage extends TcSymbolIndex {
    data : Buffer;
}

/**
 * Represents a pointer to a Symbol in the PLC, to fetch data from, given the size 
 */
export interface TcSymbolPointer extends TcSymbolIndex {
    size : number;
}

/**
 * Data set of information from the ADS about a TwinCAT Symbol and its definition
 */
export interface TcSymbolInfo extends TcSymbolPointer, TcTypeBase {
    adsDataTypeStr : string,
    flags : number,
    flagsStr : string[],
    arrayDimension : number,
    nameLength : number,
    typeLength : number,
    comment : string
}

/**
 * Map of all Symbol information, relative to it name.
 * ***NOTE:*** In TwinCAT, the key represents the full path to the fetched Symbol
 */
export interface TcSymbolInfoMap {
    [key : string]  : TcSymbolInfo
}

/**
 * Stores the information from the ADS about the Attributes, which are applied to a Type/Symbol
 */
export interface TcAttribute {
    name : string,
    value : string
}

/**
 * Data set of information from the ADS about a TwinCAT Type and its definition
 */
export interface TcTypeInfo extends TcTypeBase {
    adsDataTypeStr : string,
    comment : string,
    arrayData : TcArrayDimension[],
    enumInfo? : TcEnumField[],
    subItems : TcTypeInfo[],
    rpcMethods : {name : string}[]
}

/**
 * Map of all Type information, relative to it name.
 * ***NOTE:*** In TwinCAT, the key used for the name of Type is lowercase
 */
export interface TcTypeInfoMap {
    [key : string]  : TcTypeInfo
}

/**
 * Represents a single field in a TwinCAT Enumerator Type
 */
export interface TcEnumField {
    name : string,
    value : Buffer
}

/**
 * Represents the definition of a single dimension of a TwinCAT Array Type
 */
export interface TcArrayDimension {
    startIndex : number,
    length : number
}

/**
 * ADS Subscription Handle, which can be stored and later used to unsubscribe from
 * detecting Symbol Changes in the PLC
 */
export interface TcSubscription {
    notificationHandle : number,
    unsubscribe() : Promise<void>,
 }

 /**
  * List of constants, which provide information on what PLC Type the Type is.
  * This list of constants can be found here, with more information: [ADSDATATYPEID](https://infosys.beckhoff.com/english.php?content=../content/1033/tcplclib_tc2_utilities/9007199290071051.html&id=)
  */
 export const ADST = {
    VOID : 0,
    INT8 : 16,
    UINT8 : 17,
    INT16 : 2,
    UINT16 : 18,
    INT32 : 3,
    UINT32 : 19,
    INT64 : 20,
    UINT64 : 21,
    REAL32 : 4,
    REAL64 : 5,
    BIGTYPE : 65,
    STRING : 30,
    WSTRING : 31,
    REAL80 : 32,
    BIT : 33,
}

export interface TcEnumBuffers {
    [key : string] : Buffer 
}