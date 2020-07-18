# tc-context - TwinCAT ADS Javascript Library

- *written by Dmitrij Trifanov, at d.v.trifanov@gmail.com*

![version](https://img.shields.io/badge/version-1.0.0-orange)
[![TwinCAT](https://img.shields.io/badge/TwinCAT-v4024.7-blue)](https://infosys.beckhoff.com/english.php?content=../content/1033/tcadscommon/html/tcadscommon_intro.htm&id=)
[![npm version](https://img.shields.io/badge/npm-v1.7.1-blue)](https://www.npmjs.org/package/ads-client) 
[![License](https://img.shields.io/badge/license-MIT-green)](https://choosealicense.com/licenses/mit/)

Unofficial Node.JS Library for TwinCAT ADS Communication, designed to simplify connection to a Beckhoff PLC, and automatically generating a Symbol Map [ADS Protocol](https://infosys.beckhoff.com/english.php?content=../content/1033/tc3_ads_intro/116157835.html&id=124964102706356243) from Beckhoff for ease of read/write and subscribe data operations. 
The `tc-context` library achieves this by fetching all the type data and initial symbol data at the moment connection and caching the memory locations of each individual symbol, as well as their parent symbol relationship. This grants the possibility to write partial structures directly into TwinCAT `Function_Blocks` and `Structures`, subscribing to complex objects, and clearing multiple Namespaces, all with single-line instructions at minimal run-time cost.

This library is made possible, thanks to the [ads-client](https://github.com/jisotalo/ads-client) library by Jussi Isotalo <j.isotalo91@gmail.com>. If you are in search for a smaller library, focusing on ADS communication, make sure to check the[ads-client](https://github.com/jisotalo/ads-client) library.

# [List of Features](#table-of-contents) 

- Generation of a full Symbol Map, from a Beckhoff PLC
- Reading/writing/clearing/subscribing to non-structured and non-array types
- Reading/writing/clearing/subscribing to structured types 
- Writing only to explicit members of structured types
- Reading/writing/clearing/subscribing to array types
- Reading/Writing/clearing/subscribing to sub-arrays dimension size\[*n-1*\] from an initial array of dimension size\[*n*\]
- Invoking Methods from the Beckhoff PLC Side
- Beckhoff PLC Code Change detection and Symbol Map re-generation
- Input value validation for all types, including sub-ranged integers


# Table of contents

- [List of Features](#list-of-features)
- [Quick Look](#quick-look)
- [Installation](#installation)
- [Connection Setup](#connection-setup)
- [Creating TcContext Instance](#creating-tccontext-instance)
    - [TcContext Components](#tccontext-components)
- [TcSymbols](#tcsymbols)
    - [Read, Write and Clear TcSymbol Operations](#read-write-and-clear-tcsymbol-operations)
    - [Subscribing to TcSymbol Changes](#subscribing-to-tcsymbol-changes)
        - [Explicit Sampling Rate](#explicit-sampling-rate)
    - [Structured TcSymbols](#structured-tcsymbols)
        - [Method call on Structured TcSymbols](#method-call-on-structured-tcsymbol)
        - [Unions and TcSymbols](#unions-and-tcsymbols)
    - [Array TcSymbols](#array-tcsymbols)
        - [Multidimensional Array](#multidimensional-array)
    - [TcSymbol Types](#tcsymbol-types) 
        - [TcBooleanSymbol](#tcbooleansymbol) 
        - [TcNumericSymbol](#tcnumericsymbol) 
        - [TcStringSymbol](#tcstringsymbol) 
        - [TcEnumSymbol](#tcenumsymbol)
        - [TcStructureSymbol](#tcstructuresymbol)
        - [TcArraySymbol](#tcarraysymbol)
    - [Invalidated TcSymbol](#invalidated-tcsymbol)
    - [TcSymbol Attributes](#tcsymbol-attributes)
        - [TcSymbol Default Attribute](#tcsymbol-default-attribute)
        - [TcSymbol ReadOnly Attribute](#tcsymbol-readonly-attribute)
        - [TcSymbol Ignore Attribute](#tcsymbol-ignore-attribute)
        - [TcSymbol Event Alias Attribute](#tcsymbol-event-alias-attribute)
- [TcEvents](#tcevents)
    - [TcEvent List](#tcevent-list)
    - [TcEvent Hierarchy](#tcevent-hierarchy)
- [Understanding TcContext Lifecycle](#understanding-tccontext-lifecycle)
- [TcExceptions](#tcexceptions)
- [Documentation](#documentation)
- [Acknowledgments](#acknowledgments)
- [License](#license)

# [Quick Look](#table-of-contents) 

Below is a quick example of creating a `TcContext` for a Beckhoff PLC located at localhost, and performing read/write/clear operations. For more complex operations, and behavior definitions, see individual chapters on the subject matter.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL := TRUE;
    numericValue : INT := 10;
    structuredValue : Foo;
    arrayValue : ARRAY [0..9] OF STRING := ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j']

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    realValue : REAL;
    stringValue : STRING := 'hello world';

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context');

TcContext.create().then(async context => {

    //Reading the program's 'MAIN' Namespace
    let result = await context.$.MAIN.$get
    /**
     *  result : { 
     *      booleanValue : true, 
     *      numericValue : 10, 
     *      structuredValue : { 
     *          realValue : 0,
     *          stringValue : 'hello world'    
     *      },
     *      arrayValue : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j']
     *  }
     */

    //Clearing all members of a Structured Value
    await context.$.MAIN.structuredValue.$clear()
    result = await context.$.MAIN.structuredValue.$get;
    /**
     *  result : { realValue : 0, stringValue : '' }
     */   

    //Setting a Numeric value
    await context.$.MAIN.numericValue.$set(5);
    result = await context.$.MAIN.numericValue.$get;
    /**
     *  result : 5
     */   

    //Setting an Array
    await context.$.MAIN.arrayValue.$set(['1', '2', '3']);
    result = await context.$.MAIN.arrayValue.$get;
    /**
     *  result : ['1', '2', '3', 'd', 'e', 'f', 'g', 'h', 'j']
     */  

    //Setting a program's Namespace values
    const set = {
         booleanValue : false,
         structuredValue : {
             realValue : 15,
             stringValue : 'i am alive'
         }

    }
    await context.$.MAIN.$set(set)
    result  = await context.$.MAIN.arrayValue.$get;
    /**
     *  result : { 
     *      booleanValue : false, 
     *      numericValue : 5, 
     *      structuredValue : { 
     *          realValue : 15,
     *          stringValue : 'i am alive'    
     *      },
     *      arrayValue : ['1', '2', '3', 'd', 'e', 'f', 'g', 'h', 'j']
     *  }
     */

    //Clearing Namespace
    await context.$.MAIN.$clear();
    result = await context.$.MAIN.arrayValue.$get;
    /**
     *  result : { 
     *      booleanValue : false, 
     *      numericValue : 0, 
     *      structuredValue : { 
     *          realValue : 0,
     *          stringValue : ''    
     *      },
     *      arrayValue : ['', '', '', '', '', '', '', '', '']
     *  }
     */

    //Disconnecting Context and killing bindings
    await context.kill()

})
```

# [Installation](#table-of-contents) 

//TODO : add NPM link

Include the module in js:
```js
const { TcContext } = require('tc-context')
```

# [Connection Setup](#table-of-contents) 

The `tc-context` library uses the [ads-client](https://github.com/jisotalo/ads-client) library for connecting and communicating with a Beckhoff PLC over the ADS Protocol. Because of that, the connection setup configuration is equal to the [connection setup](https://github.com/jisotalo/ads-client#connection-setups-and-possibilities) of the [ads-client](https://github.com/jisotalo/ads-client), since the supplied settings are routed directly to the `ads-client`.

See [ads-client](https://github.com/jisotalo/ads-client) for detailed information on different types of possible connections.

# [Creating TcContext Instance](#table-of-contents) 

```js
const { TcContext } = require('tc-context')

//Connecting to a Localhost Beckhoff PLC
TcContext.create().then(async context => {
    
    //Result contains the currently active context
    //Perform operation with the created context....

    //When done, kill the context
    await context.kill();

})
```

In order to create a new `TcContext` Object, a call to the `TcContext.create()` functions must be made. By default, if no arguments are passed to the `TcContext.create()` function, it is assumed to that the connection that will be made is to the localhost located PLC. Explicit settings can be provided as the first argument to the `TcContext.create()` function.

***NOTE:*** The `TcContext` object must be explicitly killed at the end of its use, through the `TcContext.kill()` method call. This will clean up all subscription handles, termination the connection, and clear the generated map, thus ensuring no memory leaks.

```js
const { TcContext } = require('tc-context')

const settings = {
  targetAmsNetId: '192.168.1.120.1.1',
  targetAdsPort: 851
  //And more....
}

//Connecting to a Localhost Beckhoff PLC
TcContext.create(settings).then(async context => {
    
    //Result contains the currently active context for 192.168.1.120.1.1:851
    //Perform operation with the created context....

    //When done, kill the context
    await context.kill();

})
```

The settings are routed to the [ads-client](https://github.com/jisotalo/ads-client) `Client.connect()` method directly, without any modification. Hence, for more detailed and up-to-date information, on different connection patters, see the official documentation of [ads-client](https://github.com/jisotalo/ads-client).

## [TcContext Components](#table-of-contents) 

The `TcContext` Object is composed of 3 Components :

* `TcSymbolRegistry` - Storage for all the Symbol Maps created based based on the data gathered by `TcCom`', passed through the `TcTypeRegistry`. This property can be accessed by the `TcContext.symbols` property, and the registered symbol maps can be accessed by the `TcContext.symbols.namespaces` property. The `TcSymbolNamespace` represents the Programs and any Global Variable Lists present in the PLC.<br>***Note:*** Because access to the symbol namespaces is a common operation, a shortcut is implemented in the form of `TcContext.$`, which corresponds to `TcContext.symbols.namespaces`
* `TcTypeRegistry` - Storage for all the processed types, which are gathered by `TcCom` Component. This component can be accessed through `TcContext.types` property, and the registered types can be queried by `TcContext.types.has(<type name>)`.<br>***Note:*** Type names are case sensitive. 
* `TcCom` - Component responsible for communication and data passing between `TcContext` and the PLC. This component can be accessed through `TcContext.COM` property.


# [TcSymbols](#table-of-contents) 

Upon a successful `TcContext` creation, a full `TcSymbol` map is created, mirroring what is currently loaded in the Beckhoff PLC. The create `TcSymbolNamespaces` can be accessed either through `TcContext.symbols.namespaces` or `TcContext.$` properties.
In order to avoid naming conflicts with symbols declared in the PLC, all public methods provided by the `TcSymbol` Object begin with ``$` symbol. 

***IMPORTANT:*** Type safety is important and there is **no implicit type conversion**. This is to ensure, that whatever is written is well defined by both ends of the system. In case of type mismatch, an exception `TcBindingInvalidTypeException` is raised and no operation is performed.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    numericValue : INT;
    rangeValue : BYTE(50..100);
    stringValue : STRING(50);
    enumValue : MyEnum;
    arrayValue : ARRAY[0..4] OF Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    {attribute 'Default' := '22.3'}
    realValue : REAL;
    {attribute 'ReadOnly'}
    stringValue : STRING;

END_VAR
```
*MyEnum(ENUM)*
```
TYPE MyEnum :
(
	member1 := 0,
	member2 := 1,
	member3 := 2
);
END_TYPE
```

The example above would produce a `TcContext` of the following type: 

* `TcContext.$.MAIN` - the MAIN Program
    * `.booleanValue` - symbol of type `TcBooleanSymbol : TcSymbol`
    * `.numericValue` - symbol of type `TcNumericSymbol : TcSymbol`
    * `.rangeValue` - symbol of type `TcNumericSymbol : TcSymbol` with explicit value borders at `[50-100]`, and a write of a value outside these borders raises the `TcBindingOutOfRangeException` exception
    * `.stringValue` - symbol of type `TcStringSymbol : TcSymbol`, with a max length of `[50]` characters, and any attempt to write a string of `[50+]` length raises the `TcBindingOutOfRangeException` exception
    * `.enumValue` - symbol of type `TcEnumSymbol : TcSymbol`, which only accepts input strings from `['MyEnum.member1', 'MyEnum.member2', 'MyEnum.member3']` list, and any write of value outside that list raises the `TcBindingOutOfRangeException` exception
    * `.arrayValue` - symbol of type `TcArraySymbol : TcSymbol`, which represents an array of size `[5]` of type `Foo` type `Function_Block` 
        * `[0-4]` - symbols of type `TcStructureSymbol : TcSymbol`
            * `.realValue` - symbol of type `TcNumericSymbol : TcSymbol`, with an explicit default value of `22.3`, which will be set, when ``TcSymbol.$clear()` is called
            * `.stringValue` - symbol of type `TcStringSymbol : TcSymbol`, which is set to `ReadOnly`, thus any call to `TcSymbol.$clear()` or `TcSymbol.$set()` results in an exception `TcBindingReadOnlyException`, as well as a call to `.stringValue` parent `TcSymbol.$clear()` method will ignore this symbol


```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Exception TcBindingOutOfRangeException
    await context.$.MAIN.rangeValue.$set(10) 

    //MAIN.enumValue is set to 1
    await context.$.MAIN.enumValue.$set('MyEnum.member2')

    //Exception TcBindingReadOnlyException
    await context.$.MAIN.arrayValue[0].stringValue.$set('hello world') 

    //For [0-4] all the .realValue members are set to 22.3 
    //while .stringValue member is left untouched
    await context.$.MAIN.arrayValue.$clear() 

    //Explicit TcContext kill call
    await context.kill();

})
```

The `tc-context` library currently supports all of the TwinCAT Data Types, **with the exception of**:

* Pointers
* References
* Interfaces
* Arrays of the above mentioned types

***NOTE:*** The `TcContext` Object filters out unsupported members, when generating Symbol Maps. If the end result of a `Structure`, `Funtion_Block` or `Array`, is a Symbol with no Children, no mapping will be created for that Object as well.


*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    filteredFB : Foo;
    filteredArr : ARRAY[0..9] OF REFERENCE TO Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    ptr: POINTER TO INT;
    ref : REFERENCE TO BYTE;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //booleanValue is defined
    const booleanValue = context.$.MAIN.booleanValue 

    //filteredFB is undefined
    const filteredFB = context.$.MAIN.filteredFB 

    //filteredArr is undefined
    const filteredArr = context.$.MAIN.filteredArr 

    //Explicit TcContext kill call
    await context.kill();

})
```

## [Read, Write and Clear TcSymbol Operations](#table-of-contents) 

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    numericValue : INT;
    stringValue : STRING(50);
    enumValue : MyEnum;

END_VAR
```
*MyEnum(ENUM)*
```
TYPE MyEnum :
(
	member1 := 0,
	member2 := 1,
	member3 := 2
);
END_TYPE
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Returns the current value of MAIN.booleanValue
    const booleanValue = await context.$.MAIN.booleanValue.$get 

    //Sets the value of MAIN.booleanValue
    await context.$.MAIN.booleanValue.$set(true); 

    //Sets the value of MAIN.enumValue to MyEnum.member2 (1) and then read it back
    const enumValue = await context.$.MAIN.enumValue.$set('MyEnum.member2')
        .then(() => context.$.MAIN.enumValue.$get ) 

    if (enumValue === 'MyEnum.member2') {
        //Clears the MAIN.enumValue to MyEnum.member1 (0)
        await context.$.MAIN.enumValue.$clear() 
    }

    //Explicit TcContext kill call
    await context.kill();

})
```

The `TcSymbol` Object supports the following data operations:

* `$set(val)` - method for writing a value to the Binding of the `TcSymbol` Object. 
    - when `Promise` is fulfilled, it returns the value, which was successfully written to the `TcSymbol`. 
    - when `Promise` is rejected, returns a `TcException` Type Object, with information regarding the error

* `$get` - property for reading the value of the `TcSymbol` Object Binding. 
    - when `Promise` is fulfilled, it returns the value, which was successfully read from the `TcSymbol`. 
    - when `Promise` is rejected, returns a `TcException` Type Object, with information regarding the error

* `$clear()` - method for clearing the Binding of the `TcSymbol` based on either its default value, or the explicitly specified `Default` Attribute value
    - when `Promise` is fulfilled, clearing has successfully completed
    - when `Promise` is rejected, returns a `TcException` Type Object, with information regarding the error


## [Subscribing to TcSymbol Changes](#table-of-contents) 

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    numericValue : INT;
    stringValue : STRING(50);
    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    booleanValue : BOOL;
    arrayValue : ARRAY[0..9] OF INT;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Activate on-change detection
    await context.$.MAIN.numericValue.$subscribe()
    await context.$.MAIN.foo.$subscribe()
    
    //Attach event handlers
    context.$.MAIN.numericValue.$on('changed', (e) => {
        console.log(`Boolean Value has changed to ${e.data}`);
    })

    context.$.MAIN.foo.$on('changed', (e) => {
        console.log(`{ 
            booleanValue : ${e.data.booleanValue}, 
            arrayValue : ${e.data.arrayValue.toString()}
        }`)
    })


    //When no longer change detection is needed, disable it
    await context.$.MAIN.foo.$unsubscribe();

    //Subscribe to an array.
    await context.$.MAIN.foo.arrayValue.$subscribe();
    context.$.MAIN.foo.arrayValue.$on('changed', (e) => {
        console.log(e.data.toString())
    })

    //Explicit TcContext kill call will also 
    //automatically unsubscribe all active change subscriptions
    await context.kill();

})
```

`TcSymbol` Objects are capable of subscribing to a data `changed` event of type `TcSymbolChangeEvent`. When subscribed, if the PLC symbol changes its value, any handlers, which were attached, will be invoked. To subscribe `TcSymbol.$subscribe()` must be called, and to disable change detection `TcSymbol.$unsubscribe()` is called. Handlers are added to the `TcSymbol` by way of calling `TcSymbol.$on(...)` and `TcSymbol.$once(...)` and are removed through `TcSymbol.$off(...)`. When unsubscribing, event handlers are **not removed**, they are simply ignored.

When subscribing to `Structures`,`Function_Blocks` and `Arrays`, any change that happens to the data of that symbol, will also result in the `changed` event. This includes change in symbol that are not supported.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    booleanValue : BOOL := FALSE;
    ptr : POINTER TO STRING;
    bar : Bar

END_VAR
```
*Bar(FB)*
```
FUNCTION_BLOCK Bar
VAR

    numericValue : INT := 5;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Activate on-change detection
    await context.$.MAIN.foo.$subscribe()
    
    //Attach event handlers
    context.$.MAIN.foo.$on('changed', (e) => {
        console.log(e.data);
    }

    //Hypothetical scenario of indefinite run-time

    //When hypothetical scenario is finished
    await context.kill();

})
```

In the example above, a `TcSymbol.$subscribe()` is activated on `MAIN.foo`, which would mean, any change happening in `MAIN.foo` will invoke the `changed` event. When `MAIN.foo.booleanValue` changes from *FALSE* to *TRUE*, the `TcEvent.data` will contain an output:

```js
{
    booleanValue : true,
    bar : {
        numericValue : 5
    }
}
```

Following the previous scenario, if `MAIN.foo.bar.numericValue` has a change from *5* to *10*, this will also produce the `changed` event, with the following output:

```js
{
    booleanValue : true,
    bar : {
        numericValue : 10
    }
}
```

Lastly, even though `MAIN.foo.ptr` is not supported, and a binding to it is not created, it is still part of the data layout of `MAIN.foo` Symbol. It is because of this a change to the pointer value (*not what its pointing to*), will also produce a `changed` event, with the following output (The 2 previous examples have happened) :

```js
{
    booleanValue : true,
    bar : {
        numericValue : 10
    }
}
```

### [Explicit Sampling Rate](#table-of-contents) 

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    numericValue : INT;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Subscribe with a sampling rate of 1s
    await context.$.MAIN.numericValue.$subscribe(1000)
    
    //Attach event handlers
    context.$.MAIN.numericValue.$on('changed', (e) => {
        console.log(e.data);
    }

    //When hypothetical scenario is finished
    await context.kill();

})
```

For Symbols, the value of which changes rapidly, and detection of the change each time would either be too costly or unneeded, it is possible to explicitly set the sampling rate in milliseconds, as the argument for `TcSymbol.$subscribe()`. This will keep any changes of the Symbol from emitting `changed` event between the sampling period.

## [Structured TcSymbols](#table-of-contents)

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    booleanValue : BOOL;
    numericValue : INT;
    stringValue : STRING;
    bar : Bar

END_VAR
```
*Bar(FB)*
```
FUNCTION_BLOCK Bar
VAR

    numericValue : INT;
    booleanValue : BOOL;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    await context.$.MAIN.foo.$set({ booleanValue : true, numericValue : 10});
    let result = await context.$.MAIN.foo.$get;
    /**
     * result : {
     *      booleanValue : true
     *      numericValue : 10
     *      stringValue : ''
     *      bar : {
     *          numericValue : 0
     *          booleanValue : false
     *      }
     * }
     */

    await context.$.MAIN.foo.$set({ 
        stringValue : 'hello world'
        bar : {
            numericValue : 15,
            booleanValue : true
        }    
    })
    result = await context.$.MAIN.foo.$get;
    /**
     * result : {
     *      booleanValue : true
     *      numericValue : 10
     *      stringValue : 'hello world'
     *      bar : {
     *          numericValue : 15
     *          booleanValue : true
     *      }
     * }
     */

    //Writing to a non existent child, will result in an exception
    await context.$.MAIN.foo.$set({ nonExistent : 56.6 })
        .catch(err => console.log(err));
    /**
     * TcBindingOutOfRangeException : ....
     */

    context.$.MAIN.foo.bar.$each(symbol => {
        console.log(symbol.$binding.path)
    })
    /**
     * Output :
     *  MAIN.foo.bar.numericValue
     *  MAIN.foo.bar.booleanValue
     */

    await context.$.MAIN.foo.$clear();
    result = await context.$.MAIN.foo.$get;
    /**
     * result : {
     *      booleanValue : false
     *      numericValue : 0
     *      stringValue : ''
     *      bar : {
     *          numericValue : 0
     *          booleanValue : false
     *      }
     * }
     */
    
    await context.kill();

})
```

`TcSymbol` Objects are capable of operating on `Structures` and `Function_Blocks`. For `TcContext` both `Structures` and `Function_Blocks` are treated equally as structures of data. It is possible to write only explicit parts of a `TcSymbol` symbol, bound to a `Structure` or `Function_Block`

Calling `TcSymbol.$clear()` will clear all the members of the `Structure` or `Function_Block`, with the only exception of **ignoring any child marked with** ***{attribute 'ReadOnly'}***.
By calling `TcSymbol.$get` property, a full data-map of all nested-children is returned, with the exception of symbol marked with ***{attribute 'Ignore'}***

When writing to a child, which is not part of `TcSymbol`, the operation will result in an exception of type `TcBindingOutOfRangeException`.

### [Method call on Structured TcSymbols](#table-of-contents)

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    booleanValue : BOOL;

END_VAR

{attribute 'TcRpcEnable'}
METHOD basicTask : INT
VAR_INPUT
    lhs : INT,
    rhs : INT
END_VAR

basicTask := lhs + rhs;

{attribute 'TcRpcEnable'}
METHOD complexTask : BOOL
VAR_INPUT
    lhs : INT;
    rhs : INT;
END_VAR
VAR_OUTPUT
	sum : INT;
	diff : INT;
END_VAR

complexTask := TRUE;
sum := lhs + rhs;
diff := lhs - rhs;
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    const basicTask = await context.$.MAIN.foo.basicTask({ lhs : 10, rhs : 15 });
    /**
     * basicTask : {
     *      result : 25
     * }
     */

    const complexTask = await context.$.MAIN.foo.complexTask({ lhs : 15, rhs : 10 });
    /**
     * basicTask : {
     *      result : 25
     *      outputs : {
     *          sum : 25,
     *          diff : 5
     *      }
     * }
     */

    await context.kill();

})
```

It is possible to invoke RPC Methods, marked with `{attribute 'TcRpcEnable'}`, on the PLC Side through the `TcContext`. Upon completion, a Javascript Object is returned with a field `result`, which contains the return value of the method call.
If the method has `VAR_OUTPUT` variables, the return of the method call will also contain `outputs` field, which store the values.

***NOTE:*** As of now, no type checking is performed when passing values to the method call, it is a direct route to the [ads-client](https://github.com/jisotalo/ads-client). See official documentation for the limitations of Rpc Method calls. This is important when dealing with `enumerators`. When writing and reading `enumerators` directly, their type is included, however when passing them to a Rpc Method, the type name of the enum must be omitted.

If the method call fails, exceptions of type `TcComIsInvalidException` or `TcComMethodCallException` are raised.


### [Unions and TcSymbols](#table-of-contents)

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    myUnion : MyUnion;

END_VAR
```
*MyUnion(UNION)*
```
TYPE DUT :
UNION

    a : LREAL;
    b : LINT;
    c : WORD;

END_UNION
END_TYPE
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    let result = await context.$.MAIN.myUnion.$get
    /**
     * result : {
     *      a : 0,
     *      b : 0,
     *      c : 0
     *  }
     */

    await context.$.MAIN.myUnion.c.$set(10)
    let result = await context.$.MAIN.myUnion.$get
    /**
     * result : {
     *      a : 4.94065645841247E-323,
     *      b : 10,
     *      c : 10
     *  }
     */

    await context.kill();

})
```

`UNIONs` are considered Structured symbols in the `tc-context` library, and are accessed and manipulated the same way as Structured `TcSymbols`.

## [Array TcSymbols](#table-of-contents)

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    arr : ARRAY[0..4] OF BOOLEAN;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    await context.$.MAIN.arr.$set([true, true, true]);
    let result = await context.$.MAIN.arr.$get;
    /**
     * result : [true, true, true, false, false]
     */

    await context.$.MAIN.arr.$clear();
    result = await context.$.MAIN.arr.$get;
    /**
     * result : [false, false, false, false, false]
     */   
    
    await context.$.MAIN.arr[3].$set(true);
    result = await context.$.MAIN.arr[3].$get;
    /**
     * result : true
     */
    
    result = await context.$.MAIN.arr.$get;
    /**
     * result : [false, false, true, false, false]
     */   

    context.$.MAIN.arr.$each(symbol => {
        console.log(symbol.$binding.name)
    })
    /**
     * Output :
     *  arr[0]
     *  arr[1]
     *  arr[2]
     *  arr[3]
     *  arr[4]
     */

    await context.kill();

})
```

The `TcContext`is capable of generating a `TcSymbol` for TwinCAT array types, allowing for reading, writing, clearing and subscribing operations on the array as a whole, as well as accessing individual members through the subscript operator.
***NOTE:*** The indexes of `TcSymbol` array are synchronized with the TwinCAT array indexes. This means the starting index of a `TcSymbol` of an `array` is that of the starting symbol of the TwinCAT `array`.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    arr1 : ARRAY[0..4] OF INT;
    arr2 : ARRAY[1..5] OF INT;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    console.log({ 
        startIndex : context.$.MAIN.arr1.$startIndex,
        length : context.$.MAIN.arr1.$length
    })
    /**
     * Output : { startIndex : 0, length : 5 }
     */

    console.log({ 
        startIndex : context.$.MAIN.arr2.$startIndex,
        length : context.$.MAIN.arr2.$length
    })
    /**
     * Output : { startIndex : 1, length : 5 }
     */

    context.$.MAIN.arr1.$each((symbol, index) => {
        console.log({ index, name : symbol : symbol.$binding.key})
    })
    /**
     * Output :
     *  { index : 0, symbol : arr1[0]}
     *  { index : 1, symbol : arr1[1]}
     *  { index : 2, symbol : arr1[2]}
     *  { index : 3, symbol : arr1[3]}
     *  { index : 4, symbol : arr1[4]}
     */

    context.$.MAIN.arr2.$each((symbol, index) => {
        console.log({ index, name : symbol : symbol.$binding.key})
    })
    /**
     * Output :
     *  { index : 1, symbol : arr1[1]}
     *  { index : 2, symbol : arr1[2]}
     *  { index : 3, symbol : arr1[3]}
     *  { index : 4, symbol : arr1[4]}
     *  { index : 5, symbol : arr1[5]}
     */

    //elem is undefined
    const elem = context.$.MAIN.arr2[0];

    await context.kill();

})
```

### [Multidimensional Array](#table-of-contents)

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    arr1 : ARRAY[0..2, 0..2] OF INT;
    arr2 : ARRAY[0..2] OF ARRAY[0..2] OF INT;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    let result = await context.$.MAIN.arr1.$get;
    /**
     * result : [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
     */

    result = await context.$.MAIN.arr1[1].$get;
    /**
     * result : [0, 0, 0]
     */

    await context.$.MAIN.arr2[2].$set([1, 2, 3])    
    result = await context.$.MAIN.arr2.$get;
    /**
     * result : [[0, 0, 0], [0, 0, 0], [1, 2, 3]]
     */

    await context.$.MAIN.arr1[1][1].$set(10);
    result = await context.$.MAIN.arr1[1].$get;
    /**
     * result : [0, 10, 0]
     */

    result = await context.$.MAIN.arr2.$clear()
        .then(() => context.$.MAIN.arr2.$get)
    /**
     * result : [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
     */

    result = await context.$.MAIN.arr1[1].$clear()
        .then(() => context.$.MAIN.arr1.$get)
    /**
     * result : [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
     */

    await context.kill();

})
```

TwinCAT allows for 2 different ways of declaring Multidimensional Arrays :
* `ARRAY[dimension1, dimension2, ...., dimensionN] OF <type>`
* `ARRAY[dimension1] OF ARRAY[dimension2] OF ..... ARRAY[dimensionN] of <type>`

Regardless of the case, the `TcContext` treats both of these multidimensional arrays as multidimensional Javascript Arrays, and will process them accordingly. This allows for `TcSymbol.$get`, `TcSymbol.$set()`, `TcSymbol.$clear()` and `TcSymbol.$subscribe()` operations on any of the dimension levels.

## [TcSymbol Types](#table-of-contents) 

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    numericValue : INT[10..50];
    stringValue : STRING(10);
    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    arrayValue : ARRAY[0..4] OF int;
    enumValue : MyEnum;

END_VAR
```
*MyEnum(ENUM)*
```
TYPE MyEnum :
(
	member1 := 0,
	member2 := 1,
	member3 := 2
);
END_TYPE
```
*index.js*
```js
const { TcContext, TcSymbols } = require('tc-context')

TcContext.create().then(async context => {

    if (context.$.MAIN.numericValue instanceof TcSymbols.TcNumericSymbol) {
        console.log({ 
            min : context.$.MAIN.numericValue.$lowerBorder 
            max : context.$.MAIN.numericValue.$upperBorder    
        })
    }
    /**
     * Output :
     * { min : 10, max : 50 }
     */
    
    if (context.$.MAIN.stringValue instanceof TcSymbols.TcStringSymbol) {
        console.log({ length : context.$.MAIN.stringValue.$length })
    }
    /**
     * Output :
     * { length : 10 }
     */

    if (context.$.MAIN.foo instanceof TcSymbols.TcStructureSymbol) {
        context.$.MAIN.foo.$each(symbol => {
            if (symbol instanceof TcSymbols.TcArraySymbol) {
                console.log({ length : symbol.$length })

            } else if (symbol instanceof TcSymbols.TcEnumSymbol) {
                console.log({ fields : symbol.$fields })
            }
        })
    }
    /**
     * Output :
     * { length : 5 }
     * { fields : ['MyEnum.member1', 'MyEnum.member2', 'MyEnum.member3']}
     */

    //Explicit TcContext kill call
    await context.kill();

})
```

`TcSymbol` provides the base foundation for `TcContext` Symbol Map creation. Each of the `TcSymbols`, has a concrete type, depending on the PLC Symbol Type. The concrete `TcSymbol` performs type checks and range checks, as well as exposes additional, type specific, functionality. The concrete types of `TcSymbol` and their unique functionality is described below.

There is no implicit type conversion done. All symbols must be provided with the exact type of value, when performing `TcSymbol.$set()` operations. The reason is to ensure there is no ambiguity when operating on the PLC.

### [TcBooleanSymbol](#table-of-contents) 

`TcBooleanSymbol` represents the `BOOL` Data Type of the PLC, and is the most similar to the base `TcSymbol`. The only difference is, that it performs type checking abd throwing an exception of type `TcBindingInvalidTypeException`, if during the `TcSymbol.$set()` call, the value passed is not of type `boolean`.

### [TcNumericSymbol](#table-of-contents) 

`TcNumericSymbol` represents all the numeric Data Type Symbols of the PLC, and exposes additional symbol information, in the form of `TcNumericSymbol.$upperBorder` and `TcNumericSymbol.$lowerBorder`.

When performing a `TcSymbol.$set()`, the input value is check to be of type `number`, and that the value is within the specified range. Failure to comply results in exceptions of type `TcBindingInvalidTypeException` and `TcBindingOutOfRangeException` respectfully.

### [TcStringSymbol](#table-of-contents) 

`TcStringSymbol` represents `STRING` and `WSTRING` Data Types of the PLC, and exposes the `TcStringSymbol.$length` property, which states the maximum length of a string, that can be written to it.

`TcStringSymbol` performs type checking on the the passed argument to `TcSymbol.$set()` to make sure it is of type `string` and does not exceed the specified length. Failure to comply results in exceptions of type `TcBindingInvalidTypeException` and `TcBindingOutOfRangeException` respectfully.

### [TcEnumSymbol](#table-of-contents) 

`TcEnumSymbol` represents the `ENUM` Data Types of the PLC and provides the `TcEnumSymbol.$fields` property. This property provides a list of strings of all the acceptable inputs to the `TcSymbol.

The `TcEnumSymbol` performs type checking on the the passed argument to `TcSymbol.$set()` to make sure it is of type `string` and is part of the `TcEnumSymbol.$fields` list. Failure to comply results in exceptions of type `TcBindingInvalidTypeException` and `TcBindingOutOfRangeException` respectfully.

***IMPORTANT:*** Alias to `ENUM` is treated as its own unique type. Be aware of this.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    enumValue : MyEnum;

END_VAR
```
*MyEnum(ENUM)*
```
TYPE MyEnum :
(
	member1 := 0,
	member2 := 1,
	member3 := 2
);
END_TYPE
```
*index.js*
```js
const { TcContext, TcEnumSymbol } = require('tc-context');

TcContext.create().then(async context => {


    if (context.$.MAIN.enumValue instanceof TcSymbols.TcEnumSymbol) {
        console.log(context.$.MAIN.enumValue.$fields)
    }
    /**
     * Output :
     * ['MyEnum.member1', 'MyEnum.member2', 'MyEnum.member3']
     */

    await context.$.MAIN.enumValue.$set('MyEnum.member3');
    let result = await context.$.MAIN.enumValue.$get;
    /**
     * result : 'MyEnum.member3'
     */

    await context.$.MAIN.enumValue.$set('WrongValue')
        .catch(err => console.log(err))
    /**
     * Output :
     *  TcBindingOutOfRangeException
     */

    await context.kill()

})
```

### [TcStructureSymbol](#table-of-contents) 

`TcStructureSymbol` represents `Structure` and `Function_Block` Data Types of the PLC. As of now, no distinction between the two types is made from the pointer of view of `TcContext`. 

The `TcStructureSymbol` performs a type check, to make sure any argument that is passed to `TcSymbol.$set()` is a plain Javascript Object, otherwise a `TcBindingInvalidTypeException` exception is raised. 

Additionally, `TcStructureSymbol` provides `TcStructureSymbol.$each()` function, which iterates over all of its children `TcSymbols`.

### [TcArraySymbol](#table-of-contents) 

`TcArraySymbol` represents `ARRAY[...] OF <type>` Data Type of the PLC. Similarly to the `TcStructureSymbol`, the `TcArraySymbol` also provides a `TcArraySymbol.$each()` function, which iterates over all of its children `TcSymbols`.

Due to TwinCAT allowing to explicitly specify the starting index of an array, that start index can be read through the `TcArraySymbol.$startIndex` property. Lastly, `TcArraySymbol.$length` allows to read the length of the `TcArraySymbol` array.

When writing to `TcSymbol.$set()`, the `TcArraySymbol` will perform type checking on the input argument, to make sure it is of type `array`, as well as that the written array does not exceed the length of the `TcArraySymbol`. Failure to comply results in exceptions of type `TcBindingInvalidTypeException` and `TcBindingOutOfRangeException` respectfully.

## [Invalidated TcSymbol](#table-of-contents)

In a situation the where the `TcContext` was `reinitialized`, any previously stored `TcSymbol` becomes invalidated. One way to managed invalidation, is by assigning a callback to `TcSymbol.$onInvalidated()` method. This method will be called, when the `TcContext` invalidates the `TcSymbol`. Invalidation in a Symbol Map happens from the bottom-up, where children are invalidated before their parents are.

## [TcSymbol Attributes](#table-of-contents) 

Beckhoff PLC Symbol can be marked with special attributes, which are processed by `TcContext`. These attributes alter the behavior of some `TcSymbols` and impose additional rules.

### [TcSymbol Default Attribute](#table-of-contents) 

All Primitive Data Types (Not `Structures`, `Function_Blocks` or `Arrays`) support the `Default` Attribute. This attribute informs what value to write upon a call to `TcSymbol.$clear()`. If no value is specified, the value that is written, is that of a an initial value (false for `boolean`, 0 for `numbers` and empty string for `string`).

`Structures`, `Function_Blocks` and `Arrays` are not affected by the `Default` attribute.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    {attribute 'Default' := 'true'}
    booleanValue : BOOL;
    {attribute 'Default' := '5'}
    numericValue : INT;
    {attribute 'Default' := 'hello world'}
    stringValue : STRING(50);
    {attribute 'Default' := 'member3'}
    enumValue : MyEnum;

END_VAR
```
*MyEnum(ENUM)*
```
TYPE MyEnum :
(
	member1 := 0,
	member2 := 1,
	member3 := 2
);
END_TYPE
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //MAIN.booleanValue is set to true
    await context.$.MAIN.booleanValue.$clear() 

    //MAIN.numericValue is set to 5
    await context.$.MAIN.numericValue.$clear() 

    //MAIN.stringValue is set to 'hello world'
    await context.$.MAIN.stringValue.$clear() 

    //MAIN.enumValue is set to 'MyEnum.member3'
    await context.$.MAIN.enumValue.$clear() 

    //Explicit TcContext kill call
    await context.kill();

})
```

### [TcSymbol ReadOnly Attribute](#table-of-contents) 

All Bindable Types support the `ReadOnly` Attribute. The `ReadOnly` attributes ensures that no write operation can be made to the `TcSymbol` Object, either through the `TcSymbol.$set()` method or `TcSymbol.$clear()`. If a write operation is made to a `ReadOnly` Object, a `TcBindingReadOnlyException` Exception is thrown. 

If `TcStructureSymbol` or `TcArraySymbol` is marked as `ReadOnly`, then all of their children `TcSymbols` are marked as `ReadOnly` as well. When calling `TcSymbol.$clear()` on `TcStructureSymbol` Object that is not `ReadOnly`, but has children marked as `ReadOnly`, those children will be ignored during the `TcSymbol.$clear()` operation.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    {attribute 'ReadOnly'}
    booleanValue : BOOL;
    {attribute 'ReadOnly'}
    numericValue : INT;
    {attribute 'ReadOnly'}
    readOnlyFoo : Foo;
    normalFoo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    {attribute 'ReadOnly'}
    stringValue: STRING := 'hello world';
    numericValue : BYTE := 100;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //MAIN.booleanValue will throw exception
    await context.$.MAIN.booleanValue.$clear().catch(err => {
        //MAIN.booleanValue is ReadOnly. This block will execute
    })

    //MAIN.numericValue will throw exception
    await context.$.MAIN.numericValue.$clear().catch(err => {
        //MAIN.numericValue is ReadOnly. This block will execute
    })

    //MAIN.foo will throw exception
    await context.$.MAIN.foo.$clear().catch(err => {
        //MAIN.foo is ReadOnly. This block will execute
    })

    //This will not raise an exception, however MAIN.normalFoo.stringValue will be left untouched
    const result = await context.$.MAIN.normalFoo.$clear().then(() => context.$.MAIN.normalFoo.$get);
    /**
     * result : {
     *      stringValue : 'hello world'
     *      numericValue : 0
     * }
     */

    //Explicit TcContext kill call
    await context.kill();

})
```

### [TcSymbol Ignore Attribute](#table-of-contents) 

All bindable types support the `Ignore` Attribute. The `Ignore` attributes ensures that no `TcSymbol` generation takes place by the `TcContext`. The `Ignore` attribute, when applied to `TcStructureSymbol` and `TcArraySymbol`, will also be applied to its children. If the end result of a `TcStructureSymbol` is an Object with no children, then that `TcStructureSymbol` will also be ignored.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    numericValue : INT;
    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    {attribute 'Ignore'}
    stringValue: STRING := 'hello world';
    byteValue : BYTE := 100;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //booleanValue is defined 
    const booleanValue = context.$.MAIN.booleanValue;

    //numericValue is defined
    const numericValue = context.$.MAIN.numericValue;

    //byteValue is defined 
    const byteValue = context.$.MAIN.foo.byteValue;

    //stringValue is undefined
    const stringValue = context.$.MAIN.foo.stringValue;

    //Explicit TcContext kill call
    await context.kill();

})
```


### [TcSymbol Event Alias Attribute](#table-of-contents) 

It is possible to apply an alias to the events produced by `TcSymbols`. This way it is possible to narrow-down event handling, based on the specified alias.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    {attribute 'onSet' := 'stringSet'}
    stringValue: STRING := 'hello world';

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    //Listen for the aliased event
    context.$.MAIN.foo.stringValue.$on('stringSet', (e) => {
        console.log('set was aliased to stringSet : ', e.data);
    })

    //Explicit TcContext kill call
    await context.kill();

})
```

When aliasing a `TcSymbol's` event, the default event name will be replaced by the provided name, based on the Attribute Parameter. These attributes are:
* `onSet` - will replace the `set` event
* `onGet` - will replace the `get` event
* `onClear` - will replace the `cleared` event
* `onChange` - will replace the `changed` event.


# [TcEvents](#table-of-contents)

All events emitted by the components of `TcContext` inherit from `TcEvent`. The `TcEvent` in `TcContext` are designed to propagate the emitted event up from the component , all the way to the `TcContext` Object.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL;
    numericValue : INT;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    context.$.MAIN.booleanValue.$on('set', () => {
        console.log('set was called on MAIN.booleanValue')
    })

    context.on('set', () => {
        console.log('event propagated to context, where it was also caught')
    })

    await context.$.MAIN.booleanValue.$set(true);
    /**
     * When set completed output :
     * 'set was called on MAIN.booleanValue'
     * 'context also caught the event'
     */

    //Explicit TcContext kill call
    await context.kill();

})
```

If the `TcEvent` has been handled, and the propagation of the event is no longer wanted, a call to `TcEvent.stopPropagation()` function will stop any propagation up towards `TcContext`.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    foo : Foo;

END_VAR
```
*Foo(FB)*
```
FUNCTION_BLOCK Foo
VAR

    {attribute 'onChange' := 'booleanChanged'}
    booleanValue: BOOL;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {

    context.$.on('booleanChanged', (e) => {
        console.log('caught booleanChanged event')
        e.stopPropagation()
    })

    context.on('booleanChanged', () => {
        //This will never happen, because event stopped Propagated
    })

    //Explicit TcContext kill call
    await context.kill();

})
```

## [TcEvent List](#table-of-contents)

List of all events produced by the `tc-context` library. 

Component | Event | Event Type | Description
-|-|-|-
`TcComponent` | `killed` | `TcContextKilledEvent` | When the current `TcContext` is killed and no longer is valid
| `reinitialized` | `TcContextReinitializedEvent` | When the current `TcContext` was rebuild and is once again valid 
`TcCom`| `connected` | `TcComConnectedEvent` | When the current `TcContext` established the initial connection to the PLC 
| `disconnected` | `TcComDisconnectedEvent` | When the current connection to the PLC has been closed 
| `sourceChanged` | `TcComSourceChangedEvent` | When the PLC Code base changes during an active connection 
| `connectionLost` | `TcComConnectionLostEvent` | When the TcCom looses connection to the Target PLC
| `reconnected` | `TcComReconnectedEvent` | When the TcCom reestablishes the connection to the Target PLC
`TcSymbol` | `set` | `TcSymbolSetEvent` | When a `.$set()` operation was completed 
| `get` | `TcSymbolGetEvent` | When a `.$get` operation was completed 
| `cleared` | `TcSymbolClearedEvent` | When a `.$clear()` operation was completed 
| `changed` | `TcSymbolChangedEvent` | When the symbol value changed post `.$subscribe()` operation 
`TcSymbolRegistry` | `created` | `TcSymbolRegistryCreatedEvent` | When the Symbol Map has been created 
| `destroyed` | `TcSymbolRegistryDestroyedEvent` | When the Symbol Map has been destroyed 
`TcTypeRegistry` | `created` | `TcTypeRegistryCreatedEvent` | When the Type Map has been created 
| `destroyed` | `TcTypeRegistryDestroyedEvent` | When the Type Map has been destroyed 

## [TcEvent Hierarchy](#table-of-contents)

Base | Component | Concrete
-|-|-
`TcEvent` | `TcContextEvent` | `TcContextReinitializedEvent`
|| `TcContextKilledEvent`
| `TcSymbolEvent` | `TcSymbolGetEvent`
|| `TcSymbolSetEvent`
|| `TcSymbolClearedEvent`
|| `TcSymbolChangedEvent`
| `TcComEvent` | `TcComConnectedEvent`
|| `TcComDisconnectedEvent`
|| `TcComSourceChangedEvent`
| `TcTypeRegistryEvent` | `TcTypeRegistryCreatedEvent`
|| `TcTypeRegistryDestroyedEvent`
| `TcSymbolRegistryEvent` | `TcSymbolRegistryCreatedEvent`
|| `TcSymbolRegistryDestroyedEvent`

# [Understanding TcContext Lifecycle](#table-of-contents) 

```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {
    
    //Attach listeners for kill event...
    context.on('killed', () => console.log('context was killed'));

    //TcContext manipulation code.....

    //Explicit TcContext kill call
    await context.kill();

    //TcContext is no longer valid after this point, and 
    //any symbols produced by it should no longer be used...

})

/**
 * Expected output:
 * 
 * context was killed
 */
```
During normal operation, a `TcContext` is valid from the moment it was created through `TcContext.create()` call, upon until a call to `TcContext.kill()` is made. When `TcContext.kill()`completes its task, a `killed` event of type `TcContextKilledEvent` is emitted, which can be captured.

This holds true if ***no PLC-side code changes have been made from `TcContext's` creation moment***. If Activation of new configuration, or any Code Change takes place after `TcContext.create()` was called, then that change in `TcContext` will be detected. When detected, the `TcContext` will invalidate all the created `TcSymbols`, remove all subscriptions, clear Type and Symbol maps, kill itself, and then it will build a new map, based on the new symbols types and locations, which are present in the PLC.

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL := TRUE;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

TcContext.create().then(async context => {
    
    //Attach listeners for kill and reinitialized events...
    context.on('killed', () => console.log('context was killed'));
    context.on('reinitialized', () => console.log('context was reinitialized'));

    //Storing the symbol for use.
    const booleanValue = context.$.MAIN.booleanValue; 

    /**
     * Hypothetical scenario...
     * Some code that uses the context cyclically for undefined period of time
     * without yet reaching the .kill() call.
     * 
     * During this hypothetical time - the PLC Configuration was changed
     */

    //The line below is reached only after the PLC Configuration was changed 
    //in the above hypothetical scenario
    await booleanValue.$set(true)
        .catch(err => console.log(err));
    
/**
 * Expected output:
 * 
 * context was killed
 * context was reinitialized
 * TcBindingIsInvalidException : 
 *      Attempting to read an Invalidated TcBinding[\<symbol name\>] ( \<symbol path\> )...
 */
})
```

As seen above, if after `TcContext` was created, changes to code of the PLC have been made, the `TcContext` will detect it, and perform the `TcContext.kill()` operation automatically, upon completion of which, the `killed` event of type `TcContextKilledEvent` will be raised. Afterwards, the `TcContext` will reconnect to the PLC, and a generation and build of new Type and Symbol Maps is executed. When completed the `TcContext` will raise the `reinitialized` event of type `TcContextReinitializedEvent`. Any attempt to perform operations on any previously stored Invalidated `TcSymbols` (such as `booleanValue` in the example above), will result in an exception of type `TcBindingIsInvalidException`

These events can be used, as means of updating any dependencies, which utilize the created `TcSymbols` by the `TcContext` and thus ensuring stability.

***NOTE:*** The reason for this approach, is because upon `TcContext` creation, a scan is performed, which caches all the Types and Symbols, as well as their memory locations in the PLC. These memory locations are used as a means of reading, writing, clearing and subscribing to symbols, simple or complex. When an online change is performed, there are no guaranties that the location of the previously cached symbols is same, and even if an update to it can be made, the symbol itself could be of different type. All this would result in **undefined behavior**. 

*MAIN(PRG)*
```
PROGRAM MAIN
VAR

    booleanValue : BOOL := TRUE;

END_VAR
```
*index.js*
```js
const { TcContext } = require('tc-context')

//Example of class which uses a symbol for its operation
class Foo {
    
    //Bind the symbol at construction
    constructor(symbol) { this.__symbol = symbol; }

    //Means to update the binding of the symbol
    bind(symbol) { 
        console.log('setting new symbol')
        this.__symbol = symbol 
    }

    //Method which uses the symbol
    async printState() { 
        if (this.__symbol) {
            const val = await this.__symbol.$get;
            return (val) ? 'Symbol is on' : 'Symbol is off'
        }
    }
}

TcContext.create().then(async context => {
    
    //Create the object which is dependent on the TcContext's symbol
    const bar = new Foo(context.$.MAIN.booleanValue);

    //When invalidated set the binding to null
    context.$.MAIN.booleanValue.$onInvalidated(() => {
        console.log('symbol was invalidated')
        bar.bind(null);
    })

    context.on('reinitialized', () => { 
        console.log('context was reinitialized')
        bar.bind(context.$.MAIN.booleanValue);
    })

    /**
     * Hypothetical scenario...
     * Some code that uses the context cyclically for undefined period of time
     * without yet reaching the .kill() call.
     * 
     * During this hypothetical time - the PLC Configuration was changed
     */

    //The line below is reached only after the PLC Configuration was 
    //changed in the above hypothetical scenario
    await bar.printState()    
    await context.kill()
})

/**
 * Expected output:
 * 
 * symbol was invalidated
 * setting new symbol 
 * context was reinitialized
 * setting new symbol
 * Symbol is on
 * symbol was invalidated
 * setting new symbol
 */
```

The example above illustrates how any components, which depends on `TcSymbol`, can use the emitted events to refresh its bindings, thus ensuring defined behavior.

# [TcExceptions](#table-of-contents)

Base | Component | Concrete | Description
-|-|-|-
`TcException` | `TcBindingException` | `TcBindingIsInvalidException` | When operations are made on a `TcSymbol` of a killed `TcContext`
|| `TcBindingInvalidTypeException` | When input type does not match `TcSymbol` type
|| `TcBindingOutOfRangeException` | When input data length is outside the boundaries of `TcSymbol`
|| `TcBindingReadOnlyException` | When write commands are called on a Read-only `TcSymbol`
| `TcComException` | `TcComBusyException` | Connection to a PLC has already been made
|| `TcComConnectException` | When an error occurred with establishing connection
|| `TcComIsInvalidException` | When operations are made on a `TcCom` of a killed `TcContext`
|| `TcComDisconnectException` | When an error occurred with disconnecting from Target
|| `TcComChangeDetectionException` | When an error occurred with establishing Code Change Monitoring
|| `TcComUnsubscribeException` | When an error occurred with unsubscribing from TwinCAT Symbol
|| `TcComFromRawException` | When an error occurred when transforming Data from Raw
|| `TcComToRawException` | When an error occurred when transforming Data to Raw
|| `TcComSubscribeException` | When an error occurred with subscribing to a TwinCAT Symbol
|| `TcComDataWriteException` | When an error occurred during data writing to TwinCAT
|| `TcComDataReadException` | When an error occurred during data reading from TwinCAT
|| `TcComTypeQueryException` | When an error occurred with querying Type Data from TwinCAT
|| `TcComSymbolQueryException` | When an error occurred with querying Symbol Data from TwinCAT
|| `TcComMethodCallException` | When an error occurred with invoking a RPC Method over ADS

# [Documentation](#table-of-contents)

Detailed documentation of the `TcContext` code base itself can be found under the /docs/ folder in this repository.

# [Acknowledgments](#table-of-contents) 

* Jussi Isotalo <j.isotalo91@gmail.com> and his [ads-client](https://github.com/jisotalo/ads-client) library

# [License](#table-of-contents) 

*Licensed under MIT License.*

*Copyright (c) 2020 Dmitrij Trifanov <d.v.trifanov@gmail.com>*

*Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:*

*The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.*

*THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.*