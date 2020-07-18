// tc-exception.ts
/**
 * Module containing all the exceptions, that can be thrown by the `tc-context` library
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
import { TcContext } from './tc-context';
import { TcBinding } from './tc-binding'; 
import { TcCom } from './tc-com';

/**
 * Main Exception Class of the `tc-context` library. Every exception thrown from the `tc-context` library
 * derives from this Class.
 * 
 * Event `TcException` stores the `TcContext` from which it originated.
 */
export class TcException extends Error {

    /**
     * Construct a `TcException` with the `TcContext`, from which it originated, and the
     * error message
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param message - Error message
     */
    constructor(context : TcContext, message : string);

    /**
     * Construct a `TcException` with the `TcContext`, from which it originated, and the
     * error message, as well as any parent Error that can provide additional information
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     */
    constructor(context : TcContext, message : string, parent : Error);

    /**
     * Construct a `TcException` with the `TcContext`, from which it originated, and the
     * error message, as well as additional data associated with this error
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param message - Error message
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, message : string, data : any);
        
    /**
     * Construct a `TcException` with the `TcContext`, from which it originated, and the
     * error message, as well as both the parent Error and additional Error Data
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, message : string, parent : Error, data : any)
    constructor(context : TcContext, message : string, arg0? : any, arg1? : any) { 


        if (arg0 instanceof Error) {

            super(`${message}\nAdditional Information:\n${arg0.message}`)
            this.__parent = arg0;
            this.__data = arg1;

        } else if (arg0) {
            super(message);
            this.__data = arg0;

        } else super(message);

        this.__context = context;

    };

    /**
     * Access the `TcContext`, from which this `TcException` originated
     */
    get context() : TcContext { return this.__context };

    /**
     * Access any data, associated with this `TcException`
     */
    get data() : any | undefined { return this.__data };

    /**
     * Access any parent error, that was raised alongside this `TcException`
     */
    get parent() : Error | undefined { return this.__parent };

    /**
     * Stores the `TcContext`
     * @internal
     */
    private __context : TcContext;

    /**
     * Stores additional Error Data
     * @internal
     */
    private __data : any;

    /**
     * Stores potential parent error
     * @internal
     */
    private __parent? : Error;
}

/**
 * Exception Class, for every Error produced by the `TcBinding` Object through the `TcSymbol` Object
 * 
 * Will also store the `TcBinding`, that threw the exception originally
 */
export class TcBindingException extends TcException {

    /**
     * Construct a `TcBindingException` with the `TcContext`, from which it originated, the `TcBinding`, which raised it and the
     * error message
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param sender - The `TcBinding` from which the exception originated
     * @param message - Error message
     */
    constructor(context : TcContext, sender : TcBinding, message : string);

    /**
     * Construct a `TcException` with the `TcBinding`, from which it originated, and the
     * error message, as well as any parent Error that can provide additional information
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcBinding` from which the exception originated
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     */
    constructor(context : TcContext, sender : TcBinding, message : string, parent : Error);

    /**
     * Construct a `TcException` with the `TcBinding`, from which it originated, and the
     * error message, as well as additional data associated with this error
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcBinding` from which the exception originated
     * @param message - Error message
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, sender : TcBinding, message : string, data : any);
        
    /**
     * Construct a `TcException` with the `TcBinding`, from which it originated, and the
     * error message, as well as both the parent Error and additional Error Data
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcBinding` from which the exception originated
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, sender : TcBinding, message : string, parent : Error, data : any)

    constructor(context : TcContext, sender : TcBinding, message : string, arg0? : any, arg1? : any) { 
        super(context, message, arg0, arg1)
        this.__sender = sender;
    } 

    /**
     * Access the `TcBinding`, from which this `TcException` originated
     */
    get sender() : TcBinding { return this.__sender }

    /**
     * Stores the exception sender
     * @internal
     */
    private __sender : TcBinding;
}

/**
 * Exception raised when an operation was called on an invalidated `TcBinding`
 */
export class TcBindingIsInvalidException extends TcBindingException {};

/**
 * Exception raised when an invalid type was passed to the `TcBinding`
 */
export class TcBindingInvalidTypeException extends TcBindingException {}

/**
 * Exception raised when a value that is out of allowed range was passed to the `TcBinding`
 */
export class TcBindingOutOfRangeException extends TcBindingException {}

/**
 * Exception raised when a write operation was called on a ReadOnly `TcBinding`
 */
export class TcBindingReadOnlyException extends TcBindingException {}

/**
 * Exception Class, for every Error produced by the `TcCom` Object
 * 
 * Will also store the `TcCom`, that threw the exception originally
 */
export class TcComException extends TcException {

    /**
     * Construct a `TcBindingException` with the `TcContext`, from which it originated, the `TcCom`, which raised it and the
     * error message
     * 
     * @param context - The `TcContext` from which the exception originated 
     * @param sender - The `TcCom` from which the exception originated
     * @param message - Error message
     */
    constructor(context : TcContext, sender : TcCom, message : string);

    /**
     * Construct a `TcException` with the `TcCom`, from which it originated, and the
     * error message, as well as any parent Error that can provide additional information
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcCom` from which the exception originated
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     */
    constructor(context : TcContext, sender : TcCom, message : string, parent : Error);

    /**
     * Construct a `TcException` with the `TcCom`, from which it originated, and the
     * error message, as well as additional data associated with this error
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcCom` from which the exception originated
     * @param message - Error message
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, sender : TcCom, message : string, data : any);
        
    /**
     * Construct a `TcException` with the `TcCom`, from which it originated, and the
     * error message, as well as both the parent Error and additional Error Data
     * 
     * @param context - The `TcContext` from which the exception originated  
     * @param sender - The `TcCom` from which the exception originated
     * @param message - Error message
     * @param parent - The parent Error of this `TcException`
     * @param data - The Data, which is associated with this `TcException`
     */
    constructor(context : TcContext, sender : TcCom, message : string, parent : Error, data : any)

    constructor(context : TcContext, sender : TcCom, message : string, arg0? : any, arg1? : any) { 
        super(context, message, arg0, arg1)
        this.__sender = sender;
    } 

    /**
     * Access the `TcCom`, from which this `TcException` originated
     */
    get sender() : TcCom { return this.__sender }

    /**
     * Stores the exception sender
     * @internal
     */
    private __sender : TcCom;
}

/**
 * Exception raised when an operation was called on an uninitialized `TcCom`
 */
export class TcComBusyException extends TcComException {}

/**
 * Exception raised when an operation was called on an invalidated `TcCom`
 */
export class TcComIsInvalidException extends TcComException {}

/**
* Exception raised when an error happens during ADS Connection
*/
export class TcComConnectException extends TcComException {}

/**
 * Exception raised when an error happens during ADS Disconnect
 */
export class TcComDisconnectException extends TcComException {}

/**
 * Exception raised when an error happens during an attempt to monitor Code Changes
 */
export class TcComChangeDetectionException extends TcComException {}

/**
 * Exception raised when an error happens during unsubscribing from a Target PLC Symbol
 */
export class TcComUnsubscribeException extends TcComException {}

/**
 * Exception raised when an error happens during conversion of values to Raw Data
 */
export class TcComFromRawException extends TcComException {}

/**
 * Exception raised when an error happens during conversion of Raw Data to values
 */
export class TcComToRawException extends TcComException {}

/**
 * Exception raised when an error happens during subscription to a Target PLC Symbol
 */
export class TcComSubscribeException extends TcComException {}

/**
 * Exception raised when an error happens during ADS Write operation
 */
export class TcComDataWriteException extends TcComException {}

/**
 * Exception raised when an error happens during ADS Read operation
 */
export class TcComDataReadException extends TcComException {}

/**
 * Exception raised when an error happens during the fetch of ADS Type Data
 */
export class TcComTypeQueryException extends TcComException {}

/**
 * Exception raised when an error happens during the fetch of ADS Symbol Data
 */
export class TcComSymbolQueryException extends TcComException {}

/**
 * Exception raised when an error happens during a call to a Method of a Function Block
 */
export class TcComMethodCallException extends TcComException {}