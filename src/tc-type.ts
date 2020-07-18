// tc-symbol.ts
/**
 * Module, which contains the definitions of all support TwinCAT Types, from which `TcSymbols` can be instantiated 
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

import { TcContext } from './tc-context';
import { TcSymbol, TcBooleanSymbol, TcArraySymbol, TcNumericSymbol, TcEnumSymbol, TcStringSymbol, TcStructureSymbol } from './tc-symbol';
import { TcTypeInfo, TcEnumBuffers, TcArrayDimension, ADST, TcTypeBase, TcSymbolPointer } from './tc-com';
import { string } from 'check-types';

/**
 * Base class for a TwinCAT Type, designed to store the basic information of the Type, as well as provide options
 * for cloning itself, and extending with additional attributes.
 * 
 * Types can be mutated with attributes, which allow for altered behavior. 
 */
export abstract class TcType {

    /**
     * Creates the base for a TwinCAT Data type. Can be build either from raw ADS Type Info, or from
     * an existing `TcType`
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcType, debug : boolean = false) {

        this.__log.enabled = debug;

        if (typeData instanceof TcType) {

            this.__name = typeData.name;
            this.__adst = typeData.adst;
            this.__readOnly = typeData.readOnly;
            this.__default = typeData.defaultValue;
            this.__offset = typeData.offset;
            this.__size = typeData.size;
            this.__defaultBuffer = typeData.defaultBuffer;
            this.__ignored = typeData.ignored;
            this.__onSet = typeData.onSet;
            this.__onGet = typeData.onGet;
            this.__onClear = typeData.onClear;
            this.__onChange = typeData.onChange;

        } else {

            this.__name = typeData.name;
            this.__adst = typeData.adsDataType;
            this.__offset = typeData.offset || 0;
            this.__size = typeData.size;
            this.mutate(typeData);

        }
        this.__context = context;
    }

    /**
     * The default value for this `TcType`
     */
    get defaultValue() : any { return this.__default };
    set defaultValue(val : any) { this.__default = val };

    /**
     * Flag, if this `TcType` is ignored during Symbol Building
     */
    get ignored() : boolean { return this.__ignored };
    set ignored(val : boolean) { this.__ignored = val};

    /**
     * The {@link ADST} Type ID
     */
    get adst() : number { return this.__adst };

    /**
     * The memory offset, relative to its parent, if the `TcType` is a child
     */
    get offset() : number { return this.__offset };
    set offset(val : number) {this.__offset = val };

    /**
     * Size of the Target PLC Type
     */
    get size() : number { return this.__size };
    set size(val : number) { this.__size = val };

    /**
     * If a default value is present, the default byte buffer of that value
     */
    get defaultBuffer() : Buffer | undefined { return this.__defaultBuffer};
    set defaultBuffer(val : Buffer | undefined)  { this.__defaultBuffer = val };

    /**
     * Flag, if this `TcType` is ReadOnly
     */
    get readOnly() : boolean { return this.__readOnly };
    set readOnly(val : boolean) { this.__readOnly = val };

    /**
     * The Target PLC Type name
     */
    get name() : string { return this.__name };

    /**
     * The `TcContext`, which this `TcType` is part of 
     */
    get context() : TcContext { return this.__context };

    /**
     * Alias to use, in place of the default 'set' event, when
     * a `TcSymbol` of this type is constructed
     */
    get onSet() : string { return this.__onSet || 'set' };
    set onSet(val : string) { this.__onSet = val }

    /**
     * Alias to use, in place of the default 'get' event, when
     * a `TcSymbol` of this type is constructed
     */
    get onGet() : string { return this.__onGet || 'get' };
    set onGet(val : string) { this.__onGet = val }

    /**
     * Alias to use, in place of the default 'cleared' event, when
     * a `TcSymbol` of this type is constructed
     */
    get onClear() : string { return this.__onClear || 'cleared' };
    set onClear(val : string) { this.__onClear = val }

    /**
     * Alias to use, in place of the default 'changed' event, when
     * a `TcSymbol` of this type is constructed
     */
    get onChange() : string { return this.__onChange || 'changed' };
    set onChange(val : string) { this.__onChange = val }

    /**
     * Clones this `TcType` and mutates it, with additional attributes from
     * the mutator
     * 
     * @param mutator - Will use the Attributes and Offset to create a mutation of this `TcType`
     */
    mutate(mutator : TcTypeBase) {
        mutator.attributes?.forEach(({name, value}) => {
            this.__getParameter(name, value);
        })
        this.offset = mutator.offset || this.offset;
    }

    /**
     * Extends the current `TcType` with the provided `TcTypeInfo`. The default extension
     * can either create a mutation of the current `TcType` or transform the `TcType` into
     * an array
     *  
     * @param adsTypeData - Data with which to extends the `TcType`
     * 
     * @return - Either the extends `TcType` or `undefined` if extension failed
     */
    async extend(adsTypeData : TcTypeInfo) : Promise<TcType | undefined> {
        if (adsTypeData.adsDataType === this.adst) {
            if (adsTypeData.arrayData.length) {
                return TcArrayType.create(this.context, adsTypeData, this, this.__log.enabled);

            } else return this.clone(adsTypeData);
        }
    };


    /**
     * Will create a `TcSymbol` instance based on this `TcType`
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - Instance of `TcSymbol` based on this `TcType`
     */
    abstract instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean) : TcSymbol

    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    abstract async clone(mutator? : TcTypeBase) : Promise<TcType | undefined>;   

    /**
     * Internal function for applying mutations to the created clone. 
     * Used for code reduction
     * 
     * @param type - the TcType, which can be potentially mutated
     * @param mutator - The mutator which can be applied to the `TcType`
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    protected async __clone(type : TcType, mutator? : TcTypeBase) : Promise<TcType | undefined> { 

        if (mutator) {
            type.mutate(mutator);

            if (!type.ignored) {
                if (type.defaultValue !== this.defaultValue) {
                    type.defaultBuffer = await this.context.COM.toRaw(type.name, type.defaultValue);
                }

                this.__log(`extend() : Extends type ${this.name} to ${type.name}`);
                return type;
                
            } else {
                this.__log(`extend() : Ignoring extension of type ${this.name} to ${mutator.name}`)
                return;
            }
        }
        return type;
    }

    /**
     * Internal function, which analyses attribute data from the Type ADS Data and
     * adjusts aspects of this `TcType`
     * 
     * Mutations supported :
     *  - ReadOnly
     *  - Ignored
     *  - OnSet
     *  - OnGet
     *  - OnClear
     *  - OnChange
     * 
     * @param name - name of the Attribute
     * @param value - value of the Attribute
     */
    protected __getParameter(name : string, value : string) {
        const nameFormatted = name.trim().toLowerCase();
        if (nameFormatted === 'readonly') {
            this.readOnly = true;
        } else if (nameFormatted === 'ignored') {
            this.ignored = true;
        } else if (nameFormatted === 'onset') {
            this.onSet = value;
        } else if (nameFormatted === 'onget') {
            this.onGet = value;
        } else if (nameFormatted === 'onclear') {
            this.onClear = value;
        } else if (nameFormatted === 'onchange') {
            this.onChange = value;
        } 
    }

    /**
     * @internal
     */
    private __readOnly : boolean = false;

    /**
     * @internal
     */
    private __ignored : boolean = false;
    
    /**
     * @internal
     */
    private __name : string;
    
    /**
     * @internal
     */
    private __adst : number;
    
    /**
     * @internal
     */
    private __context : TcContext;
    
    /**
     * @internal
     */
    private __offset : number;
    
    /**
     * @internal
     */
    private __size : number;
    
    /**
     * @internal
     */
    protected __default : any;
    
    /**
     * @internal
     */
    private __defaultBuffer? : Buffer;
    
    /**
     * @internal
     */
    private __onSet? : string;
    
    /**
     * @internal
     */
    private __onGet? : string;
    
    /**
     * @internal
     */
    private __onClear? : string;
    
    /**
     * @internal
     */
    private __onChange? : string;

    /**
     * @internal
     */
    protected __log : debug.Debugger = Debug(`TcContext::TcType`);

}

/**
 * Class representing a `BOOL` Type in the Target PLC.
 */
export class TcBooleanType extends TcType {
    
    /**
     * Constructs a `TcBooleanType` to represent a `BOOL` Type in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcBooleanType, debug : boolean = false) {
        super(context, typeData, debug);
        if (!(typeData instanceof TcType)) {
            this.__log(`() : Created type ${this.name}[TcBooleanType]`);
        }
    }

    /**
     * Creates an instance of `TcBooleanType` with default values transformed to 
     * raw data
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcBooleanType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcBooleanType, debug : boolean = false) : Promise<TcBooleanType | undefined> {
        const type = new TcBooleanType(context, typeData, debug);
        if (!type.ignored) {
            type.defaultBuffer = await context.COM.toRaw(type.name, type.defaultValue);
            return type;
        }
    }

    /**
     * Default value for a `BOOL` if it is not explicitly specified
     */
    get defaultValue() : boolean { 
        if (super.defaultValue === undefined) {
            return false;
        } else return super.defaultValue;
    }

    /**
     * Creates an instance of a Type `BOOL` PLC Symbol, based on this `TcType` 
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of type `BOOL`
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcBooleanSymbol(path, parent, pointer, this, debug);
    }
    
    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 
        const clone = new TcBooleanType(this.context, this, this.__log.enabled)
        return this.__clone(clone, mutator);
    }

    /**
     * Internal function, which analyses attribute data from the Type ADS Data and
     * adjusts aspects of this `TcType`
     * 
     * Mutations supported :
     *  - ReadOnly
     *  - Ignored
     *  - OnSet
     *  - OnGet
     *  - OnClear
     *  - OnChange
     *  - Default
     * 
     * @param name - name of the Attribute
     * @param value - value of the Attribute
     */
    protected __getParameter(name : string, value : string) {
        super.__getParameter(name, value);
        const nameFormatted = name.trim().toLowerCase();
        if (nameFormatted === 'default' && value.trim().toLowerCase() === 'true') {
            this.__default = true;
        }
    }
}

/**
 * Class representing all numeric Types in the Target PLC
 */
export class TcNumericType extends TcType {

    /**
     * Default Ranges for all the Numeric Types possible in a TwinCAT PLC.
     * If not explicitly specified, will be used for `upperBorder` and `lowerBorder` 
     * definitions
     */
    static ranges : { [key : number] : { min : number | bigint, max : number | bigint }} = {
        [ADST.INT8]: { min: -128, max: 127 },
        [ADST.UINT8]: { min: 0, max: 255 },
        [ADST.UINT16]: { min: 0, max: 65535 },
        [ADST.INT16]: { min: -32768, max: 32767 },
        [ADST.INT32]: { min: -2147483648, max: 2147483647 },
        [ADST.UINT32]: { min: 0, max: 4294967295 },
        [ADST.INT64]: { min: BigInt(-9223372036854775808), max: BigInt(9223372036854775807) },
        [ADST.UINT64]: { min: BigInt(0), max: BigInt(18446744073709551615) },
        [ADST.REAL32]: { min: -3.402823e+38, max: 3.402823e+38 },
        [ADST.REAL64]: { min: -1.7976931348623158e+308, max: 1.7976931348623158e+308 }        
    }

    /**
     * Constructs a `TcNumericType` to represent all numeric Types in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcNumericType, debug : boolean = false) {
        super(context, typeData, debug);
        if (typeData instanceof TcType) {
            this.__upperBorder = typeData.upperBorder;
            this.__lowerBorder = typeData.lowerBorder;
        } else {
            this.__log(`() : Created type ${this.name}[TcNumericType]`);
        }
    }

    /**
     * Creates an instance of `TcNumericType` with default values transformed to 
     * raw data
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcNumericType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcNumericType, debug : boolean = false) : Promise<TcNumericType | undefined> {
        const type = new TcNumericType(context, typeData, debug);
        if (!type.ignored) {
            type.defaultBuffer = await context.COM.toRaw(type.name, type.defaultValue);
            return type;
        }
    }

    /**
     * Default value for a `BOOL` if it is not explicitly specified
     */
    get defaultValue() : number | bigint { 
        if (super.defaultValue === undefined) {
            if (this.adst === ADST.INT64 || this.adst === ADST.UINT64) {
                return BigInt(0);
            } else return 0

        } else return super.defaultValue;
    }

    /**
     * Maximum value of this Numeric Type
     */
    get upperBorder() : number | bigint { 
        if (this.__upperBorder === undefined) {
            return TcNumericType.ranges[this.adst].max
        } else return this.__upperBorder;
    }
    set upperBorder(val : number | bigint) { this.__upperBorder = val };


    /**
     * Minimum value of this Numeric Type
     */
    get lowerBorder() : number | bigint { 
        if (this.__lowerBorder === undefined) {
            return TcNumericType.ranges[this.adst].min
        } else return this.__lowerBorder;
    }
    set lowerBorder(val : number | bigint) { this.__lowerBorder = val };

    /**
     * Creates an instance of a numeric Type PLC Symbol, based on this `TcType 
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of a numeric type
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcNumericSymbol(path, parent, pointer, this, debug);
    }

    /**
     * Extends the current `TcType` with the provided `TcTypeInfo`. Can be extended either to
     * an array of `TcNumericType` or `TcEnumType`. Otherwise, creates a mutate clone
     *  
     * @param adsTypeData - Data with which to extends the `TcType`
     * 
     * @return - Either the extends `TcType` or `undefined` if extension failed
     */
    async extend(adsTypeData : TcTypeInfo) : Promise<TcType | undefined> {

        if (adsTypeData.adsDataType === this.adst) {

            if (adsTypeData.enumInfo) {
                return await TcEnumType.create(this.context, adsTypeData, this.__log.enabled);

            } else if (adsTypeData.arrayData.length) {
                return TcArrayType.create(this.context, adsTypeData, this, this.__log.enabled);
    
            } else return this.clone(adsTypeData) 
        }
    };

    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 

        const clone = new TcNumericType(this.context, this, this.__log.enabled); 
        return this.__clone(clone, mutator);
    }

    /**
     * Internal function, which analyses attribute data from the Type ADS Data and
     * adjusts aspects of this `TcType`
     * 
     * Mutations supported :
     *  - ReadOnly
     *  - Ignored
     *  - OnSet
     *  - OnGet
     *  - OnClear
     *  - OnChange
     *  - Default
     *  - UpperBorder
     *  - LowerBorder
     * 
     * @param name - name of the Attribute
     * @param value - value of the Attribute
     */
    protected __getParameter(name : string, value : string) {
        super.__getParameter(name, value);
        const nameFormatted = name.trim().toLowerCase();
        if (nameFormatted === 'lowerborder') {

            if (this.adst === ADST.INT64 || this.adst === ADST.UINT64) {
                this.lowerBorder = BigInt(value);
            } else this.lowerBorder = parseFloat(value);

            if (this.__default === undefined) {
                this.__default = this.lowerBorder;
            }

        } else if (nameFormatted === 'upperborder') {

            if (this.adst === ADST.INT64 || this.adst === ADST.UINT64) {
                this.upperBorder = BigInt(value);
            } else this.upperBorder = parseFloat(value) ;

        } else if (nameFormatted === 'default') {

            if (this.adst === ADST.INT64 || this.adst === ADST.UINT64) {
                this.__default = BigInt(value);
            } else this.__default = parseFloat(value) 

        }
    }

    /**
     * @internal
     */
    private __upperBorder : number | bigint | undefined;

    /**
     * @internal
     */
    private __lowerBorder : number | bigint | undefined;

}

/**
 * Class representing a `STRING` or `WSTRING` Type in the Target PLC.
 */
export class TcStringType extends TcType {

    /**
     * Constructs a `TcStringType` to represent a `STRING` or `WSTRING` Type in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcStringType, debug : boolean = false) {
        super(context, typeData, debug);   
        if (typeData instanceof TcType) {
            this.__length = typeData.length;
        } else {        
            this.__length = typeData.size - 1;
            this.__log(`() : Created type ${this.name}[TcStringType]`);
        }
    }

    /**
     * Creates an instance of `TcStringType` with default values transformed to 
     * raw data
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcStringType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcStringType, debug : boolean = false) : Promise<TcStringType | undefined> {
        const type = new TcStringType(context, typeData, debug);
        if (!type.ignored) {
            type.defaultBuffer = await context.COM.toRaw(type.name, type.defaultValue);
            return type;
        }
    }

    /**
     * The maximum length of a string, which can be stored in this Type
     */
    get length() : number { return this.__length };
    set length(val : number) { this.__length = val };

    
    /**
     * Default value for a `STRING` or `WSTRING` if it is not explicitly specified
     */
    get defaultValue() : any { 
        if (super.defaultValue === undefined) {
            return '';
        } else return super.defaultValue;
    }

    /**
     * Creates an instance of Type `STRING` or `WSTRING` PLC Symbol, based on this `TcType`
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of type `STRING` or `WSTRING`
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcStringSymbol(path, parent, pointer, this, debug);
    }

    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 

        const clone = new TcStringType(this.context, this, this.__log.enabled);
        return this.__clone(clone, mutator);
    }

    /**
     * Internal function, which analyses attribute data from the Type ADS Data and
     * adjusts aspects of this `TcType`
     * 
     * Mutations supported :
     *  - ReadOnly
     *  - Ignored
     *  - OnSet
     *  - OnGet
     *  - OnClear
     *  - OnChange
     *  - Default
     * 
     * @param name - name of the Attribute
     * @param value - value of the Attribute
     */
    protected __getParameter(name : string, value : string) {
        super.__getParameter(name, value);
        const nameFormatted = name.trim().toLowerCase();
        if (nameFormatted === 'default') {
            this.__default = true;
        }
    }

    /**
     * @internal
     */
    private __length : number = 0;

}

/**
 * Class representing all `ENUM` Types in the Target PLC
 */
export class TcEnumType extends TcType {
    
    /**
     * Constructs a `TcEnumType` to represent a `ENUM` Type in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcEnumType, debug : boolean = false) {
        super(context, typeData, debug);

        if (typeData instanceof TcEnumType) {
            
            this.buffers = typeData.__enumBuffers;
            this.fields = typeData.__enumFields;


        } else {

            typeData.enumInfo?.forEach(enumField => {
                const fullName = `${typeData.name}.${enumField.name}`;
                this.__enumFields.push(fullName);
                this.__enumBuffers[fullName] = enumField.value;
                if (!this.defaultValue) {
                    this.defaultValue = enumField.name;
                    this.defaultBuffer = enumField.value;
                }

            })
            this.__log(`() : Created type ${this.name}[TcEnumType]`);

        }
    }

    /**
     * Creates an instance of `TcEnumType` with default values transformed to 
     * raw data
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcEnumType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcEnumType, debug : boolean = false) : Promise<TcEnumType | undefined> {
        const type = new TcEnumType(context, typeData, debug);
        if (!type.ignored) {
            return type;
        }
    }

    /**
     * Access all the fields, which are allowed to be written
     * to this `ENUM`
     */
    get fields() : string[] { return this.__enumFields }
    set fields(val : string[]) { this.__enumFields = [ ...val ]};

    /**
     * Access all the data buffers, which represent the `ENUM` fields
     */
    get buffers() : TcEnumBuffers { return this.__enumBuffers };
    set buffers(val : TcEnumBuffers ) {
        for (let [ key, buffer] of Object.entries(val)) {
            this.__enumBuffers[key] = buffer;
        }
    }

    /**
     * Creates an instance of Type `ENUM` PLC Symbol, based on this `TcType`
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of type `ENUM`
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcEnumSymbol(path, parent, pointer, this, debug);
    }
    
    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 

        const clone = new TcEnumType(this.context, this, this.__log.enabled);
        return this.__clone(clone, mutator);

    }

    /**
     * Internal function, which analyses attribute data from the Type ADS Data and
     * adjusts aspects of this `TcType`
     * 
     * Mutations supported :
     *  - ReadOnly
     *  - Ignored
     *  - OnSet
     *  - OnGet
     *  - OnClear
     *  - OnChange
     *  - Default
     * 
     * @param name - name of the Attribute
     * @param value - value of the Attribute
     */
    protected __getParameter(name : string, value : string) {
        super.__getParameter(name, value);
        const nameFormatted = name.trim().toLowerCase();
        if (nameFormatted === 'default') {
            this.__default = value
        }
    }

    /**
     * @internal
     */
    private __enumFields : string[] = [];

    /**
     * @internal
     */
    private __enumBuffers : TcEnumBuffers = {};
}

/**
 * Class representing a `Structures`, `Function_Blocks` and `Unions` Types in the Target PLC.
 */
export class TcStructType extends TcType {

    /**
     * Constructs a `TcBooleanType` to represent `Structures`, `Function_Blocks` and `Unions` Types in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param children - The Children Types, that are part of this structure
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcStructType, children : {  key : string, type : TcType }[] = [], debug : boolean = false) {
        super(context, typeData, debug);

        if (typeData instanceof TcStructType) {

            this.__children = typeData.children;
            this.__rpcMethods = typeData.__rpcMethods;

        } else {

            this.__children = children;

            //Process the RPC Methods
            typeData.rpcMethods.forEach(meth => {
                this.__rpcMethods.push(meth.name);
            })

            this.__log(`() : Created type ${this.name}[TcStructType]`);
        }
    }

    /**
     * Creates an instance of `TcStructType`
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param children - The Children Types, that are part of this structure
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcStructType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcStructType, children : {  key : string, type : TcType }[] = [], debug : boolean = false) : Promise<TcStructType | undefined> {
        const type = new TcStructType(context, typeData, children, debug);
        if (!type.ignored) {
            return type;
        }
    }
    
    /**
     * Children and their types of this structure
     */
    get children() : { key : string, type : TcType}[] { return this.__children; }

    /**
     * List of all RPC Methods available for this structure 
     */
    get rpcMethods() : string[] { return this.__rpcMethods; }

    /**
     * Creates an instance of Type  `Structure`, `Function_Block` or `Union` PLC Symbol, based on this `TcType` 
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of type `Structures`, `Function_Blocks` or `Union`
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcStructureSymbol(path, parent, pointer, this, debug);
    }
    
    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 
        const clone = new TcStructType(this.context, this, this.children, this.__log.enabled);
        return this.__clone(clone, mutator);
    }

    /**
     * @internal
     */
    private __children : { key : string, type : TcType}[] = [];


    /**
     * @internal
     */
    private __rpcMethods : string[] = [];
}

/**
 * Class representing an `ARRAY` Type in the Target PLC.
 */
export class TcArrayType extends TcType {
    
    /**
     * Constructs a `TcArrayType` to represent an `ARRAY` Type in the Target PLC
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param child - The type of the Array to create
     * @param debug - If enabled, will produce debug information
     */
    protected constructor(context : TcContext, typeData : TcTypeInfo | TcArrayType, child : TcType, debug : boolean = false) {
        super(context, typeData, debug);

        if (typeData instanceof TcArrayType) {

            this.dimensions = typeData.dimensions;
            this.__child = child;

        } else {

            this.__dimensions = (typeData as TcTypeInfo).arrayData;
            this.__child = child;
            this.__log(`() : Created type ${this.name}[TcArrayType]`);

        }
    }    

    /**
     * Creates an instance of `TcArrayType`
     * 
     * @param context - The `TcContext`, to which this Type belongs
     * @param typeData - The information, from which the `TcType` is build
     * @param child - The type of the Array to create
     * @param debug - If enabled, will produce debug information
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - An initialized instance of `TcArrayType` if it is not ignored
     */
    static async create(context : TcContext, typeData : TcTypeInfo | TcArrayType, child : TcType, debug : boolean = false) : Promise<TcArrayType | undefined> {
        const type = new TcArrayType(context, typeData, child, debug);
        if (!type.ignored) {
            return type;
        }
    }

    /**
     * Access the Dimensions of array
     */
    get dimensions() : TcArrayDimension[]  { return this.__dimensions }
    set dimensions(val : TcArrayDimension[])  { this.__dimensions = val}

    /**
     * The Child `TcType` of this Array
     */
    get child() : TcType { return this.__child };
    
    /**
     * Creates a clone with an optional mutation of this `TcType`
     * 
     * @param mutator - Optional mutator, which can be applied to the clone
     * 
     * @throws {@link TcComIsInvalidException} - Attempting to use an invalidated `TcCom` Object
     * @throws {@link TcComToRawException} - Error occurred when transforming value to raw data
     * 
     * @return - Either the clone `TcType` or `undefined` if cloning failed
     */
    async clone(mutator? : TcTypeBase) : Promise<TcType | undefined> { 
        const clone = new TcArrayType(this.context, this, this.child, this.__log.enabled);
        return this.__clone(clone, mutator);

    }

    /**
     * Creates an instance of a Type `ARRAY` PLC Symbol, based on this `TcType` 
     * 
     * @param path - Path of the created `TcSymbol`
     * @param parent - Parent of the created `TcSymbol`
     * @param pointer - Memory location of created `TcSymbol` in the Target PLC
     * @param debug - If enabled, will produce debug information
     * 
     * @return - An `TcSymbol` instance of a Symbol of type `ARRAY`
     */
    instance(path : string, parent : TcSymbol, pointer : TcSymbolPointer, debug : boolean = false) : TcSymbol {
        return new TcArraySymbol(path, parent, pointer, this, 0, debug);
    }

    /**
     * @internal
     */
    private __child : TcType;

    /**
     * @internal
     */
    private __dimensions : TcArrayDimension[] = [];
}

