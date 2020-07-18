// tc-symbol-registry.ts
/**
 * Module containing the Symbol Registry, responsible for fetching the ADS Symbol Data through the {@link TcContext} Component, processing it
 * and building a Symbol Map, which is based on the Type Data from the {@link TcContext}'s `TcTypeRegistry`
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

import * as TcEvents from "./tc-event";
import { TcContext } from './tc-context';
import { TcSymbol, TcNamespaceSymbol } from './tc-symbol';


/**
 * Class responsible for creating and managing the TwinCAT Symbol map, which is fetched
 * from the TwinCAT's Target PLC and processed through the previously created `TcTypeRegistry` of
 * the `TcContext`
 */
export class TcSymbolRegistry extends TcEvents.TcEmitter {

    /**
     * Constructor, which used the {@link TcContext}'s {@link TcCom} Object for ADS Communication and the
     * {@link TcContext}'s {@link TcTypeRegistry} form Symbol Map generation
     * 
     * @param context - Parent {@link TcContext}, of whom `TcSymbolRegistry` is a part of, and whom to propagate events to
     * @param debug - If enabled, will produce debug information
     */
    constructor(context : TcContext, debug : boolean = false) {
        super(context);
        this.__context = context;
        this.__log.enabled = debug;
    }
    
    /**
     * Access the created ${@link TcSymbol} Map
     */
    get namespaces() : { [ key : string ] : TcNamespaceSymbol } { return this.__map; };


    /** 
     * Fetches the ADS Symbol Data and creates the Symbol Map based on the Type Information,
     * registered by the `TcContext`
     * 
     * @throws {@link TcComIsInvalidException} - TcCom has not been initialized before creating Symbol Map
     * @throws {@link TcComSymbolQueryException} - Failed to query Symbol Data
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
    */
    async create()  {
        
        this.__log(`create() : Starting creation of Symbol Registry`);
        const adsSymbolDataMap = await this.__context.COM.symbols();

        const promises : Promise<any>[] = [];
        for (let [, adsSymbolData] of Object.entries(adsSymbolDataMap)) {


            const type = this.__context.types.has(adsSymbolData.type);
            if (type) {

                //The namespace of the Symbol is of format <namespace>.<symbol name>
                const [namespace, symbolName] = adsSymbolData.name.split('.');

                //If namespace does not exist - create it
                if (!this.__map[namespace]) {
                    this.__map[namespace] = new TcNamespaceSymbol(namespace, this.__context, this, this.__log.enabled)
                }
                
                //Create the child object and then attach it to the Namespace
                promises.push(type.clone(adsSymbolData).then(newType => {
                    if (newType) {
                        const symbol = newType.instance(adsSymbolData.name, this.__map[namespace], adsSymbolData, this.__log.enabled)
                        TcNamespaceSymbol.addChild(this.__map[namespace], { key : symbolName, symbol : symbol })
                    }
                }))
            }
        }

        await Promise.all(promises);
        this.__log(`create() : Finished creation of Symbol Registry`);
        this.emit('created', new TcEvents.TcSymbolRegistryCreatedEvent(this.__context, this, this.__map))
    }

    /**
     * Destroys the created Symbol Map, by invalidating all the created `TcSymbols` and `TcNamespaces`
     * and cleaning the internal map
     */
    destroy() { 
        
        this.__log(`destroy() : Destroying Type Registry`);
        for (let [, namespace] of Object.entries(this.__map)) {
            TcSymbol.invalidate(namespace);
        }
        this.__map = {}
        this.emit('destroyed', new TcEvents.TcSymbolRegistryDestroyedEvent(this.__context, this))

    }

    //----EVENTS...
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
     * The `TcContext`, which acts as a parent to the `TcSymbolRegistry` and to whom events are propagated
     * @internal
     */
    private __context : TcContext;

    /**
     * Stores the map of Symbols
     * @internal
     */
    private __map : { [ key : string ] : TcNamespaceSymbol } = {};

    /**
     * @internal
     */
    private __log : debug.Debugger = Debug(`TcContext::TcSymbolRegistry`);

}

