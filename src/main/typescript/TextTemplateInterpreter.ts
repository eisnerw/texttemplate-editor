import {CommonTokenStream, InputStream, Token, error, Parser, CommonToken} from '../../../node_modules/antlr4/index.js'
import {DefaultErrorStrategy} from '../../../node_modules/antlr4/error/ErrorStrategy.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"
import {TextTemplateParserVisitor} from "../../main-generated/javascript/TextTemplateParserVisitor.js"
import moment = require('moment');
import {Externals} from "../../main-generated/javascript/Externals.js"

var parsedTemplates = {};
var parsedTokens = {};
let processedSubtemplates;
let foundJsonObjects; // used by TemplateData to prevent loops
const numericTest = /^[-+]?(\d+|\d+\.\d*|\d*\.\d+)$/;

class ConsoleErrorListener extends error.ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.log('ERROR ' + msg);
    }
}
class BulletIndent {
	public level : number;
	public index : number;
	public indent : string;
	public parent : BulletIndent;
	public lastBullet = '';
	public bulletStyles = null;
	// the next is used to indicate that we've returned from a level where we could have honored a style 
	// initializer (e.g., "I:IV") so don't do that the next time we visit levels above this one
	public styleInitializerLevel : number = null; 
	constructor(indent : string = null, currentBulletIndent : BulletIndent = null, level = null, bulletStyles = null){
		if (indent == null){
			// indicates an empty BulletIndent
			return;
		}
		this.bulletStyles = bulletStyles;
		let currentIndent = currentBulletIndent == null ? '' : currentBulletIndent.indent;
		this.indent = indent;
		if (currentBulletIndent == null ){
			// establish the first level
			this.level = level == null ? 0 : level;
			this.index = 0;
			this.parent = null;
		} else if (this.level == level || indent == currentIndent){
			// staying on the same level
			this.level = currentBulletIndent.level;
			this.index = currentBulletIndent.index + 1;
			this.parent = currentBulletIndent.parent;
			this.styleInitializerLevel = currentBulletIndent.styleInitializerLevel;
		} else {
			// search for the same level
			let matchingLevel : BulletIndent = currentBulletIndent.parent; // used to find a previous level
			while (matchingLevel != null){
				if ((level != null && matchingLevel.level == level) || indent == matchingLevel.indent){
					// found a matching level, so this one is a continuation
					this.level = matchingLevel.level;
					this.index = matchingLevel.index + 1;
					this.parent = matchingLevel.parent;
					this.styleInitializerLevel = this.level; // don't honor style initializers above this level
					break;
				} else {
					matchingLevel = matchingLevel.parent;
				}
			} 
			if (matchingLevel == null){
				// create a new level
				this.level = level == null ? (currentBulletIndent.level + 1) : level;
				this.index = 0;
				this.parent = currentBulletIndent;
				this.styleInitializerLevel = currentBulletIndent.styleInitializerLevel;
			}
		}
	}
	clone(){
		// clone a bulletIndent that reflects the state 
		let cloneBulletIndent = new BulletIndent();
		cloneBulletIndent.level = this.level;
		cloneBulletIndent.index = this.index;
		cloneBulletIndent.indent = this.indent;
		cloneBulletIndent.parent = this.parent;
		cloneBulletIndent.lastBullet = this.lastBullet;
		cloneBulletIndent.bulletStyles = this.bulletStyles;
		cloneBulletIndent.styleInitializerLevel = this.styleInitializerLevel;
		return cloneBulletIndent;
	}
	getBullet(){
		let bullet;
		let bulletStyles = this.bulletStyles;
		if (bulletStyles == null || bulletStyles.length == 0){
			bullet = '(' + this.level + '.' + this.index + ')'; // TODO: default bullet style
		} else {
			let bulletStyleText = bulletStyles[this.level < bulletStyles.length ? this.level : bulletStyles.length - 1];
			// support multiple numbers at one level by creating an array of styles that contain 0 or 1 number/letter/roman
			let concatenatedBullet = '';
			let styleArray = bulletStyleText.replace(/(.*?(i\:[ivxldcm]+|i|I\:[IVXLDCM]+|I|1\:\d+|1|a\:[a-z]+|a|A\:[A-Z]+|A).\S*?)/g,'$1\x02').split('\x02');
			let currentBulletLevel : any = this;
			for (let i = styleArray.length - 1; i >= 0 && currentBulletLevel != null; i--){
				let bulletStyle = styleArray[i];
				let padding = '';
				if (/^ +/.test(bulletStyle)){
					padding = bulletStyle.replace(/^( +).*$/, '$1');
					bulletStyle = bulletStyle.substr(padding.length);
				}
				let prefix = '';
				let postfix = '';
				let bulletType = '';
				// TODO: support styles like 'I.a.1.i', '1.1.1.1' or even '1:10.1.1.1'
				// TODO: consider allowing \: and \\ for legitimate :
				// support styles like 'i', 'i:iv', 'I', 'I:LV', '1', '1:13', 'a', 'a:d', 'A', 'A:AF'
				if (/^.*(i\:[ivxldcm]+|i|I\:[IVXLDCM]+|I|1\:\d+|1|a\:[a-z]+|a|A\:[A-Z]+|A).*$/.test(bulletStyle)){
					prefix = bulletStyle.replace(/^(.*?)(i\:[ivxldcm]+|i|I\:[IVXLDCM]+|I|1\:\d+|1|a\:[a-z]+|a|A\:[A-Z]+|A).*$/,'$1');
					postfix = bulletStyle.replace(/^.*?(i\:[ivxldcm]+|i|I\:[IVXLDCM]+|I|1\:\d+|1|a\:[a-z]+|a|A\:[A-Z]+|A)(.*)$/,'$2');
					bulletStyle = bulletStyle.replace(/^.*?(i\:[ivxldcm]+|i|I\:[IVXLDCM]+|I|1\:\d+|1|a\:[a-z]+|a|A\:[A-Z]+|A).*$/,'$1');
					bulletType = bulletStyle.substr(0, 1);
					if (bulletStyle.includes(':')){
						if (this.styleInitializerLevel != null && currentBulletLevel.level > this.styleInitializerLevel){
							// ignore the style initializer because we've already popped back to a level above this
							bulletStyle = bulletType; 
						} else {
							// capture the style initializer, which is the value after the ':'
							bulletStyle = bulletStyle.substr(bulletStyle.indexOf(':') + 1);
						}
					}
				} else if (bulletStyle.length > 1){
					if ('(<#$%*.-=+`~[{_=+|\'"'.includes(bulletStyle.substr(0,1))){
						prefix = bulletStyle[0];
						bulletStyle = bulletStyle.substr(1);
					}
					if (')>*]}.`~*-_=+|:\'"'.includes(bulletStyle.substr(bulletStyle.length - 1, 1))){
						postfix = bulletStyle[bulletStyle.length - 1];
						bulletStyle = bulletStyle.substr(0, bulletStyle.length - 1);
					}
				}
				bullet = bulletStyle;
				if (bulletType.length == 1){
					switch (bulletType){
						case 'I':
							bullet = this.numberToRoman(currentBulletLevel.index + (bulletStyle != 'I' ? this.romanToNumber(bulletStyle) : 1));
							break;
						
						case 'i':
							bullet = this.numberToRoman(currentBulletLevel.index + (bulletStyle != 'i' ? this.romanToNumber(bulletStyle) : 1)).toLowerCase();
							break;
						
						case '1':
							bullet = (currentBulletLevel.index + (bulletStyle != '1' ? parseInt(bulletStyle) : 1)).toString();
							break;
						
						case 'A':
						case 'a':
							bullet = this.numberToAlphabet(currentBulletLevel.index + (bulletStyle.toLowerCase() != 'a' ? this.alphabetToNumber(bulletStyle) : 1));
							if (bulletType == 'a'){
								bullet = bullet.toLowerCase();
							}
							break;
					}
					if (padding.length > 0 && bullet.length < (padding.length + 1)){
						prefix = padding.substr(0, padding.length - bullet.length + 1) + prefix;
					}
					bullet = prefix + bullet + postfix;
					currentBulletLevel = currentBulletLevel.parent; 
				}
				concatenatedBullet = bullet + concatenatedBullet;
			}
			bullet = concatenatedBullet;
		}
		this.lastBullet = this.indent + bullet.replace('\x01', '');
		return bullet;	
	}
	numberToRoman(n : number) : string{
		// from vetalperko via Brendon Shaw
		let b = 0;
		let s = '';
		for (let a = 5; n != 0; b++,a ^= 7){
			let o = n % a;
			for(n = n/a^0; o--;){
				s = 'IVXLCDM'[o > 2 ? b + n - (n &= -2) + (o = 1) : b] + s;
			}
		}
		return s;
	}
	romanToNumber(romanNumeral : string) : number {
	  let DIGIT_VALUES = {I: 1,V: 5,X: 10,L: 50,C: 100,D: 500,M: 1000};
	  let result = 0;
	  let input = romanNumeral.toUpperCase().split('');
	  for (let i = 0; i < input.length; i++) {
		let currentLetter = DIGIT_VALUES[input[i]];
		let nextLetter = DIGIT_VALUES[input[i + 1]];
		if (currentLetter == null) {
		  return -1;
		} else {
		  if (currentLetter < nextLetter) {
			result += nextLetter - currentLetter;
			i++;
		  } else {
			result += currentLetter;
		  }
		}
	  }
	  return result;
	}
	numberToAlphabet (num : number) {
		// from Chris West's routine to convert spreadsheet columns to numbers and back
		let ret = '';
		let b = 26;
		for (let a = 1; (num -a) >= 0; b *= 26) {
			num -= a;
			ret = String.fromCharCode(((num % b) / a) + 65) + ret;
			a = b;
		}
		return ret;
	}
	alphabetToNumber(alpha : string) : number {
		let number = 0;
		for (let i = alpha.length, j = 0; i--; j++) {
			number += Math.pow(26, i) * (alpha.toUpperCase().charCodeAt(j) - 64);
		}
		return number;
	}	
}

export class TemplateData {
	private dictionary = {};
	private list: TemplateData[] = [];
	private parent : TemplateData;
	static foundObjects : any; // used to protect against ToJson loops
	type: string;
	constructor(jsonData: string | {} | [], parent?: TemplateData) {
        let json: {};
        if (Array.isArray(jsonData) && (<any[]>jsonData).length == 1){
            // don't create a list for a single value
            jsonData = (<any[]>jsonData)[0];
        }
		if (typeof jsonData == 'string') {
			if (jsonData.startsWith('{') || jsonData.startsWith('[')){
				json = JSON.parse(jsonData);
			} else {
				// TemplateData supports arrays of strings by making them lists of dictionaries with a single 
				json = JSON.parse('{"_": "' + jsonData.replace('"','\\"') + '"}');
			}
		} else if (Array.isArray(jsonData)) {
			this.type = 'list';
			let array: [] = jsonData;
			array.forEach((item) => {
				this.list.push(new TemplateData(item, this));
			});
			this.parent = parent;
			return;
		} else if (jsonData instanceof TemplateData){ // filter or clone
			if ((<TemplateData>jsonData).type == 'list'){
				this.type = 'list';
				(<TemplateData>jsonData).list.forEach((item)=>{
					this.list.push(new TemplateData(item, parent));
				});
				return;
			} else {
				json = JSON.parse((<TemplateData>jsonData).toJson()); // clone by converting to Json and back
			}
		} else {
			json = jsonData;
		}
		if (Array.isArray(json)){
			this.type = 'list';
			json.forEach((item) => {
				this.list.push(new TemplateData(item, this));
			});
		} else {
			this.type = 'dictionary';
			if (typeof json == 'string'){
				// handle clone of scalar
				json = JSON.parse('{"_": "' + json.replace('"','\\"') + '"}');
			}
			Object.keys(json).forEach((keyname) => {
				let value: any = json[keyname];
				if (typeof value == 'object' && value != null) {
					if (value != null && (!Array.isArray(value) || value.length > 0)){ // don't add null values or empty arrays
						this.dictionary[keyname] = new TemplateData(value, this);
					}
				} else {
					this.dictionary[keyname] = value;
				}
			});
		}
		if (parent){
			this.parent = parent;
		}
	}
	getKeys() : string[] {
		return Object.keys(this.dictionary);
    }
    remove(key : string) : void {
        delete this.dictionary[key];
    }
	getValue(key : string) : any {
		let keySplit = key.split('.');
        let value = this.dictionary[keySplit[0]];
		if (value == undefined && (keySplit[0] == '*' || keySplit[0] == '^')){
			if (keySplit[0] == '*'){
				value = this;
			} else {
				value = this.parent; 
			}
			if (value == undefined){
				value = this; // allows ^.^... to get to the top
			}
		}
        if (value == null && this.type == 'list' && this.list.length > 0){
			// extract each element from the list and return a dictionary or a list
			value = [];
			this.list.forEach((item)=>{
				let listValue = item.getValue(key);
				if (listValue){
					value.push(listValue);
				}
			});
            if (value.length == 0){
                return undefined;
            }
            if (value.length == 1){
                return value[0];
            }
            return new TemplateData(value);
        }
		if (keySplit.length == 1 || value === undefined){
			return value;
		}
		if (value instanceof TemplateData){
			return <TemplateData>value.getValue(keySplit.slice(1).join('.'));
		}
	}
	iterateList(fn: (TemplateData) => any) {
        if (this.type == 'list'){
            this.list.forEach((item : TemplateData)=>{
                fn(item);
            });
        } else {
            fn(this);
        }
	}
	count(){
		return this.list.length;
	}
	isScalarList(){
		if (this.type != 'list' || this.list.length == 0){
			return false;
		}
		let bOnlyContainsScalar = true;
		this.list.forEach((listItem)=>{
			if (!listItem.dictionary['_']){
				bOnlyContainsScalar = false;
			}
		});
		return bOnlyContainsScalar;
	}
	toJson(indentLevel? : number) : string {
		let result : string = '';
		let bComma = false;
		if (indentLevel == null){
			indentLevel = 0;
			TemplateData.foundObjects = [];
		}
		TemplateData.foundObjects.push(this);
		if (this.type == 'list'){
			result += '[\n';
			this.list.forEach((dict) =>{
				result = (result + ((bComma ? ',' : this.indent(indentLevel + 1)) + dict.toJson(indentLevel + 1))).replace(/\n\s*\n/,'\n');
				bComma = true;
			});
			result += ('\n' + this.indent(indentLevel) + ']');
		} else {
			let keys = Object.keys(this.dictionary);
			if (keys.length == 1 && keys[0] == '_'){
				result += ('\n' + this.indent(indentLevel) + '"' + this.dictionary[keys[0]].replace(/["]/g,"\\\"") + '"');
			} else {
				result += '{\n';
				keys.forEach((keyname) => {
					let value : any = this.dictionary[keyname];
					result += (this.indent(indentLevel + 1) + (bComma ? ',' : '') + '"' + keyname + '": ');
					if (value instanceof TemplateData){
						if (TemplateData.foundObjects.includes(value)){
							result += 'null'; // don't include a value that has already been used
						} else {
							result += (<TemplateData>value).toJson(indentLevel + 1);
						}
					} else if (value == null) {
						result += 'null';
					} else if (typeof value == 'string') {
						value = value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/"/g,'\\"');
						result += ('"' + value + '"');
					} else {
						result += value.toString();
					}
					result += '\n';
					bComma = true;
				});
				result += (this.indent(indentLevel) + '}');
			}
		}
		return result;
	}
	add(name : string, value : any){
		this.dictionary[name] = value;
	}
	private indent(indentLevel : number) : string {
		let result : string = '';
		for (let i = 0; i < indentLevel; i++){
			result += '   ';
		}
		return result;
	}
}

class TextTemplateVisitor extends TextTemplateParserVisitor {
	context : TemplateData;
	subtemplates = {};
	errors = [];
    input;
    bLoadingInclude = false;
	bulletIndent : BulletIndent;
	recursionLevel = 0;
	annotations = {bulletStyles: null, bulletMode: 'implicit', debugLevel: 0};
    subtemplateLevel = ''; // keeps track of subtemplates with subtemplates
    debugLog =[];
	hoverPositions : {} = null;
	
	visitText = function(ctx){
		if (ctx.children[0].constructor.name == 'ContinuationContext'){
			// replace all white space captured as a "continuation" (starts with `) with a single blank
			return ' ';
		}
		return ctx.getText();
	};
	visitIdentifier = function(ctx) {
		var key = ctx.getText();
		if (this.annotations.valueFunction){
			let valueFunction = this.annotations.valueFunction;
			delete this.annotations.valueFunction;
			let retValue = valueFunction(ctx, this);
			this.annotations.valueFunction = valueFunction;
			this.setHoverPositions(ctx, retValue);
			return retValue;
		}
		let value = undefined;
		if (key == '@'){
			return new TemplateData(JSON.stringify(this.annotations), this.context);
		} else if (key.startsWith('@.')){
			if (key == '@.Tokens' || key == '@.Tree'){
				let parentName;
				let parent = ctx;
				do {
					parentName = parent.constructor.name.replace(/Context$/,'');
					parent = parent.parentCtx;
				} while (parent != null && parentName != 'TemplateContents');
				if (parent != null){
					// the parent of the template contents is a template.  
					if (key == '@.Tokens'){
						// Return the contents without the tokens the "@.Tokens"
						return tokensAsString(parent).replace(' LBRACE({) IDENTIFIER(@) DOT(.) IDENTIFIER(Tokens) RBRACE(})','');
					}
					return this.getParseTree(parent);
				}
			}
			value = this.annotations[key.substr(2)];
		} else if (!this.context || !(this.context instanceof TemplateData)){
			console.warn('Attempting to look up "' + key + '" without a data context');
		} else {
			value = this.context.getValue(key);
		}
		if (value === undefined || value === ''){ // Treat empty string as a missing value
			console.debug('Missing value for ' + key);
			let missingValue = this.annotations.missingValue ? this.annotations.missingValue.replace(/\{key\}/g, key) : null;
            this.setHoverPositions(ctx, '(missing)');
            this.logForDebug(1,'Missing value for ' + key);
			return {type: 'missing', missingValue: missingValue, key: key};
		} else if (this.annotations.dateTest != null && this.annotations.dateTest.test(key)){
			value = {type: 'date', moment: moment(value), string: value, format: this.annotations['dateFormat']};
			if (!value.moment.isValid()){
				this.syntaxError('Invalid date', ctx);
			} else if (this.annotations['dateFormatMode'] && this.annotations['dateFormatMode'] == 'GMT'){
				//value.moment.subtract(value.moment.parseZone().utcOffset(), 'minutes');
				value.moment.utc();
			}
		}
		if (typeof value == 'string'){
			value = value.replace(/\r/g, ''); // carriage return messes up regex
			if (this.annotations.encoding == 'html'){
				value = this.encodeHTML(value);
			} else if (this.annotations.encoding == 'xml') {
				value = this.encodeXML(value);
			} else if (this.annotations.encoding == 'uri') {
				value = encodeURI(value);
			}
			if (value.includes('\n') && this.annotations['multilineStyle']){
				return {type: 'multiline', multilines: value, multilineStyle: this.annotations['multilineStyle']};
			}
		}
        this.setHoverPositions(ctx, value);
        if (this.annotations.debugLevel > 4){
            this.logForDebug(5, ctx.children[0].getText() + ' has a value of ' + this.valueAsText(value));
        }
		return value;
	};
	visitTemplateToken = function(ctx) {
		// there are three children, the left brace, the token, and the right brace
		let result : any = ctx.children[1].accept(this);
		if (Array.isArray(result) && result.length == 1){
			return result[0];
		}
		return result;
	};
	visitTemplateContents = function(ctx) {
		var value = this.visitChildren(ctx);
		if (Array.isArray(value) && value.length == 1){
			return value[0];
		}
		return value;
	};
	visitTemplateContextToken = function(ctx){
		return ctx.children[1].accept(this); // ignore the information in the brackets
	}
	visitTemplateContextCommaToken = function(ctx) { 
		let result = ctx.children[1].accept(this);
		if (result != null && typeof result == 'object' && result.type == 'missing'){
            this.logForDebug(2, ctx.children[0].getText() + 'missing, causing alternate choice');
			result = ctx.children[3].accept(this); // when there is no context, run the second template
		}
		return result;
	}
	visitContextToken = function(ctx) {
		//if (ctx.children.length < 3){
		//	return null; // invalid
		//}
		let oldContext : TemplateData = this.context;
		let bHasContext : boolean = ctx.children[0].getText() != ':'; // won't change context if format {:[template]}
        if (bHasContext && ctx.children[0].children){  // ctx.children[0].children protects against invalid spec
            this.logForDebug(3, 'changing context to ' + ctx.children[0].getText());
			let context : any;
			// (Not sure why we were ignoring url errors)
			let oldErrors = [];
			// make a shallow copy so we can undo any errors while acquiring a context url
			this.errors.forEach((error)=>{
				oldErrors.push(error);
			});
			if (ctx.children[0].constructor.name == 'NamedSubtemplateContext'){
				context = ctx.children[0].accept(this);
			} else {
				context = ctx.children[0].children[0].accept(this);
				if (this.context && typeof context == 'object' && context != null && context.type == 'argument'){
					// special case when the existing context is a list.  Recompute without the context
					this.context = undefined;
					context = ctx.children[0].accept(this);
				}
			}
			context = this.compose(context, 0);
			if (Array.isArray(context) && context.length == 1){
				context = context[0]; // support templates as contexts
			}
			if (typeof context === 'string'){
				// wiping out errors acquiring the url string before the url has been resolved
				this.errors.forEach((error)=>{
					if (error.message.includes('Error loading subtemplate')){
						oldErrors.push(error); // keep loading errors
					}
				});
				this.errors = oldErrors; 
				try{
					if (context.toLowerCase().startsWith('http') || context.startsWith('/')){
						if (urls[context] && urls[context].data){
							if (urls[context].error){
								this.syntaxError(urls[context].data, ctx);
								this.context = new TemplateData('{}', this.context);
							} else {
								this.context = new TemplateData(urls[context].data, this.context);
							}
						} else {
							if (!urls[context]){
								urls[context] = {};
								this.context = new TemplateData('{}', this.context); // provide an empty context to prevent lookup errors
							}
						}
					} else if (context.substr(0,1) == '[' || context.substr(0,1) == '{'){
						this.context = new TemplateData(context, this.context);
					} else {
						// the string isn't JSON and is probably an error, so just output it
						this.context = oldContext;
						return context;
					}
				} catch(e){
					this.context = oldContext;
					let msg = 'Error loading context: ' + e.message;
					console.error(msg);
					this.syntaxError(msg, ctx);
					return msg;
				}
				if (ctx.children.length > 1 && ctx.children[0].children && ctx.children[0].children[0].constructor.name == 'MethodInvokedContext'){
					// there is a method invocation on a context that was created here.  We need to rerun the method(s)
					let invocations = ctx.children[0].children[0].children.slice(1);
					this.context = this.invokeMethods(null, invocations); // a null valueContext implies this.context
				}
				
			} else if (bHasContext) { // context may not be specified
				//if (context){
					this.context = context;
				//} else {
				//	this.context = new TemplateData({}); // provide an empty context for lookups
				//}
            }
            if (this.context && this.context.constructor.name == 'TemplateData' && ctx.children[0]){
                this.setHoverPositions(ctx.children[0], this.context.toJson());
            }
		}
		var result = [];
		if (bHasContext && !ctx.children[2]){ // note: this used to check  || !ctx.children[2].getText() || ctx.children[2].exception
			// protect code against illegal bracketted expression while editing
			result = null;
		}
		result = ctx.children[bHasContext ?  2 : 1].accept(this);
		if (this.context != null && typeof this.context == 'object' && this.context.type == 'missing'){
			result = this.context; // can't return a value from a missing context although we still need to visit children
        }
        if (bHasContext){
            this.logForDebug(3, 'return from context ' + ctx.children[0].getText());
        }
		this.context = oldContext;
		return result;
	};
	visitCompilationUnit = function(ctx) {
		//console.log(this.getParseTree(ctx)); // for debugging
		if (!ctx.children){
			return ''; // no data
		}
		//this.loadSubtemplates(ctx);
		let result : [] = this.visitChildren(ctx);
		let spliced = result.splice(0, result.length - 1); // remove the result of the <EOF> token
		if (spliced.length == 1){
			return spliced[0];
		}
		return spliced;
	};
	visitMethod = function(ctx) {
		let methodName : string = ctx.getText();
		return methodName.substr(1, methodName.length - 2);  // drop parens
	};
	visitMethodInvoked = function(ctx) {
		let valueContext = ctx.children[0]; // first child is the target value context
		let invocations = ctx.children.slice(1); // subsequent children are cascaded methods
		let targetValue : any; 
		let value = this.invokeMethods(valueContext, invocations);
		return value;
	};
	invokeMethods = function(valueContext, invocations){
		let value : any = undefined;
		let oldAnnotations : any = {};
		Object.keys(this.annotations).forEach((key)=>{
			oldAnnotations[key] = this.annotations[key];
		});
		let oldSubtemplates = []; // only needed if this spec contains subtemplates
		// clone the current subtemplates in case methods add new ones that overwrite more global ones
		for (let key in this.subtemplates){
			oldSubtemplates[key] = this.subtemplates[key];
		}
		if (valueContext != null){ // null implies that the value is the current context
			let bTargetIsTemplate = valueContext.getText().startsWith('[') || valueContext.getText().startsWith('#'); // value will be obtained from a template
			// process annotations first
			if (bTargetIsTemplate){ // TODO: flag annotations on non-templates as errors
				invocations.forEach((child) => {
					let method : string = child.children[0].accept(this);
					if (method == null){
						this.syntaxError('Invalid method syntax', child);
						return;  // bad syntax; don't proceed
					}
					if (method.startsWith('@')){
						let args : any = child.children[1];
						if (false && method == '@Include'){
							this.callMethod(method, oldAnnotations, args); // let include modify the annotations that will be restored
						} else {
							this.callMethod(method, this.annotations, args); // modify the current annotations so that existing annotations are inherited
						}
					}
				});
			}
			if (this.context && this.context.type == 'list' && !valueContext.getText().startsWith('^')){
				// for non-annotations and under special circumstances, depending on how it was parsed, we'll obtain a single value rather than a list
				let bAggregatedResult : boolean = valueContext.constructor.name == 'InvokedTemplateSpecContext';  // only aggregate for this specific context
				if (bAggregatedResult){
					invocations.forEach((child) => {
						let method = child.children[0].accept(this);
						if (method != null){
							if (method.startsWith('@')){
								if (!bTargetIsTemplate){
									this.syntaxError('@ methods can only be applied to subtemplates', child);
								}
							} else {
								bAggregatedResult = false; 
							}
						}
					});
				}
				if (bAggregatedResult){
					value = valueContext.accept(this); // let the children process the list to obtain a single value
				} else {
					// create an "argument" list object to pass to the method
					let list = [];
					this.context.iterateList((newContext : TemplateData)=>{
						let oldContext = this.context;
						this.context = newContext;
						list.push(this.compose(valueContext.accept(this), 0)); // reduce each result to a string
						this.context = oldContext;
					});
					value = {type:'argument', list:list};
				}
			} else {
				// obtain the single result
				value = valueContext.accept(this);
			}
		} else {
			value = this.context;
		}
		// process non-annotations by calling each method serially
		invocations.forEach((child) => {
			// Each child is a method and an argument(s) tree
			let method : string = child.children[0].accept(this);
			if (method == null){
				this.syntaxError('Invalid method syntax', child);
			} else {
				if (!method.startsWith('@')){ // annotations have already been processed
					let args : any = child.children[1]; // passing the argument tree to CallMethod
					if (value && typeof value == 'object' && value.type == 'multiline'){
						// run the method on the multiline string which is retained
                        let multilineValue = this.callMethod(method, value.multilines, args);
                        if (Array.isArray(multilineValue)){
                            let multilineParts = [];
                            for (let i = 0; i < multilineValue.length; i++){
                                if (multilineValue[i] && typeof multilineValue[i] == "object" && multilineValue[i].type == 'multiline'){
                                    multilineParts[i] = multilineValue[i].multilines;
                                } else {
                                    multilineParts[i] = multilineValue[i];
                                }
                            }
                            let composedMultiline = this.compose(multilineParts, 0);
                            if (typeof composedMultiline == 'string'){
                                multilineValue = composedMultiline;
                            }
                        }
						if (typeof multilineValue != "string" || !multilineValue.includes('\n')){
							value = multilineValue;
						} else {
							value.multilines = multilineValue;
						}
					} else {
						value = this.callMethod(method, this.compose(value, 0), args);
					}
				}
			}
		});
		if (JSON.stringify(this.annotations.bulletStyles) != JSON.stringify(oldAnnotations.bulletStyles)){
			// the bullet style has changed, so compose the output before the styles get modified back
			// TODO: consider instead adding the current bullet style to all bullets and lists in the output
			value = this.compose(value, 1);
		}
		this.annotations = oldAnnotations;
		this.subtemplates = oldSubtemplates;
		return value;
	}
	visitQuoteLiteral = function(ctx) {
		let value = ctx.getText()
		return this.decodeQuote(value.substr(1, value.length - 2),ctx);
	};
	visitApostropheLiteral = function(ctx) {
		let value = ctx.getText();
		return this.decodeApostrophe(value.substr(1, value.length - 2));
	};
	visitRegex = function(ctx) {
		let value = ctx.getText();
		let expression = value.substring(1, value.lastIndexOf('/'));
		let modifier = value.substr(value.lastIndexOf('/') + 1);
		try{
			value = new RegExp(expression, modifier);
		} catch(e){
			this.syntaxError('invalid regular expression', ctx);
		}
		return value;
	}
	visitMethodInvocation = function(ctx) {
		let children : any = this.visitChildren(ctx);
		let methodName : string = children[0]
		let methodArgResult: string[] = children[1]
		let methodArgs: string[] = [];
		if (methodArgResult){
			for (let i = 0; i < methodArgResult.length; i += 2){
				methodArgs.push(methodArgResult[i]);
			}
		}
		return [methodName, methodArgs];
	};
	visitQuotedArgument = function(ctx) {
		let value = ctx.getText();
		return this.decodeQuote(value.substr(1, value.length - 2),ctx);
	};
	visitApostrophedArgument = function(ctx) {
		let value = ctx.getText();
		return this.decodeApostrophe(value.substr(1, value.length - 2));
	};
	visitTextedArgument = function(ctx) {
		return ctx.getText().trim();
	};
	visitBracedThinArrow = function(ctx) {
		let oldMissingValue = this.annotations.missingValue;
		delete this.annotations.missingValue; // predicates need to see the absense of a value
		let result : any = ctx.children[0].accept(this);
		this.annotations.missingValue = oldMissingValue;
        if (typeof result == 'boolean' && result && ctx.children[2].children){ // protect against invalid syntax
            this.logForDebug(2, ctx.children[0].getText() + '-> succeeded');
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		if (typeof result == 'string' && result.startsWith('ERROR:')){
            this.logForDebug(2, ctx.children[0].getText() + '-> failed');
			return result;
		}
		return ''; // false means ignore this token
	};
	visitBracedArrow = function(ctx) {
		let oldMissingValue = this.annotations.missingValue;
		delete this.annotations.missingValue; // predicates need to see the absense of a value
		let result : boolean = ctx.children[0].accept(this);
		this.annotations.missingValue = oldMissingValue;
			if (Array.isArray(result)){
			result = result[0]; // TODO:why is this one level deep????
		}
		if (result){
            this.logForDebug(2, ctx.children[0].getText() + '=> succeeded');
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		if (ctx.children[2].children.length < 3){
            this.logForDebug(2, ctx.children[0].getText() + '=> failed resulting in null');
			return null; // only true condition specified
        }
        this.logForDebug(2, ctx.children[0].getText() + '-> failed, resulting in second choice');
		return this.visitChildren(ctx.children[2].children[2]) // false
	};
	visitIdentifierCondition = function(ctx) {
		return  this.visitIdentifier(ctx);
	}
	visitLogicalOperator = function(ctx) {
		let operator : string = ctx.children[1].getText() 
		let leftCondition : boolean = ctx.children[0].accept(this);
		if (!leftCondition && operator == '&'){
			return false;
		}
		if (leftCondition && operator == '|') {
			return true;
		}
		return ctx.children[2].accept(this);
	};
	visitIdentifierOperand = function(ctx){
		return this.visitIdentifier(ctx);
	}
	visitQuoteOperand = function(ctx){
		return this.visitQuotedArgument(ctx);
	}
	visitApostropheOperand = function(ctx){
		return this.visitApostrophedArgument(ctx);
	}
	visitDigits = function(ctx){
		return parseInt(ctx.getText());
	}
	visitRelationalOperand = function(ctx){
		return ctx.children[0].accept(this);
	}
	visitPredicateArgument = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitRelationalOperation = function(ctx) {
		let leftValue = ctx.children[0].accept(this);
		let rightValue = ctx.children[2].accept(this);
		let operator = ctx.children[1].getText();
		// null == null and  null != !null
		if (leftValue == null || this.valueIsMissing(leftValue)){
			if (rightValue == null || this.valueIsMissing(rightValue) || operator == '!='){
				return true;
			}
			return false;
		}
		// !null != null and !null == null
		if (rightValue == null || this.valueIsMissing(rightValue)){
			if (operator == '!='){
				return true;
			}
			return false;
		}
		if (numericTest.test(leftValue.toString().trim()) && numericTest.test(rightValue.toString().trim())){
			leftValue = parseInt(leftValue);
			rightValue = parseInt(rightValue)
		} else {
			leftValue = leftValue.toString();
			rightValue = rightValue.toString();
		}
		switch (operator){
			case '=':
			case '==':
				return leftValue ==rightValue
			case '>':
				return leftValue > rightValue;
			case '<':
				return leftValue < rightValue;
			case '>=':
				return leftValue >= rightValue;
			case '<=':
				return leftValue <= rightValue;
			case '!=':
				return leftValue != rightValue;
		}
	}
	visitBracketedTemplateSpec = function(ctx) {
		let oldSubtemplates = []; // only needed if this spec contains subtemplates
		let lastChildIndex = ctx.getChildCount() - 2;
		let bHasSubtemplates = ctx.children[lastChildIndex].constructor.name == "TemplateContentsContext" && ctx.children[lastChildIndex].getChildCount() > 0 && ctx.children[lastChildIndex].children[0].constructor.name == "SubtemplateSectionContext";
		if (bHasSubtemplates){
			// clone the current subtemplates because the ones found here are scoped
			for (let key in this.subtemplates){
				oldSubtemplates[key] = this.subtemplates[key];
			}
			ctx.children[lastChildIndex].accept(this); // visit to load subtemplates
			lastChildIndex--; // no need to visit it again
		}
		let result = [];
		// skipping the first and last children (and the subtemplates) because the are the surrounding brackets
		for (let i : number = 1; i <= lastChildIndex; i++){
			if (ctx.children[i].constructor.name != 'TerminalNodeImpl'){ // skip over unparsed (probably comments)
				let childResult = ctx.children[i].accept(this);
				if (typeof childResult == 'object' && childResult != null && childResult.constructor.name == 'TemplateData'){
					if (childResult.isScalarList()){
						let list = [];
						childResult.list.forEach((item)=>{
							list.push(item.getValue('_').toString())
						});
						childResult = list.join(', ');
					} else if (childResult.type == 'dictionary' && childResult.getValue('_')){
						childResult = childResult.getValue('_');
					} else if (lastChildIndex != 1){
						this.syntaxError('Data needs to be interpolated with a subtemplate', ctx.children[i]);
						childResult = childResult.toJson();
					}
				}
				result.push(childResult);
			}
		}
		if (bHasSubtemplates){
			this.subtemplates = oldSubtemplates; // subtemplates are scoped, so remove the ones we found
		}
		if (result.length == 1){
			result = result[0];
		}
		return result;
	};
	visitMethodableTemplateSpec = function(ctx) {
		let value : any;
		if (this.context && this.context.type == 'list'){
			let listObject = {list: [], type: 'list', defaultIndent: this.annotations.defaultIndent};
			this.context.iterateList((newContext : TemplateData)=>{
				let oldContext : TemplateData = this.context;
				this.context = newContext;
				listObject.list.push(this.visitChildren(ctx)[0]);
				this.context = oldContext;
			});
			let refinedList = [];
			listObject.list.forEach((item)=>{
				if (this.compose(item, 0) != null){
					refinedList.push(item);
				}
			});
			if (refinedList.length == 0){
				refinedList.push({type: 'missing', missingValue: this.annotations.missingValue, key: 'list'});
			}
			listObject.list = refinedList;
			if (listObject.list.length == 1){
				return listObject.list[0]; // no longer a list
			}
			return listObject;
		} else {
			value = this.visitChildren(ctx)[0];
		}
		return value;
	}
	visitNamedSubtemplate = function(ctx, name = null, bInclude = false){
        let subtemplateName : string = name != null ? name : ctx.getText();
        this.logForDebug(4, 'invoking subtemplate ' + subtemplateName);
		if (!this.subtemplates[subtemplateName]){
            if (this.bLoadingInclude){
                return ''; // give priority to includes
            }
			// load the subtemplate from the server
			let subtemplateUrl = '/subtemplate/' + subtemplateName.substr(1); // remove the #
			if (!urls[subtemplateUrl]){
				urls[subtemplateUrl] = {};
			}
			if (!urls[subtemplateUrl].data){
                if (bInclude){
                    this.bLoadingInclude = true;
                }
				return 'loading subtemplate "' + subtemplateName + '"';
			}
			// process the loaded subtemplate
			let data = urls[subtemplateUrl].data;
			let bError = typeof data == 'object';
			if (bError || data.substr(0 ,1) != '['){
				let msg = 'Error loading subtemplate "' + subtemplateName + '": ' + (bError ? data.error : data);
				console.error(msg);
				this.syntaxError(msg, ctx);
				this.subtemplates[subtemplateName] = '[' + msg + ']';
				return '';
			}
			// process info between brackets adding an extra nl so "included" subtemplates can start with "Subtemplates:"
			let processed : any = processSubtemplates((bInclude ? '\n' : '') + data.substr(1, data.lastIndexOf(']') - 1), 0);
			// replace the brackets around the extracted input when storing the subtemplate and add any methods on the template
			this.subtemplates[subtemplateName] = '[' + processed.input + ']' + data.substr(data.lastIndexOf(']') + 1); 
			// parse and cache local subtemplates
			Object.keys(processed.subtemplates).forEach((key)=>{
				let subtemplate = processed.subtemplates[key];
				this.parseSubtemplates(processed.subtemplates[key], key, subtemplate.line - 1, subtemplate.column);
			});
		}
		let parserInput = '{:' + this.subtemplates[subtemplateName] + '}';
		let oldSubtemplateLevel = this.subtemplateLevel;
		this.subtemplateLevel += ((this.subtemplateLevel != '' ? '.' : '') + subtemplateName);
		let tree = parsedTemplates[parserInput];
		if (!tree){
			// cache the parsed tree and tokens
			tree = parseTemplate(parserInput);
			parsedTemplates[parserInput] = tree;
			parsedTokens[parserInput] = tokensAsString(tree);
		}
		if (this.recursionLevel > 20){
			console.error('ERROR: too many levels of recursion when invoking ' + subtemplateName);
			return 'ERROR: too many levels of recursion when invoking ' + subtemplateName;
		}
		++this.recursionLevel;
		let oldInput = this.input;
		let oldSubtemplates = {};
		let localSubtemplateNames = [];
		for (let key in this.subtemplates){
			if (key.startsWith(subtemplateName + '.')){
				localSubtemplateNames.push(key);
			}
			oldSubtemplates[key] = this.subtemplates[key];
		}
		// add local subtemplates
		localSubtemplateNames.forEach((localSubtemplateName)=>{
			// this will overwrite any global or higher level local subtemplate
			this.subtemplates[localSubtemplateName.substring(subtemplateName.length + 1)] = this.subtemplates[localSubtemplateName]; 
		});
		this.input = parserInput;
		let result : any = this.visitCompilationUnit(tree);
		--this.recursionLevel;
		// restore (pop) old states
		this.subtemplates = oldSubtemplates;
		this.input = oldInput;
		this.subtemplateLevel = oldSubtemplateLevel;
		if (typeof result == 'string'){
			result = [result]; // return in an array for consistency
		}
        this.logForDebug(4, 'returned from subtemplate ' + subtemplateName);
		this.setHoverPositions(ctx, this.compose(result, 2));
		return result;  
	}
	// TODO: this should go away because subtemplates are now preprocessed
	visitSubtemplateSpecs = function(ctx) {
		if (ctx.children){
			ctx.children.forEach((child)=>{
				if (child.children[0].children[1].constructor.name == 'NamedSubtemplateContext'){
					let templateString : string = child.children[0].children[3].getText();
					this.subtemplates[child.children[0].children[1].getText()] = templateString;
				}
			});
		}
		return null;
	}
	visitBraceArrow = function(ctx) {
		return this.visitChildren(ctx)[0]; // remove a level of arrays
	};
	visitTemplateSpec = function(ctx) {
		let result = this.visitChildren(ctx)[0];
		return result;
	};
	/* we SHOULD be collecting subtemplate info here, but processSubtemplates is used for performance reasons
	visitSubtemplateSection = function(ctx) {
		if (ctx.children[1].children == null){
			// protect against invalid section
			return '';
		}
		// visit the children to load the subtemplates dictionary, but don't output anything
		this.visitChildren(ctx);
		return '';
	};
	*/
	visitOptionallyInvoked = function(ctx) {
		let result = this.visitChildren(ctx);
		//if (result.length == 1){
			return result[0];
		//}
		//return result;
	};
	visitNotPredicate = function(ctx) {
		let result : any = this.visitChildren(ctx)[1];
		return !result;
	};
	visitCondition = function(ctx) {
		let value = this.visitChildren(ctx)[0];
		// testing to see if the identifier has a value
		if (!this.valueIsMissing(value) && value != ''){
			if (this.annotations.falsy != null && this.annotations.falsy.test(value)){
				return false;
			}
			return true;
		}
		return false;
	};
	visitBraced = function(ctx) {
		// remove extraneous array
		return this.visitChildren(ctx)[0];
	};
	visitBracketedArgument = function(ctx) {
		// remove extraneous array
		return this.visitChildren(ctx)[0];
	};
	visitNestedPredicate = function(ctx) {
		return this.visitChildren(ctx)[1];  // return second of three children (left paren, the predicate, right paren)
	};
	visitBraceThinArrow = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitBullet = function(ctx) {
		let text = ctx.getText();
		if (!text.includes('\n')){
			let previousTokenArray = ctx.parser.getTokenStream().getTokens(ctx.getSourceInterval().start - 1, ctx.getSourceInterval().start);
			if (previousTokenArray != null){ // check for first token
				let previousTokenText = previousTokenArray	[0].text;
				if (previousTokenText.startsWith('[') && previousTokenText.includes('\n') && !previousTokenText.includes('`')){  // don't correct if continue character (`) is pressent
					// correct for bracket removing white space if followed by a bullet
					text = previousTokenText.replace(/^[^\n]+(.*)/, '$1') + text;
				}
			}
		}
		return {type:'bullet', bullet: text.replace('{','\x01{'), defaultIndent: this.annotations.defaultIndent, parts: []};
	};
	visitBeginningBullet = function(ctx) {
		return this.visitBullet(ctx);
	};
	callMethod = function(method : string, value : any, args: any){
        this.logForDebug(6, 'Invoking method ' + method);
		let externalMethod = Externals.getMethod(method);
		if (externalMethod){
			return externalMethod(value, args, this);
		}
		let argValues = [];
		if (args.constructor.name == 'ConditionContext'){
			// the argument is a boolean
			argValues[0] = args.accept(this);
		} else if (args.constructor.name == 'ArgumentsContext' && method != 'Case'){
			let oldContext = this.context;
			if (this.context && this.context.type == 'list'){
				this.context = new TemplateData('{}', this.context); // bury lists to keep templates arguments from evaluating multiple times
			}
			for (let i = 0; i < args.children.length; i++){
				if ((method == 'GroupBy' || method == 'OrderBy') && i == 0){
					// defer evaluation of the first parameter of a Group
					argValues.push(null); // placeholder
				} else {
					let arg = args.children[i].accept(this);
					if (arg !== undefined){ // remove result of commas
						if (arg.constructor.name == 'RegExp' ){
							argValues.push(arg);
						} else {
							argValues.push(this.compose(arg, 0));
						}
					}
				}
			}
			this.context = oldContext;
		}
		let parentCtx : any = args.parentCtx;
		if (typeof value != 'string' && !(value != null && typeof value == 'object' && value.type == 'date') && (
			method == 'ToUpper' 
			|| method == 'ToLower'  
			|| method == 'Trim' 
			|| method == 'EncodeFor'
		)){
			value = this.compose(value, 2); // turn the value into a string
		}
		// TODO: table driven argmument handling
		let bTemplate = parentCtx.children[1] && parentCtx.children[1].constructor.name == "InvokedTemplateSpecContext";
		let error : string = null;
		if (bTemplate || method.startsWith('#')){
			if (Array.isArray(value)){
				value = value.join('');
			}
			let oldContext : TemplateData = this.context;
			// TODO: consider a clean context as a child of the context
			let newContext = new TemplateData({}, this.context);
			// add the current value as $0 and each argument as $1...n
			newContext.add('$0', value);
			for (let i = 0; i < argValues.length; i++){
				let argObject = args.children[i].accept(this);
				if (Array.isArray(argObject) && argObject.length == 1){
					argObject = argObject[0];
				}
				if (argObject != null && typeof argObject == 'object' && !Array.isArray(argObject)){
					if (argObject.type == 'date'){
						newContext.add('$' + (i + 1), argObject.string); // provide the original string value
					} else if (argObject.type == 'list'){
						newContext.add('$' + (i + 1), argValues[i]);
					}
					// if the type is 'missing', don't add it
				} else {
					newContext.add('$' + (i + 1), argValues[i]);
				}
			}
			this.context = newContext;
			if (!bTemplate){
				value = this.visitNamedSubtemplate(args.parentCtx, method); // using subtemplate as a meth
			} else {
				let result = parentCtx.children[1].accept(this);
				value = ''; 
				if (result){ // needed to protect against bad syntax
					value = result[1]; // ignore the brackets when calling a bracketed template
				}
			}
			this.context = oldContext;
		} else if (this.valueIsMissing(value) && !(
			method == 'Count' 
			|| method == 'Where' 
			|| method == 'ToJson' 
			|| method == 'Matches' 
			|| method == 'IfMissing'
		)){
			value = value; // null with most methods returns null
		} else if (typeof value != 'string' && !(value != null && typeof value == 'object' && value.type == 'date') && (
			method == 'ToUpper' 
			|| method == 'ToLower'  
			|| method == 'Trim' 
			|| method == 'EncodeFor'
		)){
			error = 'ERROR: invalid method, ' + method + ' for this data: ' + parentCtx.getText();
		} else if (args.children && (method == 'ToUpper' || method == 'ToLower' || method == 'Trim')){
			error = 'ERROR: invalid argument for ' + method + ': ' + args.getText();
		} else if (argValues.length != 2 && (method == 'Replace')){
			error = 'ERROR: wrong number of arguments for ' + method + ': ' + args.getText();
		} else if (!args.children && (
			method == 'GreaterThan' 
			|| method == 'LessThan' 
			|| method == 'Align' 
			|| method == 'StartsWith' 
			|| method == 'EndsWith' 
			|| method == 'Replace' 
			|| method == 'Contains' 
			|| method == 'Substr' 
			|| method == 'IndexOf'
			|| method == 'EndIndexOf'
			|| method == 'EncodeFor'
		)){
			error = 'ERROR: missing argument for ' + method + ': ' + args.getText();
		} else if (args.children && args.children.length > 1 && (
			method == '@DateTest'
			|| method == '@Falsy'
			|| method == '@DefaultIndent'
		)){
			error = 'ERROR: invalid arguments for ' + method + ': ' + args.getText();
		} else if ((args.children && args.children.length > 1 || (argValues[0] == null && method != 'Contains')) && (
			method == 'GreaterThan' 
			|| method == 'LessThan' 
			|| method == 'StartsWith' 
			|| method == 'EndsWith' 
			|| method == 'Contains' 
            || method == 'IndexOf'
			|| method == 'EndIndexOf'            
			|| method == 'EncodeFor'
			|| method == '@EncodeDataFor'
		)){
			error = 'ERROR: invalid arguments for ' + method + ': ' + args.getText();
		} else if (value == null || (typeof value == 'object' && (value.constructor.name == 'TemplateData' || value.type == 'argument') && (
			method == ''
			|| method == 'ToUpper'
			|| method == 'ToLower'
			|| method == 'GreaterThan'
			|| method == 'LessThan'
			|| method == 'Case'
			|| method == 'Align'
			|| method == 'Trim'
			|| method == 'StartsWith'
			|| method == 'EndsWith'
			|| method == 'Replace'
			|| method == 'Contains'
			|| method == 'Substr'
			|| method == 'LastIndexOf'
            || method == 'IndexOf'
            || method == 'EndIndexOf'
			|| method == 'EncodeFor'
		))){
			value = null;
		} else {
			switch (method){
				case 'ToUpper':
					value = this.valueAsString(value).toUpperCase();
					break;

				case 'ToLower':
					value = this.valueAsString(value).toLowerCase();
					break;
					
				case 'EncodeFor':
					switch (argValues[0]){
						case 'html':
							value = this.encodeHTML(value);
							break;
						case 'xml':
							value = this.encodeXML(value);
							break;
						case 'uri':
							value = encodeURIComponent(value);
							break;
						default:
							this.syntaxError("Parameter must be 'xml', 'html' or 'uri'", args);
							break;
					}
					break;

				case 'GreaterThan':
				case 'LessThan':
					let arg = argValues[0];
					if (numericTest.test(arg.toString().trim()) && numericTest.test(value.toString().trim())){
						arg = parseInt(arg);
						value = parseInt(value)
					} else {
						arg = arg.toString();
						value = value.toString();
					}
					value = method == 'GreaterThan' ? (value > arg) : (value < arg);
					break;

				case 'Case':
					let caseArgs = [];
					if (args.children){
						args.children.forEach((child)=>{
							if (child.constructor.name != 'TerminalNodeImpl'){
								caseArgs.push(child);
							}
						});
					}
					if (args.constructor.name != 'ArgumentsContext' || caseArgs.length < 3){
						this.syntaxError('Too few arguments for the Case method', args);
					} else {
						for (let i = 0; i < caseArgs.length; i+=2){
							let arg = caseArgs[i].accept(this);
							let val = this.compose(arg, 0);
							val = val == null ? '' : val.toString();
							if ((numericTest.test(val.trim()) && numericTest.test(value.toString().trim()) && parseInt(val) == parseInt(value)) || val == value.toString()){
								this.logForDebug(2, 'Case of ' + value.toString().trim() + ' resulted in ' + caseArgs[i+1].getText() + ' being selected');
								value = this.compose(caseArgs[i+1].accept(this), 0);
								break;
							} else if ((i + 3) == caseArgs.length){
								this.logForDebug(2, 'Case of ' + value.toString().trim() + ' resulted in default of ' + caseArgs[i+2].getText() + ' being selected');
								value = this.compose(caseArgs[i+2].accept(this), 0); // default
								break;
							}
						}
					}
					break;

				case 'Assert':
				case 'Matches':
					let originalValue = value;
					if (typeof value == 'string' && value.includes('\x01{.}')){
						// special case for matching the output of bullet templates
						let oldBulletIndent = this.bulletIndent;
						value = this.compose([value], 1); // compose with bulleting
						this.bulletIndent = oldBulletIndent;
					}
					let matches : any = false;
					if (argValues.length == 0 || this.valueIsMissing(value)){
						if (argValues.length == 0 && this.valueIsMissing(value)){
							matches = true; //TODO: is it appropriate to match nulls?
						}
					} else {
						let bFirst = true;
						argValues.forEach((arg)=>{
							if (arg != null && (method != 'Assert' || bFirst)){ // Assert only matches the first argument
								if (arg.constructor.name == 'RegExp'){
									matches = matches || arg.test(value);
								} else if ((numericTest.test(arg.toString().trim()) && numericTest.test(value.toString().trim()) && arg == value) || arg.toString() == value.toString()){
									matches = true;
								} else if (typeof arg == 'string' && arg.includes('\x01{.}') && value == this.compose([arg], 1)){
									matches = true;
								} 
								bFirst = false;
							}
						});
					}
					if (method == 'Assert'){
						if (matches == true){
							if (argValues.length > 1){
								value = argValues[1];
							} else {
								value = originalValue; // if the second argument is missing, return the original value
							}
						} else if (argValues.length > 2){
							value = argValues[2];
						} else {
							let failure = 'ASSERT FAILURE:\n';
							let arg = argValues[0];
							let i = 0;
							for (; i < value.length && i < arg.length; i++){
								if (value.substr(i, 1) != arg.substr(i, 1)){
									break;
								}
							}
							failure += value.substr(0, i) + '--->';
							if (i == value.length){
								failure += ('Missing: ' + arg.substr(i));
							} else if (i == arg.length){
								failure += ('Unexpected: ' + value.substr(i));
							} else {
								failure += ('Mismatch: ' + value.substr(i));
							}
							value = failure;
						}
					} else {
						value = matches;
					}
					break;

				case 'Join':
					if (argValues.length > 2){
						this.syntaxError('Too many arguments for the Join method', args);
					}
					if (value && typeof value == 'object'){
						if (value.type == 'argument' || (value.constructor.name == 'TemplateData' && value.isScalarList())){
							let joiner = ', ';
							if (argValues.length > 0){
								joiner = argValues[0];
							}	
							let valList = value.list;
							if (value.type == 'list'){
								valList = [];
								value.list.forEach((item)=>{
									valList.push(item.getValue('_').toString()); // '_' is the attribute name for a list of scalars
								});
							}
							let list = [];
							valList.forEach((listItem)=>{
								if (listItem && !(typeof listItem == 'object' && listItem.type == 'missing')){
									list.push(listItem);
								}
							});
							for (let i : number = 0; i < list.length - 1; i++){
								if (argValues.length > 1 && i == (list.length - 2)){
									list[i] += argValues[1];
								} else {
									list[i] += joiner;
								}
							}
							if (list.length == 0){
								value = '';
							} else {
								value = list.join('');
							}
						} else {
							this.syntaxError('Invalid data for Join', args.parentCtx);
						}
					}
					break;
				
				case 'Compose':
					value = this.compose(value,1);
					this.bulletIndent = null; // reset bulleting
					break
					
				case 'Count':
				case 'Where':
					if (!args.children){
						// no arguments
						if (method == 'Where'){
							value = 'ERROR: no condition specified for .Where()';
							this.syntaxError(value, args.parentCtx);
						} else if (method == 'Count'){
							if (value == undefined){
								value = 0;
							} else if (value instanceof TemplateData && value.type == 'list'){
								value = value.count();
							} else if (value && typeof value == 'object' && value.type == 'argument'){
								let list = [];
								value.list.forEach((item)=>{
									if (item && !(typeof item == 'object' && item.type == 'missing')){
										list.push(item);
									}
								});
								value = list.length;
							} else if (value == null || (typeof value == 'object' && value.type == 'missing')){
								value = 0;
							} else {
								value = 1;
							}
						}
					//} else if (!(args.constructor.name == 'ConditionContext' || args.constructor.name == 'NotPredicateContext' || args.constructor.name == 'LogicalOperatorContext' || args.constructor.name == 'NestedPredicateContext')){
						//value = 'ERROR: invalid argument for ' + method + ': ' + args.getText();
						//this.syntaxError(value, args);
					} else {
						if (value instanceof TemplateData){
							let oldContext : TemplateData = this.context;
							// temporarily set the context to the value being evaluated
							this.context = <TemplateData>value;
							let dollarVariables = {};
							oldContext.getKeys().forEach((key)=>{
								if (key.startsWith('$')){
									dollarVariables[key] = oldContext.getValue(key);
								}
							});
							let result = [];
							if (this.context.type == 'list'){
								this.context.iterateList((newContext)=>{
									let oldContext : TemplateData = this.context;
									this.context = newContext;
									Object.keys(dollarVariables).forEach((key)=>{
										newContext.dictionary[key] = dollarVariables[key]; // pass on the $ variables
									});
                                    let addToResult = args.children[0].accept(this);
                                    if (Array.isArray(addToResult)){
                                        addToResult = addToResult[0];
                                    }
									if (this.valueIsMissing(addToResult) || (typeof addToResult == "string" && this.annotations.falsy && this.annotations.falsy.test(addToResult))){
										addToResult = false;
									}
									if (addToResult){
										// the condition returned true; add a clone of the iteration 
										Object.keys(dollarVariables).forEach((key)=>{
											delete newContext.dictionary[key];  // remove the added $ variables
                                        });
                                        this.context.getKeys().forEach((key)=>{
                                            if (key.startsWith('$')){
                                                this.context.remove(key); // prevent clone from breaking
                                            }
                                        });
										result.push(new TemplateData(this.context)); 
									}
									this.context = oldContext;
								});
							} else {
                                Object.keys(dollarVariables).forEach((key)=>{
                                    this.context.dictionary[key] = dollarVariables[key]; // pass on the $ variables
                                });
								let filterResult = args.accept(this);
								while (Array.isArray(filterResult) && filterResult.length == 1){
									filterResult = filterResult[0];
								}
                                Object.keys(dollarVariables).forEach((key)=>{
                                    delete this.context.dictionary[key]; // remove the added $ variables
                                });
								if (filterResult && !(typeof filterResult == 'object' && filterResult.type == 'missing')){
									result.push(this.context); // no filtering (or cloning) necessary 
								}
							}
							this.context = oldContext; // restore old context
							if (result.length == 0){
								value = { type: 'missing', missingValue: this.annotations.missingValue, key: 'list' }; // indication of missing value
							} else {
								value = new TemplateData(result, this.context);
							}
						}
						if (method == 'Count'){
							if (this.valueIsMissing(value)){
								value = 0;
							} else if (value instanceof TemplateData && value.type == 'list'){
								value = value.count();
							} else {
								value = 1;
							}
						}
					}
					break;

				case 'Align':
					if (argValues.length > 3 || argValues.length == 0 || isNaN(parseInt(argValues[0])) 
						   || (argValues.length > 1 && !(argValues[1] == 'L' || argValues[1] == 'R' || argValues[1] == 'C'))){
						this.syntaxError('Incorrect arguments for ' + method, args);
					} else {
						let paddingType = argValues.length == 1 ? 'L' : argValues[1];
						let padding = (argValues.length == 3 && argValues[2] != '') ? argValues[2].toString() : ' ';
						let paddingLength = parseInt(argValues[0]);
						value = value.toString();
						while (value.length < paddingLength){
							if (paddingType == 'L' || paddingType == 'C'){
								value = (value + padding).substr(0, paddingLength);
							}
							if (paddingType == 'R' || paddingType == 'C'){
								let newLength = padding.length + value.length;
								// insure that multi character padding doesn't cause the actual value to be cut and the value is not larger than padding length
								value = ((padding.substr(newLength > paddingLength ? newLength - paddingLength : 0)) + value).substr(0, paddingLength);
							}
						}
					}
					break;

				case 'Trim':
					value = value.trim();
					break;

				case 'StartsWith':
					value = value.startsWith(argValues[0]);
					break;

				case 'EndsWith':
					value = value.endsWith(argValues[0]);
					break;

				case 'Replace':
					if (typeof argValues[0] == "string"){
						// this is a common "replaceAll" implementation which should change when javascript replaceAll becomes standard
						value = value.split(argValues[0]).join(argValues[1]);
					} else {
						// presumably regex
						value = value.replace(argValues[0], argValues[1]);
					}
					break;

				case 'Contains':
					value = value.includes(argValues[0]);
					break;

				case 'Substr':
					if (argValues.length > 2 || isNaN(parseInt(argValues[0])) || (argValues.length == 2 && isNaN(parseInt(argValues[1])))){
						this.syntaxError('Incorrect arguments for ' + method, args);
					}
					if (argValues.length == 1){
						value = value.substr(parseInt(argValues[0]));
					} else {
						value = value.substr(parseInt(argValues[0]), parseInt(argValues[1]));
					}
					break;
					
				case 'LastIndexOf':
					value = value.toString().lastIndexOf(argValues[0]);
					break;

				case 'IndexOf':
					value = value.toString().indexOf(argValues[0])
					break;

                case 'EndIndexOf':
                    let indexOf = value.toString().indexOf(argValues[0]);
                    if (indexOf == -1){
                        value = -1;
                    } else {
                        value = Math.min(value.length, indexOf + argValues[0].length);
                    }
                    break;

				case 'OrderBy':
				case 'GroupBy':
					if (method == 'OrderBy'){
						if (argValues.length == 1){
							argValues.push('A');
						} else if (argValues.length == 2){
							argValues[1] = argValues[1].toUpperCase().replace('ASC', 'A').replace('DESC','D');
						}
					}
					let oldContext : TemplateData = this.context;
					let groups = {};
					if (method == 'GroupBy' && argValues.length == 2 && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(args.children[0].getText())){
						// A formula or other non-identifier must be aliased
						this.syntaxError('An alias (third parameter) must be provided for the GroupBy name', args.children[0]);
					} else if (!(<any>value instanceof TemplateData)){
                        if (!(typeof value == 'string' && (value.startsWith('/') || value.startsWith('http')))){
                            this.syntaxError('Invalid data for ' + method, args.parentCtx);
                        }
					} else if ((method == 'GroupBy' && argValues.length < 2) || (method == 'OrderBy' && (argValues.length != 2 || !(argValues[1] == 'A' || argValues[1] == 'D' || argValues[1] == 'U')))){
						this.syntaxError('Invalid arguments for ' + method, args.parentCtx);
					} else {
						// temporarily set the context to the value being ordered or grouped
						this.context = <TemplateData>value;
						let dollarVariables = {};
						if (oldContext != null){
							oldContext.getKeys().forEach((key)=>{
								if (key.startsWith('$')){
									dollarVariables[key] = oldContext.getValue(key);
								}
							});
						}
						this.context.iterateList((newContext)=>{
							this.context = newContext;
							Object.keys(dollarVariables).forEach((key)=>{
								newContext.dictionary[key] = dollarVariables[key]; // pass on the $ variables in case they are needed for a calculaton
							});
							let groupKey = args.children[0].accept(this)[0];
							if (Array.isArray(groupKey)){
								// composite probably created from a template argument that needs to be composed
								groupKey = this.compose(groupKey, 1);
							}
							Object.keys(dollarVariables).forEach((key)=>{
								delete newContext.dictionary[key];  // remove the added $ variables
							});
							if (groups[groupKey] == null){
								groups[groupKey] = this.context;
							} else {
								if (!Array.isArray(groups[groupKey])){
									groups[groupKey] = [groups[groupKey]];
								}
								groups[groupKey].push(this.context);
							}
						});
						this.context = oldContext;
						let result = [];
						let keys = Object.keys(groups).sort();
						if (method == 'OrderBy' && argValues[1] == 'D'){
							keys.reverse();
						}
						let groupingName = argValues.length == 3 ? argValues[2] : args.children[0].getText(); // use an alias or the GroupBy identifier
						keys.forEach((key)=>{
							let group = groups[key];
							if (method == 'OrderBy'){
								if (Array.isArray(group)){
                                    if (argValues[1] == 'U'){
                                        result.push(group[0]); // Unique, so only use the first one
                                    } else {
                                        group.forEach((member)=>{
                                            result.push(member); // if there is more than one, they are key duplicates
                                        });
                                    }
								} else {
									result.push(group);
								}
							} else {
								// GroupBy
								let data =  {};
								data[groupingName] = key;
								data[argValues[1]] = group;
								result.push(new TemplateData(data));
							}
						});
						value = new TemplateData(result, this.context);
					}
					break;
					
				case 'IfMissing':
					if (!value || (typeof value == 'object' && value != null && value.type =='missing')) {
						value = argValues[0];
					}
					break;
					
				case 'ToJson':
					if (value == null){
						value = 'null';
					} else {
						if (typeof value == 'object' && value.type == 'argument'){
							value = new TemplateData(value.list);
						}
					}
					if (value instanceof TemplateData){
						value = value.toJson();
					} else if (args.parentCtx.parentCtx && args.parentCtx.parentCtx.children[0]){
						let obj = {};
						let templateText : string = args.parentCtx.parentCtx.children[0].getText();
						if (templateText.startsWith('#')){
							obj[templateText] = this.subtemplates[templateText];
						} else if (templateText.startsWith('[')){
							obj['template'] = templateText.substr(1, templateText.length - 2);
						} else {
							obj[templateText] = value == null ? null : value;
						}
						value = JSON.stringify(obj);
					} else {
						value = value.toString();
					}
					break;
					
				case 'ToDate':
					if (value != null && typeof value == 'object' && value.type == 'date'){
						value = value.moment.toObject();
					}
					let date = moment(value);
					if (date.isValid){
						if (argValues.length == 0){
							if (this.annotations.dateFormat != null){
								value = date.format(this.annotations.dateFormat);
							} else {
								value = date.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }); // puts out local format
							}
						} else {
							if (argValues.length > 1 && argValues[1] == 'GMT'){
								//date.subtract(date.parseZone().utcOffset(), 'minutes');
								date.utc();
							}
							value = date.format(argValues[0]);
						}
					}
					break;		

				case '@Include':
					let templateName = argValues[0];
					let oldAnnotations = this.annotations;
					this.annotations = value; // this method is called on higher level template's annotations, so let any @ methods modify it
					Object.keys(this.subtemplates).forEach((key)=>{
						if (key.startsWith(templateName + '.')){
							this.subtemplates[key.substr(templateName.length + 1)] = this.subtemplates[key];
						}
					});
					this.visitNamedSubtemplate(args, templateName, true); // run the named subtemplate, preserving any loaded subtemplates
					this.annotations = oldAnnotations;
					break;
					
				case '@MissingValue':
					value['missingValue'] = argValues[0];
					break;
					
				case '@ValueFunction':
					if (argValues.length == 0){
						delete value['valueFunction'];
					} else {
						let valueFunction = Externals.getValueFunction(argValues[0]);
						if (valueFunction){		
							value['valueFunction'] = valueFunction;
						} else {
							this.syntaxError('Value Function not found: ' + argValues[0], args.children[0]);
							delete value['valueFunction'];
						}
					}
					break;
					
				case '@BulletMode':
					let mode = argValues[0].toLowerCase();
					if (mode != 'explicit' && mode != 'implicit'){
						this.syntaxError('Invalid Bullet Mode', args.children[0]);
					} else {
						value['bulletMode'] = mode;
					}
					break;
					
				case '@DateFormat':
					if (argValues.length == 0){
						delete value['dateFormat'];
					} else {
						value['dateFormat'] = argValues[0];
						if (argValues.length > 1){
							value['dateFormatMode'] = argValues[1];
						}
					}
					if (argValues.length < 1){
						delete value['dateFormatMode'];
					}
					break;

				case '@DefaultIndent':
					if (argValues.length == 0){
						delete value['defaultIndent'];
					} else {
						let nDefaultIndent = parseInt(argValues[0]);
						if (isNaN(nDefaultIndent) || nDefaultIndent > 25 || nDefaultIndent < 1){
							this.syntaxError('@DefaultIndent takes a numerical argument between 1 and 25', args);
						} else {
							value['defaultIndent'] = (' ' + new Array(nDefaultIndent).join(' ')); // generates a string of n blanks
						}
					}
					break;

				case '@DateTest':
					if (argValues.length == 0){
						delete value['dateTest'];
					} else if (argValues.length != 1 || argValues[0].constructor.name != 'RegExp'){
						this.syntaxError('@DateTest takes a single regular expression', args.parentCtx)
					} else {
						value['dateTest'] = argValues[0];
					}
					break;
					
				case '@BulletStyle':
					// TODO: verify that the style is legitimate, including roman numeral correctness
					for (let i = 0; i < argValues.length; i++){
						if (typeof argValues[i] == 'object'){
							this.syntaxError('ERROR: invalid argument for bullet style', args.parentCtx);
							argValues = null;
							break;
						}
					}
					value['bulletStyles'] = argValues;
					break;
					
				case '@EncodeDataFor':
					let encoding = argValues[0];
					if (argValues.length == 0){
						delete this.annotations['encoding'];
					} else if (encoding != 'html' && encoding != 'xml' && encoding != 'uri'){
						this.syntaxError("Parameter must be 'xml', 'html' or 'uri'", args.parentCtx);
					} else {
						this.annotations['encoding'] = encoding;
					}
					break;
					
				case '@Falsy':
					if (argValues.length == 0){
						delete this.annotations['falsy'];
					} else if (argValues.length != 1 || argValues[0].constructor.name != 'RegExp'){
						this.syntaxError('@Falsy takes a single regular expression', args.parentCtx)
					} else {
						value['falsy'] = argValues[0];
					}
					break;
					
				case '@Debug':
                    if (argValues.length != 1 || isNaN(parseInt(argValues[0]))){
                        this.syntaxError('Invalid argument for @Debug', args.parentCtx);
                        return null;
                    }
                    value.debugLevel = parseInt(argValues[0]);
                    break;
                    
				case 'Index':
					if (argValues.length > 2
							|| typeof value != 'object' 
							|| value.constructor.name != 'TemplateData'
							|| (argValues.length > 0 && (isNaN(parseInt(argValues[0])) || parseInt(argValues[0]) == 0 ))
							|| (argValues.length > 1 && (isNaN(parseInt(argValues[1])) || parseInt(argValues[1]) == 0 ))){
						this.syntaxError('Invalid argument for Index', args.parentCtx);
						return null;
					}
					if (argValues.length > 0){
						let index = parseInt(argValues[0]) - 1;
						let endIndex = index + (argValues.length == 1 ? 1 : parseInt(argValues[1]));
						if (value.type == 'dictionary'){
							if (index == 1){
								return value;
							} else {
								return null;
							}
						}
						let slicedList = value.list.slice(index, endIndex);
						if (slicedList.length == 0){
							return null;
						}
						return new TemplateData(slicedList, value);
					}
					if (value == null || typeof value != 'object' || value.constructor.name != 'TemplateData'){
						return 1;
					}
					let parent = value.parent;
					let child = value;
					while (parent != null && parent.type != 'list'){
						child = parent;
						parent = child.parent;
					}
					if (parent == null){
						return 1;
					}
					for (let i = 0; i < parent.list.length; i++){
						if (child === parent.list[i]){
							return i + 1;
						}
					}
					return 1;
					
				case '@MultilineStyle':
					let validStyles = 'Indented,IndentAllButFirst,Padded,Tabbed,Trimmed'.split(',');
					let bInvalid = argValues.includes('Tabbed') && (argValues.includes('Indented') || argValues.includes('IndentAllButFirst'));
					for (let i = 0; i < argValues.length; i++){
						if (typeof argValues[i] != 'string' || !validStyles.includes(argValues[i]) || bInvalid){
							this.syntaxError('ERROR: invalid argument for multiline style', args.parentCtx);
							argValues = [];
							break;
						}
					}
					if (argValues.length == 0){
						delete value['multilineStyle'];
					} else {
						value['multilineStyle'] = argValues;
					}
					break;
					
				default:
					value = value + '[.' + method + '(' + argValues.join(', ') + ')]';
					this.syntaxError('ERROR: unknown function: .' + method + '(' + argValues.join(', ') + ')', args.parentCtx);
					break;
			}
		}
		if (error != null){
			this.syntaxError(error, parentCtx);
			return '';
		}
		return value;
	}
	// this routine is no longer used and has old class names in it
	getTemplateWithoutComments = function(ctx){
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace(/Context$/, '');
		switch (ctxName) {
			case "NamedSubtemplate":
			case "MethodInvoked":
			case "Identifier":
			case "BeginningBulletHolder":
			case "BulletHolder":
			case "Text":
				templateParts.push(ctx.getText());
				break;
			case "TemplateContextToken":
				templateParts.push('{');
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					if (!ctx.children[i].children){
						templateParts.push(':');
					} else {
						templateParts.push(this.getTemplateWithoutComments(ctx.children[i]))
					}
				}
				templateParts.push('}');
				break;
			case "TemplateToken":
				templateParts.push('{');
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					templateParts.push(this.getTemplateWithoutComments(ctx.children[i]));
				}
				templateParts.push('}');
				break;
			//case "OptionallyInvoked":
			//	templateParts.push('{' + ctx.getText() + '}');
			//	break;
			case "BracketedTemplateSpec":
				templateParts.push('[');
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					if (ctx.children[i].constructor.name != 'TerminalNodeImpl'){ // skip over unparsed (probably comments)
						templateParts.push(this.getTemplateWithoutComments(ctx.children[i]))
					}
				}
				templateParts.push(']');
				break;
			case "BracedArrowTemplateSpec":
			case "BracedArrow":
				templateParts.push(this.getTemplateWithoutComments(ctx.children[0]));
				templateParts.push(ctx.children[1].getText());
				if (ctx.children.length > 2){
					templateParts.push(this.getTemplateWithoutComments(ctx.children[2]));
				}
				break;
				
			default:
				ctx.children.forEach(child=>{
					if (child.getChildCount() > 0){
						templateParts.push(this.getTemplateWithoutComments(child));
					}
				});
				break;
		}
		return templateParts.join('');
	}
	// NOTE: the following is only necessary because of a serious performance issue in the ANTLR4 parser (at least the Javascript version)
	// It the issue is ultimately addressed, this code can be simplified by removing calls to processSubtemplates and parseSubtemplates and letting visitSubtemplates extract the subtemplates
	//
	// parseSubtemplates receives a subtemplate object provided by processSubtemplates plus the key
	// If the key is supplied, it saves the template text in the global subtemplates map.
	// The routine parses the template text, caching the resulting parse tree in the global map of parsed templates.
	// Note that the parsedTemplates map is keyed by the text, not the template names, which might be scoped and duplicated with different text
	// After parsing the subtemplate text, the routine calls itself recursively to parse any subtemplates within 
	parseSubtemplates = function(subtemplate, key, line, column){
		let input = subtemplate.text;
		this.subtemplates[key] = input; // global dictionary of loaded subtemplate
		// The RelocatingCollectorErrorListener relocates errors based on where the subtemplate is positioned in the editor
		let tree = parseTemplate(input, [new ConsoleErrorListener(), new RelocatingCollectorErrorListener(this.errors, line, column)])
		parsedTemplates[input] = tree; // cache the parsed text
		if (subtemplate.subtemplates != null){
			// recursively parse local subtemplates found in the subtemplates useing a key qualified by the template name in which it was found
			Object.keys(subtemplate.subtemplates).forEach((subtemplateKey)=>{
				this.parseSubtemplates(subtemplate.subtemplates[subtemplateKey], key + '.' + subtemplateKey, subtemplate.line - 1 + line, column, this);
			});
		}
	}
	setHoverPositions = function(ctx, value){
		if (!this.hoverPositions){
			return;
		}
		let offsets = this.getOffsetsFromProcessedSubtemplates(this.subtemplateLevel);
		let text = ctx.getText();
		let start = ctx.start;
		let stop = ctx.stop;
		let ctxSourceText = start.source && start.source[1] ? ctx.start.source[1].strdata : null;
		if (value == null){
			value = 'null';
		}
		let valueText = this.valueAsText(value);
		let column = start.column;
		if (start.line == 1){
			column += offsets.columnOffset;
			column -= (ctxSourceText && ctxSourceText.indexOf(offsets.text) != -1 ? ctxSourceText.indexOf(offsets.text) : 0);
		}
		let line = start.line + offsets.lineOffset;
		let length = stop.stop - start.start + 1;
		let hoverPositionLine = this.hoverPositions[line];
		if (!hoverPositionLine){
			hoverPositionLine = {columns:{}};
			this.hoverPositions[line] = hoverPositionLine;
		}
		let descriptor = hoverPositionLine.columns[column];
		if (!descriptor){
			descriptor = {variable: text, values: []};
			for (let i = column; i < (column + length); i++){
				hoverPositionLine.columns[i] = descriptor;
			}
		}
		if (!descriptor.values.includes(valueText)){
			descriptor.values.push(valueText);
		}
	}
	getParseTree = function(ctx, indent?){
		const indentBlanks = '   ';
		if (indent === undefined){
			indent = '';
		}
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace(/Context$/,'');
		switch (ctxName) {
			case "TemplateContents":
			case "CompilationUnit":
			case "QuoteLiteral":
			case "ApostropheLiteral":
			case "MethodInvocation":
			case "Comment":
			case "BracedThinArrow":
			case "LogicalOperator":
			case "InvokedTemplateSpec":
			case "SubtemplateSpecs":
			case "BracketedArgument":
			case "Bullet":
			case "BeginningBullet":
			case "MethodInvoked":
			case "TemplateContextToken":
				templateParts.push(indent + ctxName);
				ctx.children.forEach(child=>{
					if (child.getChildCount() > 0){
						templateParts.push(this.getParseTree(child, indentBlanks + indent));
					}
				});
				break;
			case "Method":
			case "Identifier":
			case "NamedSubtemplate":
				templateParts.push(indent + ctxName + ' (' + ctx.getText() + ')');
				ctx.children.forEach(child=>{
					if (child.getChildCount() > 0){
						templateParts.push(this.getParseTree(child, indentBlanks + indent));
					}
				});
				break;
			case "Text":
				templateParts.push(indent + 'Text ("' + ctx.getText().replace(/\n/g,'\\n') + '")');
				break;
			case "BracketedTemplateSpec":
			case "TemplateToken":
				templateParts.push(indent + ctxName);
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					templateParts.push(this.getParseTree(ctx.children[i], indentBlanks + indent));
				}
				break;
			case "BracedArrowTemplateSpec":
			case "BracedArrow":
				templateParts.push(indent + ctxName);
				templateParts.push(this.getParseTree(ctx.children[0], indentBlanks + indent));
				if (ctx.children.length > 2){
					templateParts.push(this.getParseTree(ctx.children[2], indentBlanks + indent));
				}
				break;
			case "TerminalNodeImpl":
				break; // has no children
				
			default:
				ctx.children.forEach(child=>{
					if (child.getChildCount() > 0){
						templateParts.push(this.getParseTree(child, indent));
					}
				});
				break;
		}
		let result = templateParts.join('\n');
		while (result.includes('\n\n')){
			result = result.replace('\n\n','\n'); // empty lines come from children that aren't included in the parse tree
		}
		return result; 
	}
	compose = function(parts, mode){
		// mode 0 is intermediate without resolving the bullets; mode 1 resolves bullets
		if (typeof parts == 'object' && parts != null && !Array.isArray(parts)){
			if (mode == 0 && (parts instanceof TemplateData || parts.type == 'argument' || parts.type == 'missing' || parts.type == 'date')){
				return parts; // don't compose if not appropriate
			}
			parts = [parts];  // do compose expects arrays
		}
		if (!Array.isArray(parts)){
			if (mode == 0){
				return parts;
			}
			parts = [parts];
		}
		let output = {lines: [""], skipping: false, mode: 0, bullets: {}};
		this.doCompose(parts, output, null);
		if (output.skipping){
			// never encountered a new line while skipping
			if (output.lines.length == 1){
				return null; // a null in the array nullified the whole array}
			}
			output.lines = output.lines.slice(0, output.lines.length - 1);  // remove the deleted line's new line
		}
		let bullets = output.bullets;
		// sort the found bullets by length and use that to assign them a level 
		let keys = Object.keys(bullets);
		if (mode == 1 && keys.length > 0){
			let level = 0;
			let bSorting = true;
			while (bSorting){
				let lowest = null;
				keys.forEach((key)=>{
					if (bullets[key].level == null && (lowest == null || bullets[key].length < bullets[lowest].length)){
						lowest = key;
					}
				});
				if (lowest != null){
					bullets[lowest].level = level++;
				} else {
					bSorting = false;
				}
			}
			let composed = output.lines.join('\n');
			output = {lines: [""], skipping: false, mode: 1, bullets: bullets};
			this.doCompose([composed], output, null);
		}
		return output.lines.join('\n');
	}
	doCompose = function(parts, output, indent){
		let lines = output.lines;
		for (let iParts = 0; iParts < parts.length; iParts++){
			let item = parts[iParts];
			if (item != null && typeof item == 'object'){
				switch (item.type){
					case 'bullet':
						if (parts.length > 1){
							// create a new bullet object to avoid a side effect
							let bulletParts = [];
							item.parts.forEach((part)=>{
								bulletParts.push(part);
							});
							item = {type: 'bullet', bullet: item.bullet, parts: bulletParts, defaultIndent: item.defaultIndent}; 
							for (iParts++; iParts < parts.length; iParts++){
								item.parts.push(parts[iParts]); // repackage the remaining parts by adding them to the bullet object 
							}
						}
						break;
					case 'missing':
						item = item.missingValue;
						break;
					case 'date':
						item = this.valueAsString(item);
						break;
				}
			}
			if (item == null){
				console.debug('Skipping line containing ' + lines[lines.length - 1] + ' because of a null in the composition input');
				lines[lines.length - 1] = ''; // skipping this line
				output.skipping = true;
			} else if (this.isScalar(item)){
				this.addToOutput(item.toString(), output);
			} else if (Array.isArray(item)){
				let bulletInTheOutput = lines[lines.length - 1].replace(/^([ \t]*(\x01\{\.\})?).*/s,'$1'); 
				// determine if the current bulleted indent is being overridden by a plain indent
				let bReplaceIndent = !!indent && indent.includes('\x01{.}') && !bulletInTheOutput.includes('\x01{.}') && bulletInTheOutput.length > 0;
				indent = this.doCompose(item, output, bReplaceIndent ? bulletInTheOutput : indent);
			} else if (typeof item == 'object' && item != null){
				if (item.type == 'multiline'){
					let multilines = item.multilines.split('\n');
					let bIndentAllButFirst = item.multilineStyle.includes('IndentAllButFirst');
					let bPadded = item.multilineStyle.includes('Padded');
					let bTabbed = item.multilineStyle.includes('Tabbed');
                    let bIndented = item.multilineStyle.includes('Indented');
                    let bTrimmed = item.multilineStyle.includes('Trimmed');
					let nIndent = 0;
					if (bIndented || bIndentAllButFirst || bTabbed){
						nIndent = 4;						
						if (!bTabbed){
							nIndent += output.lines.length > 1 ? output.lines[output.lines.length - 1].replace(/( *).*$/,'$1').length : 0;
						}
					}
                    let multilineIndent = ' '.repeat(nIndent);
                    if (bTrimmed){
                        for (let i = 0; i < multilines.length; i++){
                            multilines[i] = multilines[i].trim();
                        }
                    }
					this.addToOutput((bIndentAllButFirst ? '' : '\n' + multilineIndent) + multilines.join('\n' + multilineIndent) + (bPadded ? '\n' : ''), output)
				} else if (item.type == 'bullet'){
					this.addToOutput(item.bullet, output);
					indent = item.bullet;
					if (item.parts == null) {
					} else if (typeof item.parts == 'string' || typeof item.parts == 'number'){
						this.addToOutput(item.parts.toString(), output);
					} else if (typeof item.parts == 'object' && item.parts != null && item.constructor.name != ''){
						if (Array.isArray(item.parts) || item.parts.type == 'bullet' || item.parts.type == 'missing' || item.parts.type == 'multiline'){
							this.doCompose([item.parts], output, item.bullet);
						} else {
							// list
							for (let i = 0; i < item.parts.list.length; i ++){
								this.doCompose([item.parts.list[i]], output, item.bullet);
								if (i < item.parts.list.length - 1){
									this.addToOutput('\n', output);
								}
							}
						}	
					} else {
						let x = 'stop'; // unexpected
					}
				} else {
					// list
					let nextLine = '';
					let bNextLineStartsWithBullet = false;
					if (item.list.length > 0){
						// preview the next line to let routines below determine what is needed
						nextLine = this.compose([item.list[0]], 0);  // note that send an array to compose insures a string
						if (typeof nextLine == "string"){
							bNextLineStartsWithBullet = /^\s*\x01{.}.*/s.test(nextLine);
						}
					}
					if (!!indent && indent.includes('\x01{.}')){
						// This is an unbulleted list under a bullet, so we need to turn each list item into an indent object with an indented bullet
						let bIncompleteBullet = /^[ \t]*\x01\{\.\}[ \t]*$/.test(lines[lines.length - 1]);
						let defaultIndent = item.defaultIndent == null ? '   ' : item.defaultIndent;
						let newBullet = indent.replace(/([ \t]*\x01\{\.\})/, defaultIndent + '$1'); 
						for (let i = 0; i < item.list.length; i++){
							let itemResult = item.list[i];
							let indentObject = itemResult;
							// let the next level handle an array of items that aren't lists or indents
							if (!bNextLineStartsWithBullet){
								indentObject = {type: 'bullet', parts: itemResult, defaultIndent: defaultIndent, bullet: bIncompleteBullet ? indent : newBullet};
							}
							if (i == 0){
								let doComposeParm = [indentObject];
								if (bIncompleteBullet){
									doComposeParm = Array.isArray(itemResult) ? itemResult : [itemResult];
								}
								this.doCompose(doComposeParm, output, indent);
							} else {
								let firstItem = indentObject;
								let firstItemIndent = '';
								if (Array.isArray(firstItem)){
									firstItem = firstItem[0];
								}
								if (firstItem != null && typeof firstItem == 'object' && firstItem.type == 'bullet'){
									firstItemIndent = firstItem.bullet;
								}
								if (!indent.includes('\n') && !firstItemIndent.includes('\n')){
									this.addToOutput('\n', output);
								}
								this.doCompose([indentObject], output, indent);
							}
						}
					} else {
						// create a list and indent it under the current line, if it isn't empty
						let bEmptyLine = lines[lines.length - 1] == '';
						let lastIndent = lines[lines.length - 1].replace(/^([ \t]*).*$/, '$1');
						let defaultIndent = item.defaultIndent == null ? '   ' : item.defaultIndent;
						let newIndent = (indent == null ?  defaultIndent + lastIndent : defaultIndent + indent);
						let nextIndent = '';
						if (item.list.length > 0){
							let nextLine = this.compose(item.list[0], 0); // preview the next line to see its indent is already sufficient
							nextIndent = typeof nextLine == 'string'  ?  nextLine.replace(/^([ \t]*).*/s, '$1') : '';
						}
						if (nextIndent.length > lastIndent.length){
							newIndent = null;  // it is already indented
						}
						let bIncompleteIndent = lines[lines.length - 1] == indent;
						if (bIncompleteIndent){
							newIndent = indent;
						} else if (lastIndent == lines[lines.length - 1]){
							// starting a new indent
							newIndent = lastIndent;
							bIncompleteIndent = true;
						}
						let bFirst = true;
						item.list.forEach((listItem)=>{
							if (nextLine != null && nextLine.startsWith('\n')){
								newIndent = indent;
							}
							if (nextLine != null && !nextLine.startsWith('\n') && !(bIncompleteIndent && bFirst) && (!bEmptyLine || !bFirst)){
								this.addToOutput('\n', output); // start a new line
								if (!!newIndent && newIndent != '' && !bNextLineStartsWithBullet){
									this.addToOutput(newIndent, output);
									if (typeof listItem == "string"){
										// indent the contents
										listItem = listItem.replace(/\n/g, '\n' + newIndent);
									}
								}
							}
							this.doCompose(Array.isArray(listItem) ? listItem : [listItem], output, newIndent);
							bFirst = false;
						});		
					}
				}
			} else {
				let x = 'stop';
			}
		}
		return indent;
	}
	valueIsMissing(value){
		if (value == null || (typeof value == 'object' && value.type == 'missing')){
			return true;
		}
		return false;
	}
	valueAsString(value : any){
		if (Array.isArray(value)){
			let result = [];
			value.forEach((item)=>{
				result.push(this.valueAsString(item));
			});
			return result.join('');
		}
		if (value == null){
			return '';
		}
		if (typeof value == 'object'){
			switch (value.type){
				case 'bullet':
					return value.bullet + this.valueAsString(value.parts);
					break;
				case 'missing':
					return value.missingValue;
					break;
				case 'list':
					// return the value of the first item
					return this.valueAsString(value.list[0]);
					break;
				case 'date':
					if (!value.moment.isValid()){
						return value.string; // put out the original value
					} else if (value.format == null){
						return value.moment.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }); // put out local format
					} else {
						return value.moment.format(value.format);
					}
					break;
			}
		}
		return value.toString();
	}
	isScalar(value){
		if (value != null && typeof value != "object"){
			return true;
		}
		return false;
	}
	addToOutput(textLines, output){
		let lines = output.lines;
		let arText = textLines.split('\n');
		for (let i = 0; i < arText.length; i++){
			let text = arText[i];
			if (i == 0 && output.skipping){
				if (arText.length == 1){
					return; // no carriage return, so continue skipping
				} else {
					output.skipping = false; // done with skipping
				}
			} else {
				if (output.mode == 1){ // only handle bullets on the final composition
					if (/^[ \t]*\x01\{\.\}/.test(text)){
						// there is a bullet in the text
						let indent = text.replace(/^([ \t]*).*$/, '$1');
						output.bulletIndent = this.bulletIndent == null ? null : this.bulletIndent.clone();
						let bulletObject = output.bullets[text.replace(/^([ \t]*\x01\{\.\}).*$/, '$1')];
						if (bulletObject == null){
							// this could be a strange case where the bullet is on the first line of a new indented subtemplate, so pick the shortest bullet
							let keys = Object.keys(output.bullets).sort((a,b)=>(a.length > b.length) ? 1 : -1);
							if (keys.length > 0){
								bulletObject = output.bullets[keys[0]];
							}
						}
						if (bulletObject == null){
							lines.push('ERROR computing bullet'); // should never happen TODO: raise exception?
						} else {
							this.bulletIndent = new BulletIndent(indent, this.bulletIndent, bulletObject.level, this.annotations.bulletStyles);
						}
						text = text.replace(/[ \t]*\x01\{\.\}/, indent + (this.bulletIndent != null ? this.bulletIndent.getBullet() : ''));
					} else if (this.bulletIndent != null && /\S/.test(text) && this.annotations.bulletMode == 'implicit') {
						// there is a non-bulleted line in the output; see if it should reset bulleting levels because it is less indented then the bullet(s)
						let nextLineIndent = text.replace(/^([ \t]*).*$/,'$1'); // TODO: Should this be an option?
						while (this.bulletIndent != null && this.bulletIndent.indent.length > nextLineIndent.length){
							this.bulletIndent = this.bulletIndent.parent;
						}
					}
				} else if (/^[ \t]*\x01\{\.\}/.test(text)){
					// during mode 0, capture the unique bullets
					let bullet = text.replace(/^([ \t]*\x01\{\.\}).*$/, '$1');
					output.bullets[bullet] = {bullet: bullet, length: bullet.length};
					if (lines[lines.length - 1] != ''){
						// bullets must start on a new line
						lines.push('');
					}
				}
				lines[lines.length - 1] += text;
				if (i < (arText.length - 1)){
					lines.push('');
				}
			}
		}
	}
	/*
	loadSubtemplates(ctx){
		if (ctx.constructor.name == 'SubtemplateSectionContext'){
			this.visitSubtemplateSection(ctx);
			return true;
		}
		if (!ctx.children){
			return false;
		}
		ctx.children.forEach((child)=>{
			if (child.constructor.name != 'TerminalNodeImpl' && child.constructor.name != 'ErrorNodeImpl' && this.loadSubtemplates(child)){
				return true;
			}
		});
		return false;
	}
	*/
	decodeApostrophe(value){
		//return value.replace(/\\n/g,'\n').replace(/\\'/g,"'").replace(/\\\\/g,'\\').replace(/\\b/g,'\b').replace(/\\f/g,'\f').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\\//g,'\/'); 
		return value.replace(/\\n/g,'\n').replace(/\\'/g,"'").replace(/\\\\/g,'\\').replace(/\\\//g,'\/'); 
	}
	decodeQuote(value, ctx){
		// using the JSON parser to unescape the string
		try {
			let tempJson = JSON.parse('{"data":"' + value + '"}');
			return tempJson.data;
		} catch (e){
			this.syntaxError('Invalid quote literal', ctx);
			return '';
		}
	}
	syntaxError(msg, ctx){
        console.error(msg);
        this.logForDebug(0, msg);
		let offset = this.getOffsetsFromProcessedSubtemplates(this.subtemplateLevel);
		let startColumnOffset = ctx.start.line == 1 ? offset.columnOffset : 0;
		let stopColumnOffset = ctx.stop.line == 1 ? offset.columnOffset : 0;
		this.errors.push(new Error(ctx.start.line + offset.lineOffset, ctx.stop.line + offset.lineOffset, ctx.start.column + 1 + startColumnOffset, ctx.stop.column + 1 + stopColumnOffset, msg));
	}
	getOffsetsFromProcessedSubtemplates(subtemplateLevel){
		// this routine navigates through the output of processSubtemplates to find the locations in the editor of subtemplates
		// it tries to find the longest qualified level for which it can find the subtemplate named at the lowest level
		let lineOffset = 0;
		let columnOffset = 0;
		let processed = processedSubtemplates;
		let text = ''; // needed by setHoverPositions
		if (subtemplateLevel != ''){
			let levels = subtemplateLevel.split('.');
			while (levels.length > 0){
				for (let iLevel = 0; iLevel < levels.length; iLevel++){
					processed = processed.subtemplates == null ? null : processed.subtemplates[levels[iLevel]];
					if (processed != null){
						lineOffset += (processed.line - 1);
						columnOffset = processed.column;
						text = processed.text;
						if (iLevel == (levels.length - 1)){
							levels = []; // all done
						}
					} else {
						// this level was not found.  Eliminate the one level up and try again
						levels.splice(levels.length - 2, 1);
						if (levels.length != 0){
							lineOffset = 0;
							columnOffset = 0;
							processed = processedSubtemplates;
						}
						break;
					}
				}
			}
		}
		return {lineOffset: lineOffset, columnOffset: columnOffset, text: text};
	}
	encodeHTML (str) {
	  const replacements = {
		  ' ' : '&nbsp;',
		  '¢' : '&cent;',
		  '£' : '&pound;',
		  '¥' : '&yen;',
		  '€' : '&euro;', 
		  '©' : '&copy;',
		  '®' : '&reg;',
		  '<' : '&lt;', 
		  '>' : '&gt;',  
		  '"' : '&quot;', 
		  '&' : '&amp;',
		  '\'' : '&apos;'
	  };
	  return str.replace(/[\u00A0-\u9999<>\&''""]/gm, (c)=>replacements[c] ? replacements[c] : '&#' + c.charCodeAt(0) + ";");
	}
	encodeXML (str) {
	  const replacements = {
		  '<' : '&lt;', 
		  '>' : '&gt;',  
		  '"' : '&quot;', 
		  '&' : '&amp;',
		  '\'' : '&apos;'
	  };
	  return str.replace(/[<>=&']/gm, (c)=>replacements[c]);
    }
    logForDebug (level : number, text : string) {
        if (this.annotations.debugLevel < level){
            return;
        }
        this.debugLog.push(level + '\t' + text);
    }
    valueAsText (value){
		let valueText = value.toString();
		if (!this.isScalar(value)){
			if (value.constructor.name == 'TemplateData'){
				valueText = value.toJson();
			} else if (value && typeof value == 'object' && value.type == 'missing'){
				valueText = '(missing)';
			} else {
				valueText = this.valueAsString(value);
			}
		}
        return valueText;
    }
}

interface TextTemplateVisitor {
    (source: string, subString: string): boolean;
}

class Error {
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
    message: string;

    constructor(startLine: number, endLine: number, startCol: number, endCol: number, message: string) {
        this.startLine = startLine;
        this.endLine = endLine;
        this.startCol = startCol;
        this.endCol = endCol;
        this.message = message;
    }

}

class CollectorErrorListener extends error.ErrorListener {

    private errors : Error[] = []

    constructor(errors: Error[]) {
        super()
        this.errors = errors
    }

    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        var endColumn = column + 1;
        if (offendingSymbol._text !== null) {
            endColumn = column + offendingSymbol._text.length;
        }
        this.errors.push(new Error(line, line, column, endColumn, msg));
    }

}
class RelocatingCollectorErrorListener extends CollectorErrorListener {
	private _line : number
	private _column : number;
	constructor(errors: Error[], line : number, column : number){
		super(errors);
		this._line = line; // zero origined
		this._column = column;
	}
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
		super.syntaxError(recognizer, offendingSymbol, line + this._line, line == 1 ? (column + this._column) : column, msg, e);
    }
}

function createLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateLexer(chars);

    lexer.strictMode = false;
    return lexer;
}

function parseTemplate(input, listeners? : ConsoleErrorListener[]){
	const lexer = createLexer(input);
	if (listeners != null){
		lexer.removeErrorListeners();
		lexer.addErrorListener(listeners[0]);
	}
	const parser = createParserFromLexer(lexer);
	if (listeners != null){
		parser.removeErrorListeners();
		parser.addErrorListener(listeners[1]);
	}
	parser._errHandler = new TextTemplateErrorStrategy();
	let tree = parser.compilationUnit();
	if (/^[ \t]*\/\//.test(input) && tree.children[0].getText() == '\n'){
		// this is a HACK to remove the new line resulting from a comment at the beginning of a template
		// it would not be necessary if ANTLR had a BOF condition like the EOF
		tree.children.splice(0, 1); // remove the comment element
	}
	return tree;
}

// processSubtemplates uses the lexer to tokenize a template string in order to find and extract subtemplates from the subtemplate section
// It returns an object containing the input without the subtemplate section and a map of the subtemplate objects keyed by the name and 
// containing the text plus the line/column where the subtemplate was found
// The routine calls itself recursively to find subtemplates with the subtemplates
function processSubtemplates(input: string, lineOffset: number) : {} {
	if (!(input).includes('\nSubtemplates:')){
		return {input: input, subtemplates: {}}
	}
	let subtemplates = {};
	let newInput : string;
	let tokenArray = getTokensWithSymbols(input);
	let bFound = false;
	for (let iToken = 0; iToken < tokenArray.length; iToken++){
		let tokenObject =tokenArray[iToken];
		let tokenName = tokenObject.name;
		if (tokenName == 'SUBTEMPLATES'){
			let numberBlankLines = tokenObject.text.split('\nSubtemplates:')[0].split('\n').length; // computes the number of new lines before 'Subtemplates::';
			bFound = true;
			newInput = input.substr(0, tokenObject.start);
			let bExtractingSubtemplates = true;
			while (bExtractingSubtemplates){
				let parts = [];
				for (++iToken; parts.length < 5 && iToken < tokenArray.length; iToken++){
					if (tokenArray[iToken].name != 'COMMENT' && tokenArray[iToken].name != 'NL' && tokenArray[iToken].name != 'SPACES'){
						parts.push(tokenArray[iToken]);
					}
				}
				if (parts.length == 5 && parts[0].name == 'LBRACE' && parts[1].name == 'POUND'  && parts[2].name == 'IDENTIFIER' && parts[3].name == 'COLON' && parts[4].name == 'LBRACKET' && parts[2].text.length > 0){
					iToken = findMatching('LBRACKET',tokenArray, iToken - 1);
					for (; parts.length < 7 && iToken < tokenArray.length; iToken++){
						if (tokenArray[iToken].name == 'METHODNAME'){
							iToken = findMatching('LP', tokenArray, iToken);
						} else if (tokenArray[iToken].name != 'COMMENT' && tokenArray[iToken].name != 'NL' && tokenArray[iToken].name != 'SPACES'){
							parts.push(tokenArray[iToken]);
						}
					}
					if (parts.length > 6 && parts[5].name == 'RBRACKET' && parts[6].name == 'RBRACE'){
						let text = input.substring(parts[4].start, parts[6].start);
						let subSubtemplates = null; // subtemplates in the subtemplate
						if (text.includes('\nSubtemplates:')){
							let processed : any = processSubtemplates(input.substring(parts[4].start + 1, parts[5].start), parts[4].line + lineOffset - 1); // process the text between the brackets
							// reconstruct the text without the subtemplates
							text = '[' + processed.input + input.substring(parts[5].start, parts[6].start); 
							subSubtemplates = processed.subtemplates;
						}
						subtemplates['#' + parts[2].text] = {text: text, line: parts[0].line, column:parts[4].column, endLine: parts[6].line, endColumn: parts[6].column, subtemplates: subSubtemplates};
					} else {
						newInput += '\nERROR extracting subtemplate "' + parts[2].text + '"' + ' missing right bracket or brace';
						console.error('ERROR extracting subtemplate "' + parts[2].text + '"' + ' missing right bracket or brace');
					}
				} else {
					if (parts.length > 2 && parts[1].name == 'POUND' && parts[2].name == 'IDENTIFIER' && parts[2].text.length > 0){
						newInput += '\nERROR extracting subtemplate "' + parts[2].text + '"' + ' invalid subtemplate syntax';
						console.error('ERROR extracting subtemplate "' + parts[2].text + '"' + ' invalid subtemplate syntax');
					} else {
						newInput += '\nERROR extracting subtemplates';
						console.error('ERROR extracting subtemplates');
					}
				}
				while (iToken < tokenArray.length && (tokenArray[iToken].name == 'COMMENT' || tokenArray[iToken].name == 'NL' || tokenArray[iToken].name == 'SPACES')){
					iToken++;
				}
				if (iToken < tokenArray.length && tokenArray[iToken].name == 'LBRACE'){
					iToken--; // get ready to extract another subtemplate
				} else {
					bExtractingSubtemplates = false;
					if (iToken < tokenArray.length){
						newInput += '\nERROR extraneous input (' + tokenArray[iToken].name + ') at the end of the subtemplates';
						console.error('ERROR extraneous input (' + tokenArray[iToken].name + ') at the end of the subtemplates');
					}
				}
			}
		} else if (tokenName == 'LBRACE'){
			iToken = findMatching(tokenName, tokenArray, iToken);
		}
	}
	return {input: (bFound ? newInput : input), subtemplates: subtemplates};
}
function getTokensWithSymbols(input : string){
	const chars = new InputStream(input);
	const lexer = new TextTemplateLexer(chars);
	lexer.strictMode = false;
	const tokens = new CommonTokenStream(lexer);
	tokens.fill();
	let treeTokens : CommonToken[] = tokens.tokens;
	let symbolicNames : string[] = new TextTemplateParser(null).symbolicNames
	let tokenArray = [];
	if (input.length == 0){
		return input;
	}
	for (let e of treeTokens){
		if (e.type != -1) {
			tokenArray.push({name: symbolicNames[e.type], text: input.substring(e.start, e.stop + 1), start: e.start, stop: e.stop, column: e.column, line: e.line});
		}
	}
	return tokenArray;
}

function findMatching(tokenName : string, tokenArray, iTokenIn: number){
	let match : string;
	switch (tokenName){
		case 'LBRACE':
			match = 'RBRACE';
			break;
		case 'LBRACKET':
			match = 'RBRACKET';
			break;
		case 'LP':
			match = 'RP';
			break;
		case 'APOSTROPHE':
			match = 'APOSTROPHE';
			break;
		case 'QUOTE':
			match = 'QUOTE';
			break;
	}
	for (let iToken = iTokenIn + 1; iToken < tokenArray.length; iToken++){
		let tokenObject =tokenArray[iToken];
		let tokenName = tokenObject.name;
		if (tokenName == match){
			return iToken;
		}
		if (tokenName == 'LBRACE' || tokenName == 'LBRACKET' || tokenName == 'LP' || tokenName == 'APOSTROPHE' || tokenName == 'QUOTE'){
			iToken = findMatching(tokenName, tokenArray, iToken);
		}
	}
}

function getTokens(input: String) : Token[] {
    return createLexer(input).getAllTokens()
}

function createParser(input) {
    const lexer = createLexer(input);

    return createParserFromLexer(lexer);
}

function createParserFromLexer(lexer) {
    const tokens = new CommonTokenStream(lexer);
    return new TextTemplateParser(tokens);
}

function parseTree(input) {
    const parser = createParser(input);

    return parser.compilationUnit();
}

export function parseTreeStr(input) {
    const lexer = createLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ConsoleErrorListener());

    const parser = createParserFromLexer(lexer);
    parser.removeErrorListeners();
    parser.addErrorListener(new ConsoleErrorListener());

    const tree = parser.compilationUnit();

    return tree.toStringTree(parser.ruleNames);
}

class TextTemplateErrorStrategy extends DefaultErrorStrategy {

     reportUnwantedToken(recognizer: Parser) {
         return super.reportUnwantedToken(recognizer);
     }

    singleTokenDeletion(recognizer: Parser) {
        var nextTokenType = recognizer.getTokenStream().LA(2);
        if (recognizer.getTokenStream().LA(1) == TextTemplateParser.NL) {
            return null;
        }
        var expecting = this.getExpectedTokens(recognizer);
        if (expecting.contains(nextTokenType)) {
            this.reportUnwantedToken(recognizer);
            recognizer.consume(); // simply delete extra token
            // we want to return the token we're actually matching
            var matchedSymbol = recognizer.getCurrentToken();
            this.reportMatch(recognizer); // we know current token is correct
            return matchedSymbol;
        } else {
            return null;
        }
    }
    getExpectedTokens = function(recognizer) {
        return recognizer.getExpectedTokens();
    };

    reportMatch = function(recognizer) {
        this.endErrorCondition(recognizer);
    };

}

function getSubtemplatePositions(positions : any[], processed, lineOffset : number, level : string){
	if (processed.subtemplates != null){
		Object.keys(processed.subtemplates).forEach((key)=>{
			let subtemplate = processed.subtemplates[key];
		positions.push({name: level + key, line: subtemplate.line + lineOffset, column: subtemplate.column, endLine:subtemplate.endLine + lineOffset, endColumn: subtemplate.endColumn});
			getSubtemplatePositions(positions, subtemplate, lineOffset + subtemplate.line - 1, key + '.' + level);
		});
	}
}
let urls = {};

function tokensAsString(ctx){
	let treeTokens : CommonToken[] = ctx.parser.getTokenStream().getTokens(ctx.getSourceInterval().start,ctx.getSourceInterval().stop)
	let symbolicNames : string[] = ctx.parser.symbolicNames
	let parsed = '';
	try{
		for (let e of treeTokens){
			if (e.type != -1) {
				parsed += symbolicNames[e.type] + '(' + e.text + ') ';
			}
		}
	} catch(err) {
		console.error('Error in tokensAsString: ' + err);
		parsed = '*****ERROR*****';
	}
	return parsed.replace(/\n/g,'\\n').replace(/\t/g,'\\t');
}
export function interpret(input, callback, options?) : void { 
	let bWaiting = false;
	Object.keys(urls).forEach((key)=>{
		if (urls[key].loading && !urls[key].data){
			bWaiting = true;
		}
	});
	if (bWaiting){
		return;
	}
	input = input.replace(/\r/g, '').replace(/\t/g, '    '); // TODO: option for controlling tab to spaces number
	callback({type: 'status', status: 'parsing...'});
	let errors : Error[] = [];
	if (processedSubtemplates == null){  // non-null implies being called again
		processedSubtemplates = processSubtemplates(input, 0); 
		input = processedSubtemplates.input;
	}
	let tree = parsedTemplates[input];
	if (!tree){
		tree = parseTemplate(input, [new ConsoleErrorListener(), new CollectorErrorListener(errors)])
		parsedTemplates[input] = tree;
		parsedTokens[input] = tokensAsString(tree);
	}
	callback({type: 'status', status: 'interpolating...'});
	var visitor = new TextTemplateVisitor();
	visitor.hoverPositions = options  && options.computeHoverPositions ?  {} : null;
	if (options && options.data){
		try{
			visitor.context = new TemplateData(options.data, null);
		} catch(e){
			console.error("Invalid data");
		}
	}
	// clone to allow interpreter errors to be undone
	errors.forEach((error)=>{
		visitor.errors.push(error);
	});
    visitor.input = input;
    visitor.bLoadingInclude = false;
	visitor.bulletIndent = null; // start bulleting from 0,0
	// parse and cache subtemplates found by processSubtemplates and add the text to the visitor (a TextTemplateVisitor instance)
	Object.keys(processedSubtemplates.subtemplates).forEach((key)=>{
		let subtemplateObject = processedSubtemplates.subtemplates[key];
		visitor.parseSubtemplates(subtemplateObject, key, subtemplateObject.line - 1, subtemplateObject.column);
	});
	var result = visitor.visitCompilationUnit(tree);
	if (result != null && !Array.isArray(result) && typeof result == 'object'){
		result = [result];
	}
	if (Array.isArray(result)){
		result = visitor.compose(result, 1);
	}
	let urlsBeingLoaded = [];
	Object.keys(urls).forEach((key : string) =>{
		if (!key.startsWith('/') && (key.split('//').length != 2 || key.split('//')[1].indexOf('/') == -1)){
			delete urls[key] // clean up incomplete urls
		} else {
			if (!urls[key].data){
				urlsBeingLoaded.push(key);
				if (!urls[key].loading){
					let urlPrefix = (key.startsWith('/') && options && options['urlPrefix']) ? options['urlPrefix'] : '';
					urls[key].loading = true
					console.debug('loading ' + urlPrefix +  key);
					callback({
						type:'url'
						, path: urlPrefix + key
						, urls: urls
						, success: (data)=>{
							urls[key].data = data;
							try{
								interpret(input, callback, options);
							} catch (e) {
								callback({type: 'result', result: 'EXCEPTION ' + e.stack, errors: [], hoverPositions: this.hoverPositions, debugLog: visitor.debugLog});
							}
						}
					});
				}
			}
		}
	});
	if (urlsBeingLoaded.length > 0){
		callback({type: 'status', status: 'requesting ' + urlsBeingLoaded.join(',') + '...'});
	} else {
		callback({type: 'result', result: result, errors:visitor.errors, hoverPositions: visitor.hoverPositions, debugLog: visitor.debugLog});
		processedSubtemplates = null; // remove memory of the previous template
	}
}
