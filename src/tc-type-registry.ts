// tc-type-registry.ts
/**
 * Module containing the Type Registry, responsible for fetching the ADS Type Data through the {@link TcContext} Component, processing it
 * and building a Type Map, which can be used later for Symbol Generation.
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

import { ADST, TcTypeInfo, TcTypeInfoMap } from './tc-com';
import { TcType, TcBooleanType, TcNumericType, TcStringType, TcStructType } from './tc-type';
import { TcContext } from './tc-context';
import { TcEmitter, TcTypeRegistryCreatedEvent, TcTypeRegistryDestroyedEvent } from './tc-event';

/**
 * Class responsible for creating and managing the TwinCAT Type Map, which is fetched
 * from the TwinCAT's ADS layer. 
 */
export class TcTypeRegistry extends TcEmitter {

    /**
     * Constructor, which uses the {@link TcContext}'s {@link TcCom} Object for ADS Communication
     * 
     * @param context - Parent {@link TcContext}, of whom `TcTypeRegistry` is a part of, and whom to propagate events to
     * @param debug - If enabled, will produce debug information
     */
    constructor(context : TcContext, debug : boolean = false) {
        super(context);
        this.__context = context;
        this.__log.enabled = debug;

    };

    /**
     * Creates the Type Map, by querying data through {@link TcContext}'s {@link TcCom} Object and processing it.
     * TcCom must be in a valid state before the Type Map creation can be made.
     * 
     * @throws {@link TcComIsInvalidException} - TcCom has not been initialized before creating Type Map
     * @throws {@link TcComTypeQueryException} - Failed to query Type Data
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     */
    async create() {

        this.__log(`create() : Starting creation of Type Registry`);
        const adsTypeDataMap = await this.__context.COM.types();

        for (let [, adsTypeData] of Object.entries(adsTypeDataMap)) {
            await this.__adsTypeRegister(adsTypeData, adsTypeDataMap);
        }

        this.__log(`create() : Finished creation of Type Registry`);
        this.emit('created', new TcTypeRegistryCreatedEvent(this.__context, this, this.__map))
    }

    /**
     * Destroys the previously created Type Map
     */
    destroy() { 
        this.__log(`destroy() : Destroying Type Registry`);
        this.__map = {} 
        this.emit('destroyed', new TcTypeRegistryDestroyedEvent(this.__context, this))
    };

    /**
     * Registers a {@link TcType} created Object as part of the Type Map, under the provided name
     * 
     * @param name - The Type Name of the created `TcType` Object 
     * @param type - The created `TcType` Object to register with the Type Map
     * 
     */
    register(name : string, type : TcType) { 
        this.__log(`register() : Registering Type ${name}`);
        this.__map[name] = type; 
    }

    /**
     * Returns a {@link TcType} of the provided name from the Type Map. If Type does not exist
     * in the Type Map, returns undefined
     * 
     * @param name - The name of the `TcType` to get
     * 
     * @return - Either that Type Data under the provided name, or `undefined` if Type does not exist 
     */
    has(name : string) : TcType | undefined { return this.__map[name]; }


     //----EVENTS...
    /**
     * Emitted when `TcTypeRegistry` creates the Type Map
     * @event created
     */
    on(event : 'created', listener : (e : TcTypeRegistryCreatedEvent) => void) : any;
    
    /**
     * Emitted when `TcTypeRegistry` destroys the Type Map
     * @event destroyed
     */
    on(event : 'destroyed', listener : (e : TcTypeRegistryDestroyedEvent) => void) : any;

    on(eventName : string | symbol, listener : (e : any) => void) : any {
        super.on(eventName, listener);
        return this;
    }

    /**
     * Internal function for processing and registering a `TcType` based on the ADS Type Data collected 
     * previously. If Type is not bindable, it is ignored and not registered.
     * 
     * @param adsTypeData - The ADS Type Data to process and potentially register
     * @param adsTypeDataMap - The full map of ADS Type Data, for parent/child analysis
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the newly registered `TcType`, or `undefined`, if registration failed
     */
    private async __adsTypeRegister(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) : Promise<TcType | undefined> {

        /**
         * The nature of this function is recursive. Because of that check if the Type has already been registered.
         * Filter out types which are unsupported, and process it. If the processing results in `undefined`, skip the registration
         * and delete the ADS Type Data from the ADS Type Data map, to prevent unescape loops.
         */
        const has = this.has(adsTypeData.name)
        if (!has) {

            if (!this.__adsTypeIsPointerOrReference(adsTypeData)) {

                if (!adsTypeDataMap[adsTypeData.name.toLowerCase()]) { return }
    
                const tcType = await this.__adsTypeProcess(adsTypeData, adsTypeDataMap);
                if (tcType) {
                    this.register(adsTypeData.name, tcType);
                    return tcType;
                    
                } else this.__adsTypeDeleteEntry(adsTypeData, adsTypeDataMap);

            } else this.__adsTypeDeleteEntry(adsTypeData, adsTypeDataMap);

        } else return has
    }

    /**
     * Internal function for processing ADS Type Data, after it was initially filtered. 
     * 
     * @param adsTypeData - The ADS Type Data to process
     * @param adsTypeDataMap - The full map of ADS Type Data, for parent/child analysis
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the created `TcType` from the ADS Type Data, or `undefined`, if the Type is not bindable
     */
    private async __adsTypeProcess(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) : Promise<TcType | undefined> {

        /**
         * Check if the ADS Type has a parent. If it does, then perform processing on it, and if the
         * result of parent processing results in success - extend the parent type with the provided ADS
         * Type data. 
         * 
         * If the ADS Type has a parent, but the parent is not registrable - this ADS Type is also not registrable.
         * 
         * If the ADS Type has no parent, then attempt to create the new `TcType` based on its parameters.
         */
        const parent = await this.__adsTypeProcessParent(adsTypeData, adsTypeDataMap);
        if (parent) {
            return parent.extend(adsTypeData);

        } else {

            /**
             * Before processing the Type Data, check if this ADS Type has children. If those
             * children exist - process and register them first
             */
            const children = await this.__adsTypeProcessChildren(adsTypeData, adsTypeDataMap);
            if (this.__adsTypeIsBit(adsTypeData)) {
                return TcBooleanType.create(this.__context, adsTypeData, this.__log.enabled);

            } else if (this.__adsTypeIsNumber(adsTypeData)) {
                return TcNumericType.create(this.__context, adsTypeData, this.__log.enabled);

            } else if (this.__adsTypeIsString(adsTypeData)) {
                return TcStringType.create(this.__context, adsTypeData, this.__log.enabled);
                
            } else if (this.__adsTypeIsStruct(adsTypeData)) {
                if (children.length > 0) {
                    return TcStructType.create(this.__context, adsTypeData, children, this.__log.enabled);
                }
            }

        }
    }

    /**
     * Internal function for checking if an ADS Type Data has a parent, and if so, will attempt to 
     * register that parent
     * 
     * @param adsTypeData - The ADS Type, whose parent is evaluated
     * @param adsTypeDataMap - The full map of ADS Type Data, for parent/child analysis
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the processed parent's registered `TcType` Object, or `undefined` if that processing has failed
     */
    private async __adsTypeProcessParent(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) : Promise<TcType | undefined> {

        const parentAdsTypeData = this.__adsTypeHasParent(adsTypeData, adsTypeDataMap);
        if (parentAdsTypeData) {
            return this.__adsTypeRegister(parentAdsTypeData, adsTypeDataMap);
        }
    }
 
    /**
     * Internal function for checking if an ADS Type Data has children, and if so, will attempt to
     * register all the children associated with this ADS Type
     * 
     * @param adsTypeData - The ADS Type, whose children are evaluated 
     * @param adsTypeDataMap - The full map of ADS Type Data, for parent/child analysis
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - List of registered `TcType` Children with their key. If no children were successfully registered - the list is empty
     */
    private async __adsTypeProcessChildren(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) : Promise<{ key : string, type : TcType }[]> {

        /**
         * Iterate over all the potential children. 
         * If children are not registrable, then remove their entry from the ADS Type Children list
         * to prevent redundant data
         */
        const result : {  key : string, type : TcType }[] = []
        for (let i = 0; i < adsTypeData.subItems?.length; i++) {
            let child = adsTypeData.subItems[i];
            let childTcType : TcType | undefined;
            if (adsTypeDataMap[child.type.toLowerCase()]) {
                childTcType = await this.__adsTypeRegister(adsTypeDataMap[child.type.toLowerCase()], adsTypeDataMap)
            }

            if (childTcType) {

                /**
                 * Make sure to clone the child, so changes to the child don't affect
                 * the original `TcType`
                 */
                const extended = await childTcType.clone(child);
                if (extended) {
                    result.push({ key : child.name, type : extended});

                } else this.__adsTypeDeleteChild(i, adsTypeData);

            } else this.__adsTypeDeleteChild(i, adsTypeData);
        }

        return result;
    }

    /**
     * Internal function for deleting ADS Type Data entry from the full map of ADS Type Data
     * Due to the non-linear pattern of registration, this is useful, as a means of preventing
     * redundant looping
     * 
     * @param adsTypeData - The ADS Type Data to delete from map 
     * @param adsTypeDataMap - The ADS Type Map from which the entry is deleted
     */
    private __adsTypeDeleteEntry(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) { 
        this.__log(`__adsTypeDeleteEntry() : Deleting entry for ${adsTypeData.name}`);
        delete adsTypeDataMap[adsTypeData.name.toLowerCase()]; 
    }

    /**
     * Internal function for deleting ADS Child Type Data from ADS Type.
     * Due to the non-linear pattern of registration, this is useful, as a means of preventing
     * redundant looping
     * 
     * @param index - Index of the ADS Child Type to be deleted  
     * @param adsTypeData - The ADS Type from which the child is deleted
     */
    private __adsTypeDeleteChild(index : number, adsTypeData : TcTypeInfo) { 
        adsTypeData.subItems.splice(index, 1) 
    }

    /**
     * Internal function, which checks if the ADS Type Data is of type `Structure` or `Function_Block`
     * @param adsTypeData - The ADS Type Data, which is checked for being of type `Structure` or `Function_Block`
     * 
     * @return - Is true if ADS Type Data matched queried type
     */
    private __adsTypeIsStruct(adsTypeData : TcTypeInfo) { return adsTypeData.adsDataType === ADST.BIGTYPE && adsTypeData.subItems.length };

    /**
     * Internal function, which checks if the ADS Type Data is of type `BOOL`
     * @param adsTypeData - The ADS Type Data, which is checked for being of type `BOOL`
     * 
     * @return - Is true if ADS Type Data matched queried type
     */
    private __adsTypeIsBit(adsTypeData : TcTypeInfo) { return adsTypeData.adsDataType === ADST.BIT; }

    /**
     * Internal function, which checks if the ADS Type Data is of type `STRING`
     * @param adsTypeData - The ADS Type Data, which is checked for being of type `STRING`
     * 
     * @return - Is true if ADS Type Data matched queried type
     */
    private __adsTypeIsString(adsTypeData : TcTypeInfo) { return adsTypeData.adsDataType === ADST.STRING || adsTypeData.adsDataType === ADST.WSTRING; }

    /**
     * Internal function, which checks if the ADS Type Data is of type Integer or Floating Point Number
     * @param adsTypeData - The ADS Type Data, which is checked for being of type Integer or Floating Point Number
     * 
     * @return - Is true if ADS Type Data matched queried type
     */
    private __adsTypeIsNumber(adsTypeData : TcTypeInfo) {
        switch (adsTypeData.adsDataType) {

            //Numeric cases
            case ADST.INT8: case ADST.UINT8: case ADST.INT16: case ADST.UINT16: case ADST.INT32:
            case ADST.UINT32: case ADST.INT64: case ADST.UINT64: case ADST.REAL32: case ADST.REAL64:
                return true;
            
            default: return false;
        }
    }

    /**
     * Internal function, which check if the provided ADS Type Data, has a parent associated
     * with it
     * 
     * @param adsTypeData - The ADS Type to check for parent presence
     * @param adsTypeDataMap - The full ADS Type Map, where the parent's existence is checked
     * 
     * @return - The parents ADS Type Data if it exists, else `undefined`
     */
    private __adsTypeHasParent(adsTypeData : TcTypeInfo, adsTypeDataMap : TcTypeInfoMap) : TcTypeInfo | undefined {
        if ( adsTypeData.type !== '' && adsTypeData.type !== adsTypeData.name) {

            const parent = adsTypeDataMap[adsTypeData.type.toLowerCase()];
            if (parent?.adsDataType === adsTypeData.adsDataType) {
                return parent;
            }

        }
    }

    /**
     * Internal function, which filters out Pointers and References
     * 
     * @param adsTypeData - The ADS Type Data, which is checked for being either a Pointer or a Reference
     * 
     * @return - Is true if the passed ADS Type Data is of type Pointer or Reference
     */
    private __adsTypeIsPointerOrReference(adsTypeData : TcTypeInfo) {
        return (adsTypeData.name.startsWith('POINTER TO ') || adsTypeData.name.startsWith('REFERENCE TO '))
    }


    /**
     * Will store the created Type Map
     * @internal
     */
    private __map : { [ key : string ] : TcType } = {};

    /**
     * The `TcContext`, which acts as a parent to the `TcTypeRegistry` and to whom events are propagated
     * @internal
     */
    private __context : TcContext;

    /**
     * @internal
     */
    private __log : debug.Debugger = Debug(`TcContext::TcTypeRegistry`);

}
