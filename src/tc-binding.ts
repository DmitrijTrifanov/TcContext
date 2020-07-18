// tc-binding.ts
/**
 * Module, which contains the definitions of all types of Bindings, which act as a layer between `TcSymbol` and the
 * `TcCom` Object. It manages type checking, all the communication, and event emission, as well as memory locations, which
 * are associated with the `TcSymbol`
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
import Check from 'check-types';

import { TcContext } from './tc-context';
import { TcType, TcNumericType, TcStringType, TcEnumType } from './tc-type'
import { TcSymbolPointer, TcDataPackage, TcSubscription, TcEnumBuffers, ADST } from './tc-com';
import { TcBindingIsInvalidException, TcBindingInvalidTypeException, TcBindingOutOfRangeException, TcBindingReadOnlyException  } from './tc-exception';
import { TcEvent, TcEmitter } from './tc-event';
import { TcSymbol } from './tc-symbol';

/**
 * Class which acts as an abstraction layer between a `TcSymbol` and the `TcCom` layer.
 * It is responsible for value conversion to Data and from it, as well as Type Checking,
 * storing all the Memory location which must be read, how to execute clearing of a Symbol.
 * 
 * By itself, the `TcBinding` also acts as a Symbol Pointer, which is used for subscribing
 * for change notifications
 * 
 * Lastly, it is also the EventEmitter for the `TcSymbol`
 * 
 */
export abstract class TcBinding extends TcEmitter implements TcSymbolPointer {

    /**
     * Constructor for a Binding with no information on memory location, but definition of its components
     * and different parameters, used by derived classes
     * 
     * @param context - The `TcContext` which owns this binding
     * @param symbol - The `TcSymbol` which owns this binding
     * @param parent - Parent Emitter, to whom a event will be propagate to
     * @param onSet - Alias, which to use in place of 'set'
     * @param onGet - Alias, which to use in place of 'get'
     * @param onClear - Alias, which to use in place of 'cleared'
     * @param onChange - Alias, which to use in place of 'changed'
     * @param debug - If enabled, will produce debug information
     */
    constructor(context : TcContext, symbol : TcSymbol, parent : TcEmitter, onSet? : string, onGet? : string, onClear? : string, onChange? : string, debug : boolean = false) {
        super(parent);
        this.__context = context;
        this.__symbol = symbol;
        this.__isValid = true;
        this.__log.enabled = debug;
        this.__onSet = onSet || 'set';
        this.__onGet = onGet || 'get';
        this.__onClear = onClear || 'cleared';
        this.__onChange = onChange || 'changed';
        this.__log(`Creating TcBinding[${this.__symbol.$path}]`);
    }

    /**
     * Index Group of this `TcBinding`
     */
    get indexGroup() : number { return this.__indexGroup };

    /**
     * Index Offset of this `TcBinding`
     */
    get indexOffset() : number { return this.__indexOffset };

    /**
     * Size of the Symbol, this `TcBinding` points to
     */
    get size() : number { return this.__size };

    /**
     * The `TcSymbol` owner of this `TcBinding`
     */
    get symbol() : TcSymbol { return this.__symbol };

    /**
     * The `TcContext` owner of this `TcBinding`
     */
    get context() : TcContext { return this.__context };

    /**
     * Flag, when if true, `TcBinding` is valid
     */
    get isValid() : boolean { return this.__isValid }

    /**
     * Flag, when if true, `TcBinding` is ReadOnly an no write operation can be invoked
     */
    get readOnly() : boolean { return this.symbol.$readOnly };

    /**
     * Performs a read of all the Memory Pointers, belonging to this `TcBinding`
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComDataReadException} - Failed to read data pointers 
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @return - Values, of the Target PLC Symbol, which belong to this `TcBinding`
     * 
     */
    async read() : Promise<any> { 

        this.__log(`read() : Reading from TcBinding[${this.symbol.$path}]`);
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to read an Invalidated TcBinding[${this.symbol.$path}]`);
        const result = await this.context.COM.read(this.readPackages).then(dataPackages => this.fromRaw(dataPackages));

        this.__log(`read() : Completed reading TcBinding[${this.symbol.$path}]`);
        this.__log(result);
        return result;

    }

    /**
     * Performs a write operation by converting values to memory locations and data to send,
     * which are part of this `TcBinding`
     * 
     * @param value - The value that is to be written to the `TcBinding`
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * @throws {@link TcBindingInvalidTypeException} - Type mismatch with one a value, that is to be written
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComDataWriteException} - Failed to write data packages
     * @throws {@link TcComToRawException} - Failed to convert the Raw Data
     * 
     * @return - The value which was written to the Target PLC Symbol, which belong to this `TcBinding`
     * 
     */
    async write(value : any) : Promise<any> {

        this.__log(`write() : Writing to TcBinding[${this.symbol.$path}]`);
        this.__log(value);
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to write to an Invalidated TcBinding[${this.symbol.$path}]`);
        await this.toRaw(value).then(dataPackages => this.context.COM.write(dataPackages));

        this.__log(`write() : Completed writing TcBinding[${this.symbol.$path}]`);
        return value;
    }

    /**
     * Clears the data of all non-ReadOnly `TcBindings`, which belong to this `TcBinding`
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to clear a ReadOnly `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataWriteException} - Failed to write data packages
     * 
     */
    async clear() : Promise<void> {

        this.__log(`clear() : Clearing to TcBinding[${this.symbol.$path}]`);
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to clear an Invalidated TcBinding[${this.symbol.$path}]`);
        if (this.readOnly) throw new TcBindingReadOnlyException(this.context, this, `Attempting to clear a Readonly TcBinding[${this.symbol.$path}]`)

        await this.context.COM.write(this.clearPackages);
        
        this.__log(`write() : Completed clearing TcBinding[${this.symbol.$path}]`);
        return;

    }

    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value : any) {
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to convert Data to TcDataPackage using an Invalidated TcBinding[${this.symbol.$path}]`);
        if (this.readOnly) throw new TcBindingReadOnlyException(this.context, this, `Attempting to write to a Readonly TcBinding[${this.symbol.$path}]`)
    }


    /**
     * Emits a 'set' event, unless it was aliased to a custom name
     * 
     * @param data - The data, to pass along with the event
     */
    emitSet(data : TcEvent) { this.emit(this.__onSet, data) }    
    
    /**
    * Emits a 'get' event, unless it was aliased to a custom name
    * 
    * @param data - The data, to pass along with the event
    */
    emitGet(data : TcEvent) { this.emit(this.__onGet, data) }
    
    /**
    * Emits a 'cleared' event, unless it was aliased to a custom name
    * 
    * @param data - The data, to pass along with the event
    */
    emitCleared(data : TcEvent) { this.emit(this.__onClear, data) }
    
    /**
    * Emits a 'changed' event, unless it was aliased to a custom name
    * 
    * @param data - The data, to pass along with the event
    */
    emitChange(data : TcEvent) { this.emit(this.__onChange, data) }


    /**
     * Performs a subscription of this `TcBinding` for monitoring value change
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComSubscribeException} - Failed to subscribe to the provided pointer
     * 
     * @param sampling - The speed at which change is detected
     * @param callback - Callback, which is invoked when a change does happened
     */
    async subscribe(sampling : number, callback : (value : any) => void) {

        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to subscribe to an Invalidated TcBinding[${this.symbol.$path}]`);
        if (!this.__subscription) {

            this.__subscription = await this.context.COM.subscribe(sampling, this, async () => {

                this.__log(`subscribe#callback() : Received change event TcBinding ${this.symbol.$path}`)

                if (callback) {
                    const result = await this.read();
                    callback(result);
                }
            })

            this.__log(`subscribe() : Successfully subscribed to TcBinding TcBinding[${this.symbol.$path}]`);

        } else this.__log(`subscribe() : Attempting to subscribe to an already subscribed TcBinding[${this.symbol.$path}]`)
    }

    /**
     * Unsubscribes this `TcBinding` from monitoring value changes
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComUnsubscribeException} - Failed to unsubscribe the handle
     */
    async unsubscribe() {

        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to unsubscribe from an Invalidated TcBinding[${this.symbol.$path}]`);
        if (this.__subscription) {

            await this.context.COM.unsubscribe(this.__subscription);
            this.__subscription = undefined;
            
            this.__log(`unsubscribe() : Successfully unsubscribed from TcBinding TcBinding[${this.symbol.$path}]`);

        } else this.__log(`unsubscribe() : Attempting to unsubscribe from an already unsubscribed TcBinding[${this.symbol.$path}]`)
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    abstract async fromRaw(dataPackages : TcDataPackage[]) : Promise<any>

    /**
     * Converts Values to ADS Data Packages
     * 
     * @param value - The value which is to be converted
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * @throws {@link TcBindingInvalidTypeException} - Type mismatch with one a value, that is to be written
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComToRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    abstract async toRaw(value : any) : Promise<TcDataPackage[]>

    /**
     * Get all the Data Packages, needed to perform a clear operation
     */
    get clearPackages() : TcDataPackage[] { return this.__clearPackages };

    /**
     * Get all the Memory Pointers, needed to perform a read operation
     */
    get readPackages() : TcSymbolPointer[] { return this.__readPackages };

    /**
     * Stores an array of memory locations, which can be read
     * @internal
     */
    protected __readPackages : TcSymbolPointer[] = [];

    /**
     * Invalidates the provided `TcBinding`
     * 
     * @param binding - The `TcBinding`, which is to be invalidated
     */
    static invalidate(binding : TcBinding) {
        binding.__isValid = false;
    }
    
    /**
     * Stores an array of data packages locations, which can be used to clear the `TcBinding`
     * @internal
     */
    protected __clearPackages : TcDataPackage[] = [];

    /**
     * @internal
     */
    private __isValid : boolean;

    /**
     * @internal
     */
    private __context : TcContext;
    
    /**
     * @internal
     */
    private __onSet : string;
    
    /**
     * @internal
     */
    private __onGet : string;
    
    /**
     * @internal
     */
    private __onClear : string;
    
    /**
     * @internal
     */
    private __onChange : string;
    
    /**
     * @internal
     */
    private __subscription? : TcSubscription;
    
    /**
     * @internal
     */
    private __symbol : TcSymbol;

    /**
     * @internal
     */
    protected __indexGroup : number = 0;
    
    /**
     * @internal
     */
    protected __indexOffset : number = 0;
    
    /**
     * @internal
     */
    protected __size : number = 0;
    
    /**
     * @internal
     */
    protected __log : debug.Debugger = Debug(`TcContext::TcBinding`);
}

/**
 * Base class for `TcBindings` used on Target PLC Symbols. This excludes `PROGRAMS` and
 * variable lists
 */
export abstract class TcSymbolBinding extends TcBinding  {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcType, parent : TcEmitter, debug : boolean = false) {
        super(parameters.context, symbol, parent, parameters.onGet, parameters.onSet, parameters.onClear, parameters.onChange, debug);
        this.__indexGroup = pointer.indexGroup;
        this.__indexOffset = pointer.indexOffset;
        this.__size = pointer.size;
    }


}

/**
 * Base class for `TcBindings` used on PlC Symbols, that are not structured.
 * This excludes `Structures`, `Function_Blocks` and `Unions`
 * 
 * `TcSimpleBinding` have an explicit default value
 */
abstract class TcSimpleBinding extends TcSymbolBinding {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcType, parent : TcEmitter, debug : boolean = false) {
        super(symbol, pointer, parameters, parent, debug);
        this.__defaultValue = parameters.defaultBuffer;
        this.__type = parameters.name
        this.__readPackages.push({indexGroup : pointer.indexGroup, indexOffset : pointer.indexOffset, size : pointer.size})
        if (this.__defaultValue !== undefined) {
            this.__clearPackages.push({indexGroup : this.indexGroup, indexOffset : this.indexOffset, data : this.__defaultValue})
        }
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(dataPackages : TcDataPackage[]) : Promise<boolean | number | bigint | string | { name : string }> {
        
        this.__log(`fromRaw() : Parsing Data Package for TcBinding[${this.symbol.$path}]`);
        
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to convert TcDataPackage using an Invalidated TcBinding[${this.symbol.$path}]`);
        if (dataPackages.length > 1) throw new TcBindingOutOfRangeException(this.context, this, `Attempting to convert TcDataPackage length greater than 1 to a Simple TcBinding[${this.symbol.$path}]`);

        const value = await this.context.COM.fromRaw(this.__type, dataPackages[0].data);

        this.__log(`fromRaw() : Parsed Data Package to value ${value} for TcBinding ${this.symbol.$path}`);
        return value
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async toRaw(value : boolean | number | bigint | string) : Promise<TcDataPackage[]> {
        
        this.__log(`toRaw() : Parsing value ${value} to Raw for TcBinding[${this.symbol.$path}]`);

        this.checkInput(value);
        const result = await this.context.COM.toRaw(this.__type, value).then(buffer => [{indexGroup : this.indexGroup, indexOffset : this.indexOffset, data : buffer}])

        this.__log(`toRaw() : Parsed value ${value} to Raw for TcBinding[${this.symbol.$path}]`);
        return result;
    }

    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value :  boolean | number | bigint | string) {
        super.checkInput(value);
        if (!Check.primitive(value) && !Check.instance(value, BigInt)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a structured Value to a Simple TcBinding[${this.symbol.$path}]`)
    }

    /**
     * @internal
     */
    protected __type : string

    /**
     * @internal
     */
    private __defaultValue? : Buffer;
}

/**
 * Base class for `TcBindings´ used for PLC Symbols of Type `Structure`, `Function_Block` and `Union`
 */
abstract class TcComplexBinding extends TcSymbolBinding {

    /**
     * Internal method, for adding a Child `TcBinding` to a specified `TcComplexBinding`
     * 
     * @param binding - The binding, to which the child is added
     * @param child  - The child, which is to be added to the binding
     * 
     * @internal
     */
    static addChild(binding : TcComplexBinding, child : { key : string | number, binding : TcSymbolBinding }) {
        binding.__addChild(child);
    }

    /**
     * Internal method, for adding a Child `TcBinding` as part of this `TcComplexBinding`
     * 
     * @param child - The Child that is to be added
     */
    protected __addChild(child : { key : string | number, binding : TcSymbolBinding }) {
        this.__childrenBindings[child.key] = child.binding;
        this.__clearPackages.push(...child.binding.clearPackages);
        this.__readPackages.push(...child.binding.readPackages);
    }

    /**
     * @internal
     */
    protected __childrenBindings : { [name : string] : TcSymbolBinding } = {};
    
}

/**
 * `TcBinding` for attaching to `BOOL` PLC Symbol
 */
export class TcBooleanBinding extends TcSimpleBinding {

    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value :  boolean) {
        super.checkInput(value);
        if (!Check.boolean(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-boolean Value to a Boolean TcBinding[${this.symbol.$path}]`)
    }
}

/**
 * `TcBinding` for attaching to Numeric PLC Symbols
 */
export class TcNumericBinding extends TcSimpleBinding {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcNumericType, parent : TcEmitter, debug : boolean = false) {
        super(symbol, pointer, parameters, parent, debug);
        this.__adst = parameters.adst;
        this.__upperBorder = parameters.upperBorder;
        this.__lowerBorder = parameters.lowerBorder;
    }

    /**
     * Access the maximum value, that is safe to write to Symbol
     */
    get upperBorder() : number | bigint { return this.__upperBorder };

    /**
     * Access the minimum value, that is safe to write to Symbol
     */
    get lowerBorder() : number | bigint { return this.__lowerBorder };
    
    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value : number | bigint) {
        super.checkInput(value);
        if ((this.__adst === ADST.UINT64 || this.__adst === ADST.INT64) && !Check.instance(value, BigInt)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-BigInt value to Numeric TcBinding[${this.symbol.$path}]`);
        if (this.__adst !== ADST.UINT64 && this.__adst !== ADST.INT64 && !Check.number(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-number value to Numeric TcBinding[${this.symbol.$path}]`);
        if (value > this.__upperBorder || value < this.__lowerBorder) throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write value, which is outside of range [ ${this.__lowerBorder}:${this.__upperBorder} ] to Numeric TcBinding[${this.symbol.$path}]`);
        
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(value : TcDataPackage[]) : Promise<number | bigint> {
        const result = await super.fromRaw(value) as number | bigint;
        return (this.__adst !== ADST.UINT64) ? result : BigInt.asUintN(64, result as bigint)
    }

    /**
     * @internal
     */
    private __adst : number;

    /**
     * @internal
     */
    private __upperBorder : number | bigint ;

    /**
     * @internal
     */
    private __lowerBorder : number | bigint ;

}

/**
 * `TcBinding` for attaching to `STRING` or `WSTRING` PLC Symbols
 */
export class TcStringBinding extends TcSimpleBinding {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcStringType, parent : TcEmitter, debug : boolean = false) {
        super(symbol, pointer, parameters, parent, debug);
        this.__length = parameters.length;
    }

    /**
     * Access the maximum length of a string, that is safe to write to the PLC Symbol
     */
    get length() : number { return this.__length };

    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value :  string) {
        super.checkInput(value);
        if (!Check.string(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-string Value to a String TcBinding[${this.symbol.$path}]`)
        if (value.length > this.__length) throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write a string longer than ${this.__length} to a String TcBinding[${this.symbol.$path}]`)
    }

    /**
     * @internal
     */
    private __length : number;
}

/**
 * `TcBinding` for attaching to `ENUM` PLC Symbols
 */
export class TcEnumBinding extends TcSimpleBinding {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcEnumType, parent : TcEmitter, debug : boolean = false) {
        super(symbol, pointer, parameters, parent, debug);
        this.__fields = parameters.fields;
        this.__buffers = parameters.buffers;
    }

    /**
     * Access the fields, which are allowed to be written to the PLC Symbol
     */
    get fields() : string[] { return this.__fields };

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(value : TcDataPackage[]) : Promise<string> {
        const result = (await super.fromRaw(value)) as { name : string };
        return `${this.__type}.${result.name }`
    }


    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async toRaw(value : string) : Promise<TcDataPackage[]> {
        super.checkInput(value);
        if (!Check.string(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-enum Value to an Enum TcBinding[${this.symbol.$path}]`) 
        if (!this.__buffers[value]) throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write a non-existent enum field to an Enum TcBinding[${this.symbol.$path}]`)
        return [{ indexGroup : this.indexGroup, indexOffset : this.indexOffset, data : this.__buffers[value]}]
    }    
    
    /**
     * @internal
     */
    private __fields : string[];

    /**
     * @internal
     */
    private __buffers : TcEnumBuffers = {};
}

/**
 * `TcBinding` for attaching to `Structures`, `Function_Blocks` or `Unions` PLC Symbols
 */
export class TcStructureBinding extends TcComplexBinding {

    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value : { [ key : string ] : any }) {
        super.checkInput(value);
        if (!Check.object(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-structured Value to a Structured TcBinding[${this.symbol.$path}]`)
    }


    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(dataPackages : TcDataPackage[]) : Promise<{ [ key : string ] : any }> {
        
        this.__log(`fromRaw() : Parsing Data Package for Structured TcBinding[${this.symbol.$path}]`);
        
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to convert TcDataPackage using an Invalidated TcBinding[${this.symbol.$path}]`);
        const result : { [ key : string ] : any } = {};
        const promises : Promise<any>[] = [];
        let start : number = 0;

        for (let [memberName, memberValue] of Object.entries(this.__childrenBindings)) {

            this.__log(`fromRaw() : -> Accessing [${memberName}] Child for Value conversion of TcBinding[${this.symbol.$path}]`);

            let length = memberValue.readPackages.length;
            result[memberName] = undefined;
            promises.push(memberValue.fromRaw(dataPackages.slice(start, start + length)).then(convertedValue => { result[memberName] = convertedValue }));
            start += length;
        }

        await Promise.all(promises);

        this.__log(`fromRaw() : Parsed Data Package for Structured TcBinding[${this.symbol.$path}]`);
        return result
    }


    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async toRaw(value : { [ key : string ] : any }) : Promise<TcDataPackage[]> {
        
        
        this.__log(`toRaw() : Parsing structured value to Raw for Structured TcBinding[${this.symbol.$path}]`);

        this.checkInput(value);
        let promises : Promise<TcDataPackage[]>[] = [];
        for (let [memberName, memberValue] of Object.entries(value)) {
            
            this.__log(`toRaw() : -> accessing [${memberValue.key}] Member for Raw conversion of TcBinding[${this.symbol.$path}]`);

            const child = this.__childrenBindings[memberName];
            if (child) {
                promises.push(child.toRaw(memberValue));

            } else throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write a non-existing Member field [${memberName}] of TcBinding[${this.symbol.$path}]`)

        }

        return Promise.all(promises).then(dataPackages => {
            this.__log(`toRaw() : Parsed Value for Structured TcBinding[${this.symbol.$path}]`);
            const result : TcDataPackage[] = [];
            dataPackages.forEach(dataPackage => result.push(...dataPackage));
            return result;
        })

    }

    
    /**
     * Will attempt to invoke the provided method, based on the variable path and the method name, with the 
     * provided arguments.
     * 
     * As of now, no type checking is performed on the passed arguments, and this function acts as a simple through put
     * to the `TcCom` Module
     * 
     * @param path - The full path to the `Function_Block`, whose method is called
     * @param method - The method name, that is to be called
     * @param args - All the arguments, as an object, that are passed to the method
     * 
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComMethodCallException} - Failed to call the Rpc Method on the PLC Side
     * 
     * @return - The result of the method call
     * 
     */
    async callMethod(path : string, method : string, args : any ) : Promise<{result : any, outputs? : any }> {
        return this.context.COM.callMethod(path, method, args);
    }
}

/**
 * `TcBinding` for attaching to `ARRAY OF...` PLC Symbols
 */
export class TcArrayBinding extends TcComplexBinding {

    /**
     * Constructs a binding with information of the Symbol location, and the default Type Parameters
     * 
     * @param symbol - The `TcSymbol` which owns this binding
     * @param pointer - The memory location in the PLC, where the Symbol is located
     * @param parameters - Symbol Type data
     * @param dimension - The dimension definition of this Array Symbol
     * @param parent - The parent of this Symbol, to whom events are propagated
     * @param debug - If enabled, will produce debug information
     */
    constructor(symbol : TcSymbol, pointer : TcSymbolPointer, parameters : TcType, dimension : { startIndex : number, length : number }, parent : TcEmitter, debug : boolean = false) {
        super(symbol, pointer, parameters, parent, debug);    
        this.__startIndex = dimension.startIndex;
        this.__length = dimension.length;
    }
    
    /**
     * Access the Start Index of this Array
     */
    get startIndex() : number { return this.__startIndex };

    /**
     * Access the length of this Array
     */
    get length() : number { return this.__length }

    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value : any[]) {
        super.checkInput(value);
        if (!Check.array(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-array Value to an Array TcBinding[${this.symbol.$path}]`)
        if (value.length > this.__length) throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write an array of length [${value.length}] to a Array of length ${this.__length} of TcBinding[${this.symbol.$path}]`)
    }


    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async toRaw(value : any[]) : Promise<TcDataPackage[]> {

        this.__log(`toRaw() : Parsing array value to Raw for Array TcBinding[${this.symbol.$path}]`);

        this.checkInput(value);
        let promises : Promise<TcDataPackage[]>[] = [];
        value.forEach((indexedValue, index) => {
            
            this.__log(`toRaw() : -> accessing [${index + this.__startIndex}] Index for Raw conversion of TcBinding[${this.symbol.$path}]`);
            const child = this.__childrenBindings[index + this.__startIndex];
            if (child) {
                promises.push(child.toRaw(indexedValue));

            } else throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write a non-existing Index field [${index + this.__startIndex}] of TcBinding[${this.symbol.$path}]`)

        })

        this.__log(`toRaw() : Parsed Value for Array TcBinding[${this.symbol.$path}]`);

        return Promise.all(promises).then(dataPackages => {
            const result : TcDataPackage[] = [];
            dataPackages.forEach(dataPackage => result.push(...dataPackage));
            return result;
        })
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(dataPackages : TcDataPackage[]) : Promise<any[]> {
        
        this.__log(`fromRaw() : Parsing Data Package for Array TcBinding[${this.symbol.$path}]`);
        
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to convert TcDataPackage using an Invalidated TcBinding[${this.symbol.$path}]`);
        const result : any[] = [];
        const promises : Promise<any>[] = [];
        let start : number = 0;

        for (let [memberName, memberValue] of Object.entries(this.__childrenBindings)) {

            this.__log(`fromRaw() : -> accessing [${memberName}] Index for Value conversion of TcBinding[${this.symbol.$path}]`);

            let length = memberValue.readPackages.length;
            result[parseInt(memberName) - this.__startIndex] = undefined;
            promises.push(memberValue.fromRaw(dataPackages.slice(start, start + length)).then(convertedValue => { result[parseInt(memberName) - this.__startIndex] = convertedValue }));
            start += length;
        }

        await Promise.all(promises);
        this.__log(`fromRaw() : Parsed Data Package for Array TcBinding[${this.symbol.$path}]`);
        return result

    }
   
    /**
     * @internal
     */
    private __startIndex : number;

    /**
     * @internal
     */
    private __length : number
}

/**
 * `TcBinding` for attaching to `PROGRAMS` or `Variable Lists` PLC Symbols.
 * 
 * The `TcNamespaceBinding` is unique, because it has no parent - it is the entry point,
 * as well as its Memory Definition is based on the Children passed to it
 */
export class TcNamespaceBinding extends TcBinding {

    /**
     * Constructor a namespace Binding, which will grow and adjust, as children are added to it
     * 
     * @param context - The `TcContext` which owns this binding
     * @param symbol - The `TcSymbol` which owns this binding
     * @param parent - Parent Emitter, to whom a event will be propagate to
     * @param debug - If enabled, will produce debug information
     */
    constructor(context : TcContext, symbol : TcSymbol, parent : TcEmitter, debug : boolean = false) {
        super(context, symbol, parent, undefined, undefined, undefined, undefined, debug);
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async fromRaw(dataPackages : TcDataPackage[]) : Promise<{ [ key : string ] : any }> {
        
        this.__log(`fromRaw() : Parsing Data Package for Namespace TcBinding[${this.symbol.$path}]`);
        
        if (!this.isValid) throw new TcBindingIsInvalidException(this.context, this, `Attempting to convert TcDataPackage using an Invalidated TcBinding[${this.symbol.$path}]`);
        const result : { [ key : string ] : any } = {};
        const promises : Promise<any>[] = [];
        let start : number = 0;

        for (let [memberName, memberValue] of Object.entries(this.__childrenBindings)) {

            this.__log(`fromRaw() : -> Accessing [${memberName}] Child for Value conversion of TcBinding[${this.symbol.$path}]`);

            let length = memberValue.readPackages.length;
            result[memberName] = undefined;
            promises.push(memberValue.fromRaw(dataPackages.slice(start, start + length)).then(convertedValue => { result[memberName] = convertedValue }));
            start += length;
        }

        await Promise.all(promises);

        this.__log(`fromRaw() : Parsed Data Package for Namespace TcBinding[${this.symbol.$path}]`);
        return result
    }

    /**
     * Converts Data Packages from ADS to Values
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting to use an invalid `TcBinding`
     * @throws {@link TcBindingOutOfRangeException} - Failure splitting reading buffer
     * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
     * @throws {@link TcComFromRawException} - Failed to convert the Raw Data
     * 
     * @param dataPackages - The ADS Data packages, that are to be transformed
     */
    async toRaw(value : { [ key : string ] : any }) : Promise<TcDataPackage[]> {
        
        
        this.__log(`toRaw() : Parsing structured value to Raw for Namespace TcBinding[${this.symbol.$path}]`);

        this.checkInput(value);
        let promises : Promise<TcDataPackage[]>[] = [];
        for (let [memberName, memberValue] of Object.entries(value)) {
            
            this.__log(`toRaw() : -> accessing [${memberValue.key}] Member for Raw conversion of TcBinding[${this.symbol.$path}]`);

            const child = this.__childrenBindings[memberName];
            if (child) {
                promises.push(child.toRaw(memberValue));

            } else throw new TcBindingOutOfRangeException(this.context, this, `Attempting to write a non-existing Member field [${memberName}] of TcBinding[${this.symbol.$path}]`)

        }

        return Promise.all(promises).then(dataPackages => {
            this.__log(`toRaw() : Parsed Value for Namespace TcBinding[${this.symbol.$path}]`);
            const result : TcDataPackage[] = [];
            dataPackages.forEach(dataPackage => result.push(...dataPackage));
            return result;
        })

    }

    
    /**
     * Checks the input, to see if it valid and can be safely written to the Target PLC
     *  
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcBindingReadOnlyException} - Attempting to write to a ReadOnly `TcBinding`
     * 
     * @param value - The value to check for validity
     */
    checkInput(value : { [ key : string ] : any }) {
        super.checkInput(value);
        if (!Check.object(value)) throw new TcBindingInvalidTypeException(this.context, this, `Attempting to write a non-structured Value to a Namespace TcBinding[${this.symbol.$path}]`)
    }


    /**
     * Internal method, for adding a Child `TcSymbolBinding` as part of this `TcNamespaceBinding`
     * 
     * The method also readjusts the indexOffset and size of this `TcNamespaceBinding`
     * 
     * @param child - The Child that is to be added
     */
    private __addChild(child : { key : string | number, binding : TcSymbolBinding }) {

        this.__childrenBindings[child.key] = child.binding;
        this.__clearPackages.push(...child.binding.clearPackages);
        this.__readPackages.push(...child.binding.readPackages);

        //Compute the index Offsets and Group
        if (this.__indexGroup === 0) {
            this.__indexGroup = child.binding.indexGroup;

        } else if (this.__indexGroup !== child.binding.indexGroup) {
            throw new Error('IndexGroup of Namespace is invalid. Unsupported situation')
        }

        if (this.__indexOffset === 0) {
            this.__indexOffset = child.binding.indexOffset;
            this.__size = child.binding.size;
        
        } else {

            if (this.__indexOffset + this.size < child.binding.indexOffset) {
                this.__size = child.binding.indexOffset - this.__indexOffset + child.binding.size;

            } else if (this.__indexOffset > child.binding.indexOffset) {
                this.__size = this.__indexOffset - child.binding.indexOffset + this.size;
                this.__indexOffset = child.binding.indexOffset;
            }
        }
    }

    /**
     * Internal method, for adding a Child `TcSymbolBinding` as part of this `TcNamespaceBinding`
     * 
     * @param child - The Child that is to be added
     */
    static addChild(binding : TcNamespaceBinding, child : { key : string | number, binding : TcSymbolBinding }) {
        binding.__addChild(child);
    }

    /**
     * @internal
     */
    private __childrenBindings : { [name : string] : TcSymbolBinding } = {};

}