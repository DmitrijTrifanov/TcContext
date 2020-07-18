// tc-context.ts
/**
 * Module containing the main TcContext Class, responsible for establishing connection over TwinCAT's ADS layer,
 * generating the Type and Symbol Maps for future communication. 
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

import { TcCom, TcComSettings } from './tc-com';
import { TcTypeRegistry } from './tc-type-registry';
import { TcSymbolRegistry } from './tc-symbol-registry';
import * as TcEvents from './tc-event';
import { TcNamespaceSymbol } from './tc-symbol';
import { EventEmitter } from 'events';

/**
 * Class responsible for creating the connection, mapping the types and symbols over the TwinCAT's ADS
 * layer. Its purpose is to serve as the entry point for the tc-context Library.
 * 
 * Creation of a context is done through the `TcContext.create()` static method, due to the asynchronous
 * nature of creation.
 * 
 * ```js
 * const { TcContext } = require('tc-context');
 * 
 * TcContext.create().then(context => {
 *     //.....
 *     await context.kill();
 * })
 * ```
 * 
 */
export class TcContext extends TcEvents.TcEmitter {

    /**
     * Internal constructor, which creates and binds all the Components of `TcContext`, used by `TcContext.create()`
     * 
     * @param settings - Settings used for communicating over ADS. Definition of connection settings can be found at [ads-client](https://github.com/jisotalo/ads-client) library
     * @param onSourceChange - Callback which is issued when Code Change is detected. If none is specified, the the `TcContext.reinitialize` function is bound to it
     * @param debug - If enabled, all components of `TcContext` will produce debug information
     */
    private constructor(settings : TcComSettings, onSourceChange? : () => void, debug : boolean = false) {
        super();
        this.__log.enabled = debug;
        this.__log('Creating TcContext Object...')

        if (!onSourceChange) {
        
            //Bind `TcContext.reinitialize()` method so its called if code changes are detected during run time
            this.__com = new TcCom(this, settings, this.reinitialize.bind(this), debug);
        
        } else this.__com = new TcCom(this, settings, onSourceChange, debug);

        this.__types = new TcTypeRegistry(this, debug);
        this.__symbols = new TcSymbolRegistry(this, debug);
                
    }

    /**
     * Function responsible for the creation of `TcContext`, as well as initializing all of its components
     * 
     * ```js
     * const { TcContext } = require('tc-context');
     * 
     * TcContext.create().then(context => {
     *     //.....
     * })
     * ```
     * @param settings - Settings used for communicating over ADS. Definition of connection settings can be found at [ads-client](https://github.com/jisotalo/ads-client) library
     * @param onSourceChange - Callback which is issued when Code Change is detected. If none is specified, the the `TcContext.reinitialize` function is bound to it
     * @param debug - If enabled, all components of `TcContext` will produce debug information
     * 
     * @throws {@link TcComBusyException} - Connection is already created and `TcCom` is busy
     * @throws {@link TcComConnectException} - Failure establishing ADS Communication
     * @throws {@link TcComChangeDetectionException} - Failure enabling Code Change monitoring
     * @throws {@link TcComTypeQueryException} - Failure querying Type Data from TwinCAT
     * @throws {@link TcComSymbolQueryException} - Failure querying Symbol Data from TwinCAT
     * @throws {@link TcComIsInvalidException} - Attempting to use an Invalidated TcCom Object
     * 
     * @return - The newly created, connected and mapped `TcContext`
     */
    static async create(settings : TcComSettings, onSourceChange? : () => void, debug : boolean = false) {
        
        //Create the `TcContext` and initialize all the components
        const context = new TcContext(settings, onSourceChange, debug);
        return context.__initialize();

    }

    /**
     * Function responsible for explicitly killing `TcContext`, rendering it unusable, unless `TcContext.reinitialize()` is called
     * afterwards, which will reconnect and rebuild a new `TcContext` with previously passed settings
     * 
     * ```js
     * const { TcContext } = require('tc-context');
     * 
     * TcContext.create().then(context => {
     * 
     *     await context.kill()
     *     //context is no longer usable afterwards
     * 
     * })
     * ```
     * ***NOTE:*** Even if the function throws an exception, the context will still be rendered unusable
     * 
     * @throws {@link TcComUnsubscribeException} - Failure unsubscribing from TwinCAT Symbol
     * @throws {@link TcComDisconnectException} - Failure disconnecting from ADS Target
     * 
     * @return - The killed `TcContext`, which is no longer usable
     */
    async kill() : Promise<TcContext> { 

        this.__log(`kill() : Killing TcContext Object...`);

        await this.__types.destroy();
        await this.__symbols.destroy();
        await this.__com.disconnect();
        this.__log(`kill() : TcContext Object was killed`);
        this.emit('killed', new TcEvents.TcContextKilledEvent(this));
        
        return this;
    }

    /**
     * Function, which using the previously passed settings during `TcContext.create()` call, will kill the `TcContext`
     * and then reconnect and rebuild all the components.
     * 
     * This function is automatically called, whenever the `TcCom` module detects a code change on the PLC if
     * no explicit callback was given during construction
     * 
     * @throws {@link TcComBusyException} - Connection is already created and `TcCom` is busy
     * @throws {@link TcComConnectException} - Failure establishing ADS Communication
     * @throws {@link TcComChangeDetectionException} - Failure enabling Code Change monitoring
     * @throws {@link TcComTypeQueryException} - Failure querying Type Data from TwinCAT
     * @throws {@link TcComSymbolQueryException} - Failure querying Symbol Data from TwinCAT
     * @throws {@link TcComIsInvalidException} - Attempting to use an Invalidated TcCom Object
     * @throws {@link TcComUnsubscribeException} - Failure unsubscribing from TwinCAT Symbol
     * @throws {@link TcComDisconnectException} - Failure disconnecting from ADS Target
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - The reinitialized `TcContext`
     */
    async reinitialize() : Promise<TcContext> {
        
        this.__log(`reinitialized() : Reinitializing TcContext Object...`);
        await this.kill();
        await this.__initialize();

        this.__log(`reinitialized() : TcContext Object was reinitialized...`);
        this.emit('reinitialized', new TcEvents.TcContextReinitializedEvent(this));

        return this;

    }

    /**
     * Access to the ADS Communication Module, through which all ADS Actions are made
     */
    get COM() : TcCom { return this.__com; }

    /**
     * Access to the Registry, which stores all the TwinCAT Type Data, pulled from the PLC, and which
     * is used for Symbol generation
     */
    get types() : TcTypeRegistry { return this.__types; }

    /**
     * Access to the Registry, which stores the Symbol Map, generated based on the TwinCAT PLC Data and the
     * Type data gathered by the `TcContext.types` Component
     */
    get symbols() : TcSymbolRegistry { return this.__symbols; }

    /**
     * Shortcut operator of `TcContext.symbols.namespaces`, for quickly accessing the created `TcNamespaces`
     */
    get $() : { [ key : string ] : TcNamespaceSymbol } { return this.__symbols.namespaces };

    //----EVENTS...
    /**
     * Emitted when `TcContext` is killed and is no longer usable
     * @event killed
     */
    on(event : 'killed', listener : (e : TcEvents.TcContextKilledEvent) => void) : any;

    /**
     * Emitted when `TcContext` is reinitialized
     * @event reinitialized
     */
    on(event : 'reinitialized', listener : (e : TcEvents.TcContextReinitializedEvent) => void) : any;

    /**
     * Emitted from {@link TcCom} when it establishes a connection to the PLC
     * @event connected
     */
    on(event : 'connected', listener : (e : TcEvents.TcComConnectedEvent) => void) : any;

    /**
     * Emitted from {@link TcCom} when it disconnects from the PLC
     * @event disconnected
     */
    on(event : 'disconnected', listener : (e : TcEvents.TcComDisconnectedEvent) => void) : any;

    /**
     * Emitted from {@link TcCom} when it detect Code Changes in the PLC
     * @event sourceChanged
     */
    on(event : 'sourceChanged', listener : (e : TcEvents.TcComSourceChangedEvent) => void) : any;

    /**
     * Emitted from {@link TcSymbolRegistry} when it creates the Symbol Map
     * @event created
     */
    on(event : 'created', listener : (e : TcEvents.TcSymbolRegistryCreatedEvent) => void) : any;

    /**
     * Emitted from {@link TcSymbolRegistry} when it destroys the Symbol Map
     * @event destroyed
     */
    on(event : 'destroyed', listener : (e : TcEvents.TcSymbolRegistryDestroyedEvent) => void) : any;
    
    /**
     * Emitted from {@link TcTypeRegistry} when it creates the Type Map
     * @event created
     */
    on(event : 'created', listener : (e : TcEvents.TcTypeRegistryCreatedEvent) => void) : any;

    /**
     * Emitted from {@link TcTypeRegistry} when it destroys the Types Map
     * @event destroyed
     */
    on(event : 'destroyed', listener : (e : TcEvents.TcTypeRegistryDestroyedEvent) => void) : any;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$set()` has completed
     * @event set
     */
    on(event : 'set', listener : (e : TcEvents.TcSymbolSetEvent) => void) : any;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$get` has completed
     * @event get
     */
    on(event : 'get', listener : (e : TcEvents.TcSymbolGetEvent) => void) : any;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$clear()` has completed
     * @event cleared
     */
    on(event : 'cleared', listener : (e : TcEvents.TcSymbolClearedEvent) => void) : any;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol` detects a change in the PLC Symbol
     * @event changed
     */
    on(event : 'changed', listener : (e : TcEvents.TcSymbolChangedEvent) => void) : any;

    on(eventName : string | symbol, listener : (e : any) => void) : any {
        super.on(eventName, listener);
        return this;
    }
    

    /**
     * Internal function used by `TcContext.create()` static method, to initialize all the Components of the `TcContext` Object
     * 
     * @throws {@link TcComBusyException} - Connection is already created and `TcCom` is busy
     * @throws {@link TcComConnectException} - Failure establishing ADS Communication
     * @throws {@link TcComChangeDetectionException} - Failure enabling Code Change monitoring
     * @throws {@link TcComTypeQueryException} - Failure querying Type Data from TwinCAT
     * @throws {@link TcComSymbolQueryException} - Failure querying Symbol Data from TwinCAT
     * @throws {@link TcComIsInvalidException} - Attempting to use an Invalidated TcCom Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - The newly created, connected and mapped `TcContext`
     * 
     */
    private async __initialize() : Promise<TcContext> { 

        this.__log(`initialize() : Initializing TcContext Object...`);
        await this.__com.initialize()
        
        try {
            
            await this.__types.create()
            await this.__symbols.create();

        } catch (err) {

            await this.__com.disconnect();
            throw(err)

        }

        this.__log(`initialize() : TcContext Object was initialized...`);
        return this;
    }

    /**
     * ADS Communication Module
     * @internal
     */
    private __com : TcCom;

    /**
     * Will register all the TwinCAT Types, which will be used by `TcSymbolRegistry` to create Symbol Map
     * @internal
     */
    private __types : TcTypeRegistry;

     /**
     * Will created and store the TwinCAT Symbol Map
     * @internal
     */
    private __symbols : TcSymbolRegistry;

    /**
     * @internal
     */
    private __log : debug.Debugger = Debug(`TcContext::TcContext`);
}


