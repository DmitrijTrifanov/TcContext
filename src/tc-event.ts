// tc-event.ts
/**
 * Module containing all the events, that can be raised by the `tc-context` library
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
import { EventEmitter } from 'events';

import { TcContext } from './tc-context';
import { TcSymbol } from './tc-symbol';
import { TcCom } from './tc-com';
import { TcTypeRegistry } from './tc-type-registry';
import { TcSymbolRegistry } from './tc-symbol-registry';

/**
 * Base Emitter Class for all Components of `tc-context` library, which can raise
 * and event.
 * 
 * `TcEmitters` store a reference to their parents, which allows them to propagate
 * and event to the top levels of the module, which is the `TcContext` object
 */
export class TcEmitter extends EventEmitter {

    /**
     * Constructors an Event Emitter, with a potential reference to a parent Emitter.
     * When emitting and event, the even is first emitted from itself, and then passed
     * to the parent, unless no parent is present, or `TcEvent.stopPropagation()` was
     * called
     * 
     * @param parent - The parent Emitter of this Emitter
     */
    constructor(parent? : TcEmitter) {
        super();
        this.__parentEmitter = parent;
    }

    /**
     * Emits an event of `eventName` with data `e` and if parent is present
     * will propagated that event to it, unless stopped
     * 
     * @param eventName - The event name to emit
     * @param e - The Data associated with this event
     * 
     * @return - True if the event had listeners, false otherwise.
     */
    emit(eventName : string | symbol, e : TcEvent) : boolean {

        let result = super.emit(eventName, e);
        if (this.__parentEmitter && !e.propagationStopped) {
            result = this.__parentEmitter.emit(eventName, e) && result;
        }
        return result;

    }

    /**
     * Parent Emitter
     * @internal
     */
    private __parentEmitter? : TcEmitter;

}

/**
 * Main Event Class of the `tc-context` library. Every event raised from the `tc-context`
 * library derives from this Class.
 * 
 * `TcEvent` when emitted through the `TcEmitter` will propagate, and if propagation is not 
 * needed, an explicit call to `TcEvent.stopPropagation()` must be made.
 * 
 * The `TcEvent`contains the timestamp of event creation, any associated data with the event
 * and the `TcContext` from which the event originated.
 */
export class TcEvent {
    
    /**
     * Construct a base `TcEvent`with references to the `TcContext` and 
     * data
     * 
     * @param context - The `TcContext` from which the event originated 
     * @param data - Any data associated with the event
     */
    constructor(context : TcContext, data? : any) {
        this.__context = context;
        this.__data = data;
    }

    /**
     * Access the `TcContext` of this event
     */
    get context() : TcContext { return this.__context };

    /**
     * Access any Data, which is associated with the event
     */
    get data() : any | undefined { return this.__data };

    /**
     * Access the Timestamp of event creation
     */
    get timestamp() : number { return this.__timestamp };

    /**
     * Stop the propagation of the event, up the `TcEmitter` tree
     */
    stopPropagation() { this.__propagation = false; }

    /**
     * Is true if Event Propagation was stopped
     */
    get propagationStopped() : boolean { return this.__propagation === false }

    /**
     * Stores the context of the event
     * @internal
     */
    private __context : TcContext;

    /**
     * Stores the data of the event
     * @internal
     */
    private __data? : any;

    /**
     * Stores the date of the event
     * @internal
     */
    private __timestamp : number = Date.now();

    /**
     * Stores the state of propagation
     * @internal
     */
    private __propagation : boolean = true;

}

/**
 * Derived class for narrowing down event source.
 * Class that represents all the `TcEvents` emitted from the `TcContext` 
 * object
 */
export class TcContextEvent extends TcEvent {}

/**
 * Event, which is emitted, when the `TcContext` has been reinitialized
 */
export class TcContextReinitializedEvent extends TcContextEvent {}

/**
 * Event, which is emitted, when the `TcContext` was killed 
 */
export class TcContextKilledEvent extends TcContextEvent {}

/**
 * Derived class for narrowing down event source.
 * Class that represents all the `TcEvents` emitted by the `TcSymbols` through
 * the `TcBindings`
 */
export class TcSymbolEvent extends TcEvent {

    /**
     * Construct the `TcSymbolEvent`, which represents an event emitted from
     * a `TcSymbol` Object
     * @param context - The `TcContext`, from which this event originated
     * @param symbol - The `TcSymbol`, from which this event originated
     * @param data - Any data associated with this event
     */
    constructor(context : TcContext, symbol : TcSymbol, data? : any) {
        super(context, data);
        this.__symbol = symbol;
    }

    /**
     * Access the `TcSymbol`, which emitted this event
     */
    get symbol() : TcSymbol { return this.__symbol };
    
    /**
     * Stores the symbol, from which the event originated
     * @internal
     */
    private __symbol : TcSymbol;
    
}

/**
 * Event, which is emitted, when `TcSymbol.$get` has completed 
 */
export class TcSymbolGetEvent extends TcSymbolEvent {}

/**
 * Event, which is emitted, when `TcSymbol.$set()` has completed 
 */
export class TcSymbolSetEvent extends TcSymbolEvent {}

/**
 * Event, which is emitted, when `TcSymbol.$clear()` has completed 
 */
export class TcSymbolClearedEvent extends TcSymbolEvent {}

/**
 * Event, which is emitted, when `TcSymbol` detects a change in the Target PLC Symbol
 */
export class TcSymbolChangedEvent extends TcSymbolEvent {}

/**
 * Derived class for narrowing down event source.
 * Class that represents all the `TcEvents` emitted by `TcCom`
 */
export class TcComEvent extends TcEvent {

    /**
     * Construct the `TcComEvent`, which represents an event emitted from
     * a `TcCom` Object
     * @param context - The `TcContext`, from which this event originated
     * @param com - The `TcCom`, from which this event originated
     * @param data - Any data associated with this event
     */
    constructor(context : TcContext, com : TcCom, data? : any) {
        super(context, data);
        this.__com = com;
    }

    /**
     * Access the `TcCom`, which emitted this event
     */
    get com() : TcCom { return this.__com };

    /**
     * Stores the `TcCom`, from which the event originated
     * @internal
     */
    private __com : TcCom;
}

/**
 * Event, which is emitted, when `TcCom` connects
 */
export class TcComConnectedEvent extends TcComEvent {}

/**
 * Event, which is emitted, when `TcCom` disconnects
 */
export class TcComDisconnectedEvent extends TcComEvent {}

/**
 * Event, which is emitted, when `TcCom` detects a change in the Source Code of the Target PLC
 */
export class TcComSourceChangedEvent extends TcComEvent {}

/**
 * Event, which is emitted, when `TcCom` has a connection loss with the Target PLC
 */
export class TcComConnectionLostEvent extends TcComEvent {}


/**
 * Event, which is emitted, when `TcCom` reconnects to the Target PLC
 */
export class TcComReconnectedEvent extends TcComEvent {}




/**
 * Derived class for narrowing down event source.
 * Class that represents all the `TcEvents` emitted by `TcTypeRegistry`
 */
export class TcTypeRegistryEvent extends TcEvent {

    /**
     * Construct the `TcTypeRegistryEvent`, which represents an event emitted from
     * a `TcTypeRegistry` Object
     * @param context - The `TcContext`, from which this event originated
     * @param registry - The `TcTypeRegistry`, from which this event originated
     * @param data - Any data associated with this event
     */
    constructor(context : TcContext, registry : TcTypeRegistry, data? : any) {
        super(context, data);
        this.__registry = registry;
    }

    /**
     * Access the `TcTypeRegistry`, which emitted this event
     */
    get registry() : TcTypeRegistry { return this.__registry };

    /**
     * Stores the `TcTypeRegistry`, from which the event originated
     * @internal
     */
    private __registry : TcTypeRegistry;
}

/**
 * Event, which is emitted, when `TcTypeRegistry` creates a Type Map
 */
export class TcTypeRegistryCreatedEvent extends TcTypeRegistryEvent {}

/**
 * Event, which is emitted, when `TcTypeRegistry` destroys a Type Map
 */
export class TcTypeRegistryDestroyedEvent extends TcTypeRegistryEvent {} 

/**
 * Derived class for narrowing down event source.
 * Class that represents all the `TcEvents` emitted by `TcSymbolRegistry`
 */
export class TcSymbolRegistryEvent extends TcEvent {

    /**
     * Construct the `TcTypeRegistryEvent`, which represents an event emitted from
     * a `TcSymbolRegistry` Object
     * @param context - The `TcContext`, from which this event originated
     * @param registry - The `TcSymbolRegistry`, from which this event originated
     * @param data - Any data associated with this event
     */
    constructor(context : TcContext, registry : TcSymbolRegistry, data? : any) {
        super(context, data);
        this.__registry = registry;
    }

    /**
     * Access the `TcSymbolRegistry`, which emitted this event
     */
    get registry() : TcSymbolRegistry { return this.__registry };

    /**
     * Stores the `TcSymbolRegistry`, from which the event originated
     * @internal
     */
    private __registry : TcSymbolRegistry;
}


/**
 * Event, which is emitted, when `TcTypeRegistry` creates a Symbol Map
 */
export class TcSymbolRegistryCreatedEvent extends TcSymbolRegistryEvent {}

/**
 * Event, which is emitted, when `TcTypeRegistry` destroys a Symbol Map
 */
export class TcSymbolRegistryDestroyedEvent extends TcSymbolRegistryEvent {} 