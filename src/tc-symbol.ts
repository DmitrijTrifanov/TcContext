// tc-symbol.ts
/**
 * Module, which contains the definitions of all the `TcSymbols` and their derived types, through which data manipulation with the
 * Target PLC is made. The `TcSymbols` act as the interface between the `TcContext` and the `TcBindings`, where the `TcBindings` 
 * manage all the data parsing, checking and Symbol memory location, while the `TcSymbol` itself, as a wrapper for those bindings
 * and collection of children Symbols. 
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

import { TcContext } from './tc-context'
import { TcSymbolGetEvent, TcSymbolSetEvent, TcSymbolClearedEvent, TcSymbolChangedEvent, TcEmitter } from './tc-event';
import { TcSymbolBinding, TcBooleanBinding, TcNumericBinding, TcStringBinding, TcEnumBinding, TcStructureBinding, TcArrayBinding, TcNamespaceBinding, TcBinding } from './tc-binding';
import { TcBooleanType, TcNumericType, TcStringType, TcEnumType, TcStructType, TcArrayType } from './tc-type'
import { TcSymbolPointer } from './tc-com'

/**
 * Invokes a Rpc Method of a `Function_Block`, with the provided arguments
 * 
 * @param args - All the arguments, as an object, that are passed to the method
 * 
 * @throws {@link TcComIsInvalidException} - Attempted to use an Invalid `TcCom` Object for subscription
 * @throws {@link TcComMethodCallException} - Failed to call the Rpc Method on the PLC Side
 * 
 * @return The result of the method call
 * 
 */
export type TcSymbolMethod = (args : any) => Promise<{result : any, outputs? : any }>;

/**
 * Class representing an instance of a PLC Symbol, mapped to the `TcContext`. The `TcSymbol` itself
 * acts as a bridge to the `TcBinding`, which has the responsibility of low-level ADS operations. 
 *  
 * ***NOTE:*** In order to avoid naming collisions with the Symbols declared in the Target PLC, all public
 * methods of `TcSymbol` start with the '$' character.
 * 
 * The `TcSymbol` should not be directly created, as it serves as a Template for the Derived `TcSymbols`
 * 
 */
export abstract class TcSymbol {

    /**
     * TcSymbols are indexable, in case they are structured types, and can nest children `TcSymbols`.
     * Alternatively, if a `TcSymbol` has Rpc Methods enabled, this methods can be also invoked over 
     * the index.
     */
    //@ts-ignore
    [ key : string ] : TcSymbol | TcSymbolMethod;

    /**
     * Constructs the foundation of a `TcSymbol` Object
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param readOnly - Flag which marks this `TcSymbol` as a ReadOnly symbol, and no operation of write-type can be issued to the `TcSymbol`
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent? : TcSymbol, readOnly : boolean = false, debug : boolean = false) {

        this.__parent = parent;
        this.__path = path;
        this.__readOnly = parent?.$readOnly || readOnly;

        this.__log.enabled = debug;
    }

    /**
     * Access the potential parent of this `TcSymbol`
     */
    //@ts-ignore
    get $parent() : TcSymbol | undefined { return this.__parent }

    /**
     * Access the path of this `TcSymbol` from its origin point
     */
    //@ts-ignore
    get $path() : string { return this.__path }

    /**
     * Access the `TcBinding` information of this `TcSymbol`
     */
    //@ts-ignore
    abstract get $binding() : TcSymbolBinding

    /**
     * Returns true if this `TcSymbol` is ReadOnly
     */
    //@ts-ignore
    get $readOnly() : boolean { return this.__readOnly };

    /**
     * Returns the value of this `TcSymbol` from the Target PLC Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<any> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value to a non-existent field
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value :any) : Promise<any> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * Clears the data of the Target PLC Symbol to their implicit default values, or the explicitly specified ones
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to clear a ReadOnly Symbol
     * 
     */
    //@ts-ignore
    async $clear() : Promise<void> {

        this.__log(`$clear() : Clearing ${this.$path}`)
        await this.$binding.clear();

        this.__log(`$clear() : Clearing successfully ${this.$path}`)
        this.$binding.emitCleared(new TcSymbolClearedEvent(this.$binding.context, this));
        
        return;
    }

    /**
     * Activates value change detection of the Target PLC Symbol. The sampling rate can be explicitly
     * set, in case the value changes uneseceraly too fast.
     * 
     * @param sampling - The speed at which change in the Target PLC Symbol value is detected
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComSubscribeException} - An error occurred when subscribing to the Symbol
     * 
     */
    //@ts-ignore
    async $subscribe(sampling : number = 10) : Promise<void> { 

        this.__log(`$subscribe() : Subscribing to ${this.$path}`)
        this.$binding.subscribe(sampling, (value) => {
            this.__log(`$subscribe() : Change of ${this.$path}`)
            this.$binding.emitChange(new TcSymbolChangedEvent(this.$binding.context, this, value));
        })
    }

    /**
     * Deactivated value change detection of the Target PLC Symbol. Does not remove the event handlers 
     * though, they simply will not be invoked.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComUnsubscribeException} - An error occurred when unsubscribing for a Symbol
     */
    //@ts-ignore
    async $unsubscribe() : Promise<void> { 

        this.__log(`$subscribe() : Unsubscribing from ${this.$path}`)
        await this.$binding.unsubscribe() 
    }

    /**
     * Attached the provided callback, which will be called when the `TcSymbol becomes invalidated
     * 
     * @param callback - The function, which is to be called upon invalidation
     */
    //@ts-ignore
    $onInvalidated(callback : (symbol : TcSymbol) => void) {
        this.__invalidateCallback = callback;
    }

    //----EVENTS...
    
    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$set()` has completed
     * @event set
     */
    //@ts-ignore
    $on(event : 'set', listener : (e : TcSymbolSetEvent) => void) : TcSymbol;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$get` has completed
     * @event get
     */
    //@ts-ignore
    $on(event : 'get', listener : (e : TcSymbolGetEvent) => void) : TcSymbol;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol.$clear()` has completed
     * @event cleared
     */
    //@ts-ignore
    $on(event : 'cleared', listener : (e : TcSymbolClearedEvent) => void) : TcSymbol;

    /**
     * Emitted from {@link TcBinding} of a {@link TcSymbol} when `TcSymbol` detects a change in the PLC Symbol
     * @event changed
     */
    //@ts-ignore
    $on(event : 'changed', listener : (e : TcSymbolChangedEvent) => void) : TcSymbol;

    //@ts-ignore
    $on(eventName : string, listener : (e : any) => void) : TcSymbol {
        this.__log(`$on() : Adding handler ${eventName} to ${this.$path}`)
        this.$binding.on(eventName, listener);   
        return this;
    }

    /**
     * Removes a listener from the specified event
     * 
     * @param eventName - The event name, from which the listener is to be removed
     * @param listener - The listener, which is to be removed from the specified event
     */
    //@ts-ignore
    $off(eventName : string, listener : (e : any) => void) : TcSymbol {
        this.__log(`$off() : Removing handler ${eventName} to ${this.$path}`)
        this.$binding.off(eventName, listener);   
        return this;
    }
    
    /**
     * Attached a listener to an event, which is only invoked once. For the full list
     * of events, see `TcSymbol.$on()`
     * 
     * @param eventName - The event name, which the listener will listen for
     * @param listener - The listener, which is called when the event is emitted
     */
    //@ts-ignore
    $once(eventName : string, listener : (e : any) => void) : TcSymbol {
        this.__log(`$once() : Adding once handler ${eventName} to ${this.$path}`)
        this.$binding.once(eventName, listener);  
        return this;  
    }

    /**
     * Internal function, for calling invalidation on the provided `TcSymbol
     * 
     * @param symbol - `TcSymbol`, which is to be invalidated
     * @internal
     */
    static invalidate(symbol : TcSymbol) {
        symbol.__invalidate()
    }

    /**
     * Invalidates the `TcBinding`of this symbol, as well as, if a callback as provided
     * in case of invalidation - will invoke it
     */
    //@ts-ignore
    protected __invalidate() {
        TcBinding.invalidate(this.$binding);
        if (this.__invalidateCallback) {
            this.__invalidateCallback(this);
        }
    }

    /**
     * Optional Callback, which is called when this `TcSymbol` is invalidated
     * @internal
     */
    //@ts-ignore
    private __invalidateCallback? : (symbol : TcSymbol) => void;
    
    /**
     * The potential `TcSymbol` parent of this `TcSymbol`
     * @internal
     */
    //@ts-ignore
    private __parent : TcSymbol | undefined;

    /**
     * String path of this `TcSymbol`
     * @internal
     */
    //@ts-ignore
    private __path : string;

    /**
     * Flag, which when true signal this `TcSymbol` is ReadOnly
     * @internal
     */
    //@ts-ignore
    private __readOnly : boolean;

    /**
     * @internal
     */
    //@ts-ignore
    protected __log : debug.Debugger = Debug(`TcContext::TcSymbol`);
}

/**
 * Class representing an instance of a PLC Symbol of Type `BOOL`.
 */
export class TcBooleanSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a `BOOL` Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this `BOOL` Symbol
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcBooleanType, debug : boolean = false) { 
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcBooleanBinding(this, pointer, params, parent.$binding, debug); 
    };

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcBooleanBinding { return this.__binding; }

    /**
     * Returns the boolean value of this `TcSymbol` from the Target PLC `BOOL` Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<boolean> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided boolean value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The boolean value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value to a non-existent field
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : boolean) : Promise<boolean> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcBooleanBinding;
}

/**
 * Class representing an instance of a PLC Symbol of Numeric Type.
 */
export class TcNumericSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a Numeric Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this Symbol
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcNumericType, debug : boolean = false) { 
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcNumericBinding(this, pointer, params, parent.$binding, debug); 
    };

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcNumericBinding { return this.__binding; }

    /**
     * Access the maximum value that can be written to this symbol
     */
    //@ts-ignore
    get $upperBorder() : number | bigint { return this.__binding.upperBorder}

    /**
     * Access the minimum value that can be written to this symbol
     */
    //@ts-ignore
    get $lowerBorder() : number | bigint { return this.__binding.lowerBorder}

    /**
     * Returns the numeric value of this `TcSymbol` from the Target PLC Numeric Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<number> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided numeric value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The numeric value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value which is out of range of this numeric type
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : number) : Promise<number> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }


    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcNumericBinding;

}

/**
 * Class representing an instance of a PLC Symbol of Type `STRING` or `WSTRING`.
 */
export class TcStringSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a `STRING` or `WSTRING` Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this `STRING` or `WSTRING` Symbol
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcStringType, debug : boolean = false) { 
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcStringBinding(this, pointer, params, parent.$binding, debug); 
    };

    /**
     * The maximum length of a string, that can be written
     */
    //@ts-ignore
    get $length() : number | bigint { return this.__binding.length}

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcStringBinding { return this.__binding; }    
    
    /**
     * Returns the string value of this `TcSymbol` from the Target PLC `STRING` or `WSTRING` Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<string> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided string value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The string value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a string value longer than maximum length
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : string) : Promise<string> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
    * `TcBinding` used by this Symbol
    * @internal
    */
    //@ts-ignore
    private __binding : TcStringBinding;
}

/**
 * Class representing an instance of a PLC Symbol of Type `ENUM`.
 */
export class TcEnumSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a `ENUM` Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this `ENUM` Symbol
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcEnumType, debug : boolean = false) { 
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcEnumBinding(this, pointer, params, parent.$binding, debug); 
    };

    /**
     * Access the fields of this enumerator, which can
     * be written
     */
    //@ts-ignore
    get $fields() : string[] { return this.__binding.fields}

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcEnumBinding { return this.__binding; }

    /**
     * Returns the string enum value of this `TcSymbol` from the Target PLC `ENUM` Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<string> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided string enum value, which is part of the allowed fields to 
     * the Target PLC Symbol, and when completed returns what was written to the Target PLC Symbol
     * 
     * @param value - The string enum value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value to a non-existent field
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : string) : Promise<string> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcEnumBinding;
    
}

/**
 * Class representing an instance of a PLC Symbol of `Structure`, `Function_Block` or `UNION` Type.
 */
export class TcStructureSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a `Structure`, `Function_Block` or `UNION` Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this Symbol
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcStructType, debug : boolean = false) { 
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcStructureBinding(this, pointer, params, parent.$binding, debug);

        params.children.forEach(child => {
            
            const childInfo : TcSymbolPointer = {
                indexGroup : pointer.indexGroup,
                indexOffset : pointer.indexOffset + child.type.offset,
                size : child.type.size
            }

            const childSymbol = child.type.instance(`${path}.${child.key}`, this, childInfo, debug);
            this.__addChild({ key : child.key as string, symbol : childSymbol })
        })


        params.rpcMethods.forEach(meth => {
            this.__addMethod(meth)
        })
    }

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcStructureBinding { return this.__binding; }

    /**
     * Returns the structured value of this `TcSymbol` from the Target PLC `Structure`, `Function_Block` or `UNION` Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<{[key : string] : any}> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided structured value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The structured value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value which is out of range of this type
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : {[key : string] : any}) : Promise<{[key : string] : any}> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * Iterates over all the `TcSymbol` Children of this `TcSymbol, and
     * passes each of them to the provided callback
     * 
     * @param callback - Callback, to which each `TcSymbol` Child is passed
     */
    //@ts-ignore
    $each(callback : (symbol : TcSymbol, key : string, parent : TcSymbol) => void) {
        this.__children.forEach(child => callback(child.symbol, child.key, this));
    }

    /**
     * Internal use function, which registers a `TcSymbol` Child as part of this `TcSymbol
     * @param child - The Child that is to be registered
     */
    //@ts-ignore
    private __addChild(child : { key : string, symbol : TcSymbol }) {
        this.__children.push({ key : child.key, symbol : child.symbol});
        Object.defineProperty(this, child.key, { get() : TcSymbol { return child.symbol }});
        TcStructureBinding.addChild(this.__binding, {key : child.key, binding : child.symbol.$binding});
    }

    /**
     * Internal use function, which registers an Rpc Method to this Structure
     * @param name - The name of the method to create
     */
    //@ts-ignore
    private __addMethod(name : string) {
        
        Object.defineProperty(this, name, {
            get() : TcSymbolMethod {
                return (args : any) : Promise<{result : any, outputs? : any }> => {
                    return this.__binding.callMethod(this.$path, name, args);
                }
            }
        })
    }

    /**
     * Invalidates all the `TcSymbol` Children, before invalidating itself
     */
    //@ts-ignore
    protected __invalidate() {
        this.$each(symbol => TcSymbol.invalidate(symbol));
        super.__invalidate();
    }

    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcStructureBinding;

    /**
     * List of children of this `TcSymbol`
     * @internal
     */
    //@ts-ignore
    private __children : { key : string , symbol : TcSymbol}[] = [];
}

/**
 * Class representing an instance of a PLC Symbol of `ARRAY OF...` Type.
 */
export class TcArraySymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface with a `ARRAY OF...` Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param parent - Potential parent of this `TcSymbol` and to whom events will propagate to
     * @param pointer - The memory location of the Target PLC Symbol
     * @param params - The Type parameters of this Symbol
     * @param depth - The Depth of this array, relative to the number of Dimensions in total
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, parent : TcSymbol, pointer : TcSymbolPointer, params : TcArrayType, depth : number, debug : boolean = false) {
        super(path, parent, params.readOnly, debug);
        this.__binding = new TcArrayBinding(this, pointer, params, params.dimensions[depth], parent.$binding, debug);
        this.__createChildren(depth, params)
    }

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */    
    //@ts-ignore
    get $binding() : TcArrayBinding { return this.__binding; }
    
    /**
     * Access the starting index of this array, due to TwinCAT allowing arrays to
     * start at any number
     */
    //@ts-ignore
    get $startIndex() : number { return this.__binding.startIndex; }

    /**
     * Access the total length of the array
     */
    //@ts-ignore
    get $length() : number { return this.__binding.length; }

    /**
     * Returns the array value of this `TcSymbol` from the Target PLC `ARRAY OF...` Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<any[]> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided array value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The array value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value which is out of range of this type
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : any[]) : Promise<any[]> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * Internal use function, which registers a `TcSymbol` Child as part of this `TcSymbol
     * @param child - The Child that is to be registered
     */
    //@ts-ignore
    private __addChild(child : { key : number, symbol : TcSymbol }) {
        this.__children.push({ key : child.key, symbol : child.symbol});
        Object.defineProperty(this, child.key, { get() : TcSymbol { return child.symbol }});
        TcArrayBinding.addChild(this.__binding, {key : child.key, binding : child.symbol.$binding});
    }

    /**
     * Iterates over all the `TcSymbol` Children of this `TcSymbol, and
     * passes each of them to the provided callback
     * 
     * @param callback - Callback, to which each `TcSymbol` Child is passed
     */
    //@ts-ignore
    $each(callback : (symbol : TcSymbol, index : number, parent : TcSymbol) => void) {
        this.__children.forEach(child => callback(child.symbol, child.key, this));
    }
    
    /**
     * Invalidates all the `TcSymbol` Children, before invalidating itself
     */
    //@ts-ignore
    protected __invalidate() {
        this.$each(symbol => TcSymbol.invalidate(symbol));
        super.__invalidate();
    }

    /**
     * Internal function, for creating the children of the Array Symbol.
     * If the array is multidimensional, it will create proxy-arrays to house
     * each dimension
     * 
     * @param depth - The Depth of the current array relative to the amount of dimensions
     * @param params - The Parameters of the Array, from which construction is made
     */
    //@ts-ignore
    private __createChildren(depth : number, params : TcArrayType) {

        let path = this.$path;
        if (depth === 0) {
            path = path + '[';
        } else {
            path = path.substr(0, path.length - 1) + ',';
        }

        if (depth + 1 === params.dimensions.length) {

            for(let index = params.dimensions[depth].startIndex; index < params.dimensions[depth].startIndex + params.dimensions[depth].length; ++index) {

                const childPointer : TcSymbolPointer = {
                    indexGroup : this.$binding.indexGroup,
                    indexOffset : this.$binding.indexOffset + (params.child.size * index),
                    size : params.child.size
                }

                const childSymbol = params.child.instance(`${path}${index}]`, this, childPointer, this.__log.enabled)
                this.__addChild({ key : index, symbol : childSymbol });

            }

        } else this.__createProxyArrays(path, params.dimensions[depth].length, depth, params)

    }

    /**
     * Internal function, for handling multidimensional arrays, where it splits the current `TcSymbolPointer`
     * and creates proxy arrays, to house the different dimensions
     * 
     * @param path - The modified path for multidimensional arrays reference
     * @param segments - The number of splits for this dimension
     * @param depth - The current dimension depth, relative to the total amount of dimensions
     * @param params - The Parameters of the Array, from which construction is made 
     */
    //@ts-ignore
    private __createProxyArrays(path : string, segments : number, depth : number, params : TcArrayType) {

        const offset : number = this.$binding.size / segments;

        for (let index = 0; index < segments; index++) {
            const pointer : TcSymbolPointer = {
                indexGroup : this.$binding.indexGroup,
                indexOffset : this.$binding.indexOffset + (offset * index),
                size : offset
            }
            const childSymbol = new TcArraySymbol(`${path}${params.dimensions[depth].startIndex + index}]`, this, pointer, params, depth + 1, this.__log.enabled);
            this.__addChild({ key : params.dimensions[depth].startIndex + index, symbol : childSymbol });
        }
    }

    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcArrayBinding;

    /**
     * List of children of this `TcSymbol`
     * @internal
     */
    //@ts-ignore
    private __children : { key : number, symbol : TcSymbol}[] = [];
}

/**
 * Class representing an instance of a PLC Symbol, which is the initial entry point to the `TcSymbol` map.
 * These namespaces are usually `PROGRAMS` and different Variable Lists.
 * 
 * This `TcSymbol` deduces its IndexOffset, IndexGroup and Size, based on the provided children
 */
export class TcNamespaceSymbol extends TcSymbol {

    /**
     * Constructs a `TcSymbol`, which is designed to interface a namespace Symbol on the Target
     * PLC.
     * 
     * @param path - The Path of this Symbol, relative to its origin point
     * @param context - The `TcContext`, that this namespace is apart of
     * @param parent - Parent Emitter, to whom errors are propagated to
     * @param debug - If enabled, will produce debug information
     */
    constructor(path : string, context : TcContext, parent : TcEmitter, debug : boolean = false) { 
        super(path, undefined, false, debug);
        this.__binding = new TcNamespaceBinding(context, this, parent, debug);
    }

    /**
     * Access the `TcBinding` of this `TcSymbol`
     */
    //@ts-ignore
    get $binding() : TcNamespaceBinding { return this.__binding; }

    /**
     * Iterates over all the `TcSymbol` Children of this `TcSymbol, and
     * passes each of them to the provided callback
     * 
     * @param callback - Callback, to which each `TcSymbol` Child is passed
     */
    //@ts-ignore
    $each(callback : (symbol : TcSymbol, key : string, parent : TcSymbol) => void) {
        this.__children.forEach(child => callback(child.symbol, child.key, this));
    }

    /**
     * Returns the structured value of this `TcSymbol` from the Target PLC namespace Symbol,
     * which the `TcSymbol.$binding` is linked to.
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComDataReadException} - An error occurred when fetching the Symbol Data
     * @throws {@link TcComFromRawException} - An error occurred when parsing Data to values 
     * @throws {@link TcBindingOutOfRangeException} - Error occurred when parsing returned Data from the Target PLC Symbol
     * 
     * @return - The value of the Target PLC Symbol
     */
    //@ts-ignore
    get $get() : Promise<{[key : string] : any}> {

        this.__log(`$get() : Getting ${this.$path}`)
        return this.$binding.read().then(result => {

            this.__log(`$get() : Getting successfully${this.$path}`)
            this.$binding.emitGet(new TcSymbolGetEvent(this.$binding.context, this, result));

            return result;
        })
    }

    /**
     * Writes the provided structured value to the Target PLC Symbol, and when completed returns what was
     * written to the Target PLC Symbol
     * 
     * @param value - The structured value that is to be written to the Target PLC Symbol
     * 
     * @throws {@link TcBindingIsInvalidException} - Attempting operation on an invalidated `TcBinding`
     * @throws {@link TcComIsInvalidException} - Attempting operation on an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - An error occurred when parsing values to Data 
     * @throws {@link TcComDataWriteException} - An error occurred when writing the Symbol Data
     * @throws {@link TcBindingOutOfRangeException} - Attempted to write a value which is out of range of this type
     * @throws {@link TcBindingInvalidTypeException} - Type-mismatch occurred when parsing Values to Data
     * @throws {@link TcBindingReadOnlyException} - Attempted to write to a ReadOnly Symbol
     * 
     * @return - The value which was written to the Target PLC Symbol
     */
    //@ts-ignore
    async $set(value : {[key : string] : any}) : Promise<{[key : string] : any}> {

        this.__log(`$set() : Setting ${this.$path}`)
        await this.$binding.write(value);

        this.__log(`$set() : Setting successfully ${this.$path}`)
        this.$binding.emitSet(new TcSymbolSetEvent(this.$binding.context, this, value));

        return value;
    }

    /**
     * Internal use function, which registers a `TcSymbol` Child as part of this `TcSymbol
     * @param child - The Child that is to be registered
     */
    //@ts-ignore
    private __addChild(child : { key : string, symbol : TcSymbol }) {
        this.__children.push({ key : child.key, symbol : child.symbol});
        Object.defineProperty(this, child.key, { get() : TcSymbol { return child.symbol }});
        TcNamespaceBinding.addChild(this.__binding, {key : child.key, binding : child.symbol.$binding});
    }

    /**
     * Internal use function, to add a `TcSymbol` Child to this `TcNamespaceSymbol`.
     * Should not be called outside the library
     * 
     * @param namespace  - The namespace, to which the `TcSymbol` Child is added
     * @param child - The `TcSymbol` Child, that is to be added to the namespace
     *  
     * @internal
     */
    static addChild(namespace : TcNamespaceSymbol, child : { key : string, symbol : TcSymbol }) {
        namespace.__addChild(child);
    }

    /**
     * Invalidates all the `TcSymbol` Children, before invalidating itself
     */
    //@ts-ignore
    protected __invalidate() {
        this.$each(symbol => TcSymbol.invalidate(symbol));
        super.__invalidate();
    }

    /**
     * `TcBinding` used by this Symbol
     * @internal
     */
    //@ts-ignore
    private __binding : TcNamespaceBinding;

    /** 
     * List of children of this `TcSymbol`
     * @internal
     */
    //@ts-ignore
    private __children : { key : string , symbol : TcSymbol}[] = [];
}
