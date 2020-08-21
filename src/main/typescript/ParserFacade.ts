/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />

import {CommonTokenStream, InputStream, Token, error, Parser, CommonToken} from '../../../node_modules/antlr4/index.js'
import {DefaultErrorStrategy} from '../../../node_modules/antlr4/error/ErrorStrategy.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateColorizeLexer} from "../../main-generated/javascript/TextTemplateColorizeLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"
import {TextTemplateParserVisitor} from "../../main-generated/javascript/TextTemplateParserVisitor.js"
import moment = require('moment');

var parsedTemplates = {};
var parsedTokens = {};
var processedSubtemplates = null;


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
		} else {
			// search for the same level
			let matchingLevel : BulletIndent = currentBulletIndent.parent; // used to find a previous level
			while (matchingLevel != null){
				if ((level != null && matchingLevel.level == level) || indent == matchingLevel.indent){
					// found a matching level, so this one is a continuation
					this.level = matchingLevel.level;
					this.index = matchingLevel.index + 1;
					this.parent = matchingLevel.parent;
					break;
				} else {
					matchingLevel = matchingLevel.parent;
				}
			} 
			if (matchingLevel == null){
				// create a new level even if this indent is less than the previous
				this.level = level == null ? (currentBulletIndent.level + 1) : level;
				this.index = 0;
				this.parent = currentBulletIndent;
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
		return cloneBulletIndent;
	}
	getBullet(){
		let bullet;
		let bulletStyles = this.bulletStyles;
		if (bulletStyles == null || bulletStyles.length == 0){
			bullet = '(' + this.level + '.' + this.index + ')'; // TODO: bullet style
		} else {
			let bulletStyle = bulletStyles[this.level < bulletStyles.length ? this.level : bulletStyles.length - 1];
			let padding = '';
			if (/^ +/.test(bulletStyle)){
				padding = bulletStyle.replace(/^( +).*$/, '$1');
				bulletStyle = bulletStyle.substr(padding.length);
			}
			let prefix = '';
			let postfix = '';
			if (/^.*%[Ii1Aa].*$/.test(bulletStyle)){
				prefix = bulletStyle.replace(/^(.*)%[Ii1Aa].*$/,'$1');
				postfix = bulletStyle.replace(/^.*%[Ii1Aa](.*)$/,'$1');
				bulletStyle = bulletStyle.replace(/^.*%([Ii1Aa]).*$/,'$1');
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
			if (bulletStyle.length == 1){
				switch (bulletStyle){
					case 'I':
						bullet = this.numberToRoman(this.index + 1);
						break;
					
					case 'i':
						bullet = this.numberToRoman(this.index + 1).toLowerCase();
						break;
					
					case '1':
						bullet = (this.index + 1).toString();
						break;
					
					case 'A':
					case 'a':
						bullet = this.numberToAlphabet(this.index + 1);
						if (bulletStyle == 'a'){
							bullet = bullet.toLowerCase();
						}
						break;
				}
				if (padding.length > 0 && bullet.length < (padding.length + 1)){
					prefix = padding.substr(0, padding.length - bullet.length + 1) + prefix;
				}
				bullet = prefix + bullet + postfix;
			}
		}
		this.lastBullet = this.indent + bullet.replace('\0x01', '');
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
	numberToAlphabet (num : number) {
		// from Chris West
		let ret = '';
		let b = 26;
		for (let a = 1; (num -a) >= 0; b *= 26) {
			num -= a;
			ret = String.fromCharCode(((num % b) / a) + 65) + ret;
			a = b;
		}
		return ret;
	}
}

class TemplateData {
	private dictionary = {};
	private list: TemplateData[] = [];
	private parent : TemplateData;
	type: string;
	constructor(jsonData: string | {} | [], parent?: TemplateData) {
		let json: {};
		if (typeof jsonData == 'string') {
			json = JSON.parse(jsonData);
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
	getValue(key : string) : any {
		let keySplit = key.split('.');
		let value = this.dictionary[keySplit[0]];
		if (value == undefined && keySplit[0] == '^'){
			value = this.parent; 
			if (value == undefined){
				value = this; // allows ^.^... to get to the top
			}
		}
		if (keySplit.length == 1 || value === undefined){
			return value;
		}
		if (value instanceof TemplateData){
			return <TemplateData>value.getValue(keySplit.slice(1).join('.'));
		}
	}
	iterateList(fn: (TemplateData) => any) {
		this.list.forEach((item : TemplateData)=>{
			fn(item);
		});
	}
	count(){
		return this.list.length;
	}
	asList() : TemplateData {
		if (this.type == 'list'){
			// already a list, so just clone it
			return new TemplateData(this);
		}
		return new TemplateData([JSON.parse(this.toJson())]);
	}
	toJson(indentLevel? : number) : string {
		let result : string = '';
		let bComma = false;
		if (this.type == 'list'){
			result += '[\n';
			this.list.forEach((dict) =>{
				result += ((bComma ? ',' : this.indent(indentLevel + 1)) + dict.toJson(indentLevel + 1)); 
				bComma = true;
			});
			result += ('\n' + this.indent(indentLevel) + ']');
		} else {
			result += '{\n';
			Object.keys(this.dictionary).forEach((keyname) => {
				let value : any = this.dictionary[keyname];
				result += (this.indent(indentLevel + 1) + (bComma ? ',' : '') + '"' + keyname + '": ');
				if (value instanceof TemplateData){
					result += (<TemplateData>value).toJson(indentLevel + 1);
				} else if (value == null) {
					result += 'null';
				} else if (typeof value == 'string') {
					result += ('"' + value.replace(/\n/g,'\\n') + '"');
				} else {
					result += value.toString();
				}
				result += '\n';
				bComma = true;
			});
			result += (this.indent(indentLevel) + '}');
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
	bulletIndent : BulletIndent;
	recursionLevel = 0;
	annotations = {bulletStyles: null};
	
	visitText = function(ctx){
		if (ctx.children[0].constructor.name == 'ContinuationContext'){
			// replace all white space captured as a "continuation" (starts with `) with a single blank
			return ' ';
		}
		return ctx.getText();
	};
	visitIdentifier = function(ctx) {
		var key = ctx.getText();
		let value = undefined; 
		if (key.startsWith('@.')){
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
			this.syntaxError('Attempting to look up "' + key + '" without a data context', ctx.parentCtx);
		} else {
			value = this.context.getValue(key);
		}
		if (value === undefined){
			console.debug('Missing value for ' + key);
			return {type: 'missing', missingValue: this.annotations.missingValue, key: key};
		} else if (this.annotations.dateTest != null && this.annotations.dateTest.test(key)){
			value = {type: 'date', moment: moment(value), string: value, format: this.annotations['dateFormat']};
			if (!value.moment.isValid()){
				this.syntaxError('Invalid date', ctx);
			}
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
	visitTemplateContextToken = function(ctx) {
		if (ctx.children.length < 3){
			return null; // invalid
		}
		let oldContext : TemplateData = this.context;
		let bHasContext : boolean = ctx.children[1].getText() != ':'; // won't change context if format {:[template]}
		if (bHasContext && ctx.children[1].children){  // ctx.children[1].children protects against invalid spec
			let context : any;
			let oldErrors = [];
			// make a shallow copy so we can undo any errors while acquiring a context url
			this.errors.forEach((error)=>{
				oldErrors.push(error);
			});
			if (ctx.children[1].constructor.name == 'NamedSubtemplateContext'){
				context = ctx.children[1].accept(this);
			} else {
				context = ctx.children[1].children[0].accept(this);
			}
			context = this.compose(context, 0);
			if (Array.isArray(context) && context.length == 1){
				context = context[0]; // support templates as contexts
			}
			if (typeof context === 'string'){
				this.errors = oldErrors; // wipe out errors acquiring the url string
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
				if (ctx.children.length > 1 && ctx.children[1].children && ctx.children[1].children[0].constructor.name == 'MethodInvokedContext'){
					// there is a method invocation on a context that was created here.  We need to rerun the method(s)
					let invocations = ctx.children[1].children[0].children.slice(1);
					this.context = this.invokeMethods(null, invocations); // a null valueContext implies this.context
				}
				
			} else if (bHasContext) { // context may not be specified
				//if (context){
					this.context = context;
				//} else {
				//	this.context = new TemplateData({}); // provide an empty context for lookups
				//}
			}
		}
		if (!ctx.children[3] || !ctx.children[3].getText() || ctx.children[3].exception){
			// protect code against illegal bracketted expression while editing
			return null;
		}
		var result = [];
		result = ctx.children[bHasContext ?  3 : 2].accept(this);
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
						this.callMethod(method, this.annotations, args); // modify the current annotations so that old annotations are inherited
					}
				});
			}
			if (this.context && this.context.type == 'list'){
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
					value = this.callMethod(method, this.compose(value, 0), args);
				}
			}
		});
		return value;
	}
	visitQuoteLiteral = function(ctx) {
		let value = ctx.getText()
		return this.decodeQuote(value.substr(1, value.length - 2));
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
		return this.decodeQuote(value.substr(1, value.length - 2));
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
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		if (typeof result == 'string' && result.startsWith('ERROR:')){
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
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		if (ctx.children[2].children.length < 3){
			return null; // only true condition specified
		}
		return this.visitChildren(ctx.children[2].children[2]) // false
	};
	visitIdentifierCondition = function(ctx) {
		// testing to see if the identifier has a value
		let value = this.visitIdentifier(ctx.children[0]);
		if (!this.valueIsMissing(value)){
			return true;
		}
		return false;
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
	visitRelationalOperation = function(ctx) {
		let leftValue = ctx.children[0].accept(this);
		let rightValue = ctx.children[2].accept(this);
		let operator = ctx.children[1].getText();
		if (leftValue == null || rightValue == null){
			return false; // null always yields false
		}
		if (!isNaN(leftValue) && !isNaN(rightValue)){
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
				if (lastChildIndex != 1 && typeof childResult == 'object' && childResult != null && childResult.constructor.name == 'TemplateData'){
					this.syntaxError('Invalid data type', ctx.children[i]);
					childResult = 'ERROR: Invalid data type';
				}
				result.push(childResult);
			}
		}
		if (bHasSubtemplates){
			this.subtemplates = oldSubtemplates; // subtemplates are scoped, so remove the ones we found
		}
		if (result.length == 1){
			return result[0];
		}
		return result;
	};
	visitMethodableTemplateSpec = function(ctx) {
		let value : any;
		if (this.context && this.context.type == 'list'){
			let listObject = {list: [], type:'list'};
			this.context.iterateList((newContext : TemplateData)=>{
				let oldContext : TemplateData = this.context;
				this.context = newContext;
				listObject.list.push(this.visitChildren(ctx)[0]);
				this.context = oldContext;
			});
			return listObject;
		} else {
			value = this.visitChildren(ctx)[0];
		}
		return value;
	}
	visitNamedSubtemplate = function(ctx, name = null, bInclude = false){
		let subtemplateName : string = name != null ? name : ctx.getText();
		if (!this.subtemplates[subtemplateName]){
			let subtemplateUrl = '/subtemplate/' + subtemplateName.substr(1); // remove the #
			if (!urls[subtemplateUrl]){
				urls[subtemplateUrl] = {};
			}
			if (!urls[subtemplateUrl].data){
				return 'loading subtemplate "' + subtemplateName + '"';
			}
			let data = urls[subtemplateUrl].data;
			if (data.substr(0 ,1) != '['){
				let msg = 'Error loading subtemplate "' + subtemplateName + '": ' + data;
				console.error(msg);
				this.syntaxError(msg, ctx);
				return '';
			}
			// process info between brackets adding an extra nl so "included" subtemplates can start with "Subtemplates:"
			let processed : any = processSubtemplates((bInclude ? '\n' : '') + data.substr(1, data.lastIndexOf(']') - 1), 0);
			// replace the brackets around the extracted input when storing the subtemplate and add any methods on the template
			this.subtemplates[subtemplateName] = '[' + processed.input + ']' + data.substr(data.lastIndexOf(']') + 1); 
			Object.keys(processed.subtemplates).forEach((key)=>{
				let subtemplate = processed.subtemplates[key];
				this.parseSubtemplates(processed.subtemplates[key], key, subtemplate.line - 1, subtemplate.column);
			});
		}
		let parserInput = '{:' + this.subtemplates[subtemplateName] + '}';
		let tree = parsedTemplates[parserInput];
		if (!tree){
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
			this.subtemplates[localSubtemplateName.substring(subtemplateName.length + 1)] = this.subtemplates[localSubtemplateName];
		});
		this.input = parserInput;
		let result : any = this.visitCompilationUnit(tree);
		--this.recursionLevel;
		// restore (pop) old states
		this.subtemplates = oldSubtemplates;
		this.input = oldInput;
		if (typeof result == 'string'){
			result = [result]; // return in an array for consistency
		}
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
		let result = this.visitChildren(ctx);
		//if (Array.isArray(result) && result.length == 1){
			return result[0];
		//}
		//return result;
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
		return this.visitChildren(ctx)[0];
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
		return {type:'bullet', bullet: text.replace('{','\0x01{'), parts: []};
	};
	visitBeginningBullet = function(ctx) {
		return this.visitBullet(ctx);
	};
	callMethod = function(method : string, value : any, args: any){
		let argValues = [];
		if (args.constructor.name == 'ConditionContext'){
			// the argument is a boolean
			argValues[0] = args.accept(this);
		} else if (args.constructor.name == 'ArgumentsContext'){
			for (let i = 0; i < args.children.length; i++){
				if ((method == 'Group' || method == 'Order') && i == 0){
					// defer evaluation of the first parameter of a Group
					argValues.push(null); // placeholder
				} else {
					let arg = args.children[i].accept(this);
					if (arg !== undefined){ // remove result of commas
						if (arg.constructor.name == 'RegExp'){
							argValues.push(arg);
						} else {
							argValues.push(this.compose(arg, 0));
						}
					}
				}
			}
		}
		let parentCtx : any = args.parentCtx;
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
		} else if (this.valueIsMissing(value) && !(method == 'Count' || method == 'Where' || method == 'ToJson' || method == 'Matches' || method == 'IfMissing')){
			value = value; // null with most methods returns null
		} else if (typeof value != 'string' && !(value != null && typeof value == 'object' && value.type == 'date') && (method == 'ToUpper' || method == 'ToLower')){
			error = 'ERROR: invalid method, ' + method + ' for this data: ' + parentCtx.getText();
		} else if (args.children && (method == 'ToUpper' || method == 'ToLower')){
			error = 'ERROR: invalid argument for ' + method + ': ' + args.getText();
		} else if (!args.children && (method == 'GreaterThan' || method == 'LessThan')){
			error = 'ERROR: missing argument for ' + method + ': ' + args.getText();
		} else if (args.children && args.children.length > 1 && (method == 'GreaterThan' || method == 'LessThan')){
			error = 'ERROR: too many arguments for ' + method + ': ' + args.getText();
		} else if (args.children && args.children.length < 3 && method == 'Case'){
			error = 'ERROR: too few arguments for ' + method + ': ' + args.getText();
		} else {
			switch (method){
				case 'ToUpper':
					value = this.valueAsString(value).toUpperCase();
					break;

				case 'ToLower':
					value = this.valueAsString(value).toLowerCase();
					break;

				case 'GreaterThan':
				case 'LessThan':
					let arg = argValues[0];
					if (!isNaN(arg) && !isNaN(value)){
						arg = parseInt(arg);
						value = parseInt(value)
					} else {
						arg = arg.toString();
						value = value.toString();
					}
					value = method == 'GreaterThan' ? (value > arg) : (value < arg);
					break;

				case 'Case':
					for (let i = 0; i < argValues.length; i+=2){
						if ((!isNaN(argValues[i]) && !isNaN(value) && parseInt(argValues[i]) == parseInt(value)) || argValues[i].toString() == value.toString()){
							value = argValues[i + 1];
							break;
						} else if ((i + 3) == argValues.length){
							value = argValues[i + 2]; // default
							break;
						}
					}
					break;

				case 'Assert':
				case 'Matches':
					let originalValue = value;
					if (typeof value == 'string' && value.includes('\0x01{.}')){
						// special case for matching the output of bullet templates
						value = this.compose([value], 1); // compose with bulleting
					}
					let matches : any = false;
					if (argValues.length == 0 || this.valueIsMissing(value)){
						if (argValues.length == 0 && this.valueIsMissing(value)){
							matches = true; //TODO: is it appropriate to match nulls?
						}
					} else {
						let bFirst = true;
						argValues.forEach((arg)=>{
							if (method != 'Assert' || bFirst){ // Assert only matches the first argument
								if (arg.constructor.name == 'RegExp'){
									matches = matches || arg.test(value);
								} else if ((!isNaN(arg) && !isNaN(value) && parseInt(arg) == parseInt(value)) || arg.toString() == value.toString()){
									matches = true;
								} else if (typeof arg == 'string' && arg.includes('\0x01{.}') && value == this.compose([arg], 1)){
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

				case 'Anded':
					if (typeof value == 'object' && value != null && value.type == 'argument'){
						let list = value.list;
						for (let i : number = 0; i < list.length - 1; i++){
							if (i == (list.length - 2)){
								list[i] += ' and ';
							} else {
								list[i] += ', ';
							}
						}
						value = list.join('');
					}
					break;
					
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
									if (args.children[0].accept(this)[0]){
										// the condition returned true; add a clone of the iteration 
										Object.keys(dollarVariables).forEach((key)=>{
											delete newContext.dictionary[key];  // remove the added $ variables
										});
										result.push(new TemplateData(this.context)); 
									}
									this.context = oldContext;
								});
							} else if (args.accept(this)){
								result.push(this.context); // no filtering (or cloning) necessary 
							}
							this.context = oldContext; // restore old context
							switch (result.length){
								case 0:
									value = undefined; // indication of missing value
									break;
								case 1:
									value = result[0]; // single value is a dictionary
									break;
								default:
									value = new TemplateData(result, this.context); // multivalues is a list
									break;
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

				case 'Order':
				case 'Group':
					if (method == 'Order'){
						if (argValues.length == 1){
							argValues.push('A');
						} else if (argValues.length == 2){
							argValues[1] = argValues[1].toUpperCase().replace('ASC', 'A').replace('DESC','D');
						}
					}
					let oldContext : TemplateData = this.context;
					let groups = {};
					if (!(<any>value instanceof TemplateData)){
						this.syntaxError('Invalid data type for ' + method, args.parentCtx);
					} else if ((method == 'Group' && argValues.length != 3) || (method == 'Order' && (argValues.length != 2 || !(argValues[1] == 'A' || argValues[1] == 'D')))){
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
						this.context.asList().iterateList((newContext)=>{
							this.context = newContext;
							Object.keys(dollarVariables).forEach((key)=>{
								newContext.dictionary[key] = dollarVariables[key]; // pass on the $ variables in case they are needed for a calculaton
							});
							let groupKey = args.children[0].accept(this)[0];
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
						if (method == 'Order' && argValues[1] == 'D'){
							keys.reverse();
						}
						keys.forEach((key)=>{
							let group = groups[key];
							if (method == 'Order'){
								if (Array.isArray(group)){
									group.forEach((member)=>{
										
										result.push(member); // if there is more than one, they are key duplicates
									});
								} else {
									result.push(group);
								}
							} else {
								let data =  {};
								data[argValues[1]] = key;
								data[argValues[2]] = group;
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
					if (value instanceof TemplateData){
						value = value.toJson(0);
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
							value = date.format(argValues[0]);
						}
					}
					break;		

				case '@Include':
					let templateName = argValues[0];
					this.visitNamedSubtemplate(args, templateName, true); // run the named subtemplate, preserving the loaded subtemplates
					break;
					
				case '@MissingValue':
					value['missingValue'] = argValues[0];
					break;
					
				case '@DateFormat':
					value['dateFormat'] = argValues[0];
					break;

				case '@DateTest':
					if (argValues.length == 0){
						// remove the date test
						delete value['dateTest'];
					} else if (argValues.length != 1 || argValues[0].constructor.name != 'RegExp'){
						this.syntaxError('@DateTest takes a single regular expression', args.parentCtx)
					} else {
						value['dateTest'] = argValues[0];
					}
					break;
					
				case '@BulletStyle':
					for (let i = 0; i < argValues.length; i++){
						if (typeof argValues[i] == 'object'){
							this.syntaxError('ERROR: invalid argument for bullet style', args.parentCtx);
							argValues = null;
							break;
						}
					}
					value['bulletStyles'] = argValues;
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
	// It the issue is ultimately addressed, this code can be simplified by removing calls to parseSubtemplates and letting visitSubtemplates extract the subtemplates
	//
	// parseSubtemplates receives a subtemplate object provided by processSubtemplates plus the key, if the subtemplate is global, and the line/column where the is specified in the editor
	// If the key is supplied, it saves the template text in the global subtemplates map.
	// The routine parses template text, placing the resulting parse tree in the global map of parsed templates.
	// Note that the parsedTemplates map is keyed by the text, not the template names, which can be scoped
	// After parsing the subtemplate text, the routine calls itself recursively to parse any subtemplates within 
	parseSubtemplates = function(subtemplate, key, line, column){
		let input = subtemplate.text;
		// if key is null, the subtemplate was found in the editor within a subtemplate
		this.subtemplates[key] = input; // global dictionary of loaded subtemplate
		//RelocatingCollectorErrorListener relocates based on where the subtemplate is positioned in the editor
		let tree = parseTemplate(input, [new ConsoleErrorListener(), new RelocatingCollectorErrorListener(this.errors, line, column)])
		parsedTemplates[input] = tree;
		if (subtemplate.subtemplates != null){
			Object.keys(subtemplate.subtemplates).forEach((subtemplateKey)=>{
				this.parseSubtemplates(subtemplate.subtemplates[subtemplateKey], key + '.' + subtemplateKey, subtemplate.line - 1 + line, column, this);
			});
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
		if (typeof parts == 'object' && parts != null && !Array.isArray(parts)){
			if (parts instanceof TemplateData || parts.type == 'argument' || parts.type == 'missing' || parts.type == 'date'){
				return parts; // don't compose if not appropriate
			}
			parts = [parts];  // do compose expects arrays
		}
		if (!Array.isArray(parts)){
			return parts;
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
						for (iParts++; iParts < parts.length; iParts++){
							item.parts.push(parts[iParts]); // repackage the remaining parts under the indent object 
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
				let bulletInTheOutput = lines[lines.length - 1].replace(/^([ \t]*(\0x01\{\.\})?).*/s,'$1'); 
				// determine if the current bulleted indent is being overridden by a plain indent
				let bReplaceIndent = !!indent && indent.includes('\0x01{.}') && !bulletInTheOutput.includes('\0x01{.}') && bulletInTheOutput.length > 0;
				this.doCompose(item, output, bReplaceIndent ? bulletInTheOutput : indent);
			} else if (typeof item == 'object' && item != null){
				if (item.type == 'bullet'){
					this.addToOutput(item.bullet, output);
					if (item.parts == null) {
					} else if (typeof item.parts == 'string' || typeof item.parts == 'number'){
						this.addToOutput(item.parts.toString(), output);
					} else if (typeof item.parts == 'object' && item.parts != null && item.constructor.name != ''){
						if (Array.isArray(item.parts) || item.parts.type == 'bullet' || item.parts.type == 'missing'){
							this.doCompose([item.parts], output, item.bullet);
						} else {
							// list
							for (let i = 0; i < item.parts.list.length(); i ++){
								this.doCompose(this.parts.list[i], output, item.bullet);
								if (i < this.parts.list.length - 1){
									this.addToOutput('\n', output);
								}
							}
						}	
					} else {
						let x = 'stop';
					}
				} else {
					// list
					if (!!indent && indent.includes('\0x01{.}')){
						// This is an unbulleted list under a bullet, so we need to turn each list item into an indent object with an indented bullet
						let bIncompleteBullet = /^[ \t]*\0x01\{\.\}[ \t]*$/.test(lines[lines.length - 1]);
						let newBullet = indent.replace(/([ \t]*\0x01\{\.\})/,'   ' + '$1'); // TODO: allow override of default tab
						for (let i = 0; i < item.list.length; i++){
							let itemResult = item.list[i];
							let indentObject = itemResult;
							// let the next level handle an array of items that aren't lists or indents
							if (!this.containsBullet(indentObject)){
								indentObject = {type:'bullet', parts: itemResult, bullet: bIncompleteBullet ? indent : newBullet, styles: this.annotations.bulletStyles};
							}
							if (i == 0){
								let doComposeParm = [indentObject];
								if (bIncompleteBullet){
									doComposeParm = Array.isArray(itemResult) ? itemResult : [itemResult];
								}
								this.doCompose(doComposeParm, output, indent);
							} else {
								if (!indent.includes('\n')){
									this.addToOutput('\n', output);
								}
								this.doCompose([indentObject], output, indent);
							}
						}
					} else {
						// create a list and indent it under the current line, if it isn't empty
						let bEmptyLine = lines[lines.length - 1] == '';
						let bStartsWithNewLine = /^[ \t]*\n/.test(this.valueAsString(item.list[0]))	;
						let lastIndent = lines[lines.length - 1].replace(/^([ \t]*).*$/, '$1');
						let newIndent = (indent == null ?  '   ' + lastIndent : '   ' + indent);  // TODO: allow override of default tab
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
							let bWillBeIndented = this.isBullet(listItem) || this.containsBullet(listItem);
							if (bWillBeIndented){
								newIndent = indent;
							}
							if (!bStartsWithNewLine && !(bIncompleteIndent && bFirst) && (!bEmptyLine || !bFirst)){
								this.addToOutput('\n', output); // start a new line
								if (!!newIndent && newIndent != '' && !bWillBeIndented){
									this.addToOutput(newIndent, output);
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
	}
	valueIsMissing(value){
		if (value == null || (typeof value == 'object' && value.type == 'missing')){
			return true;
		}
		return false;
	}
	isBullet(item : any){
		if (typeof item != 'object' || item == null || item.type != 'bullet'){
			return false;
		}
		return true;
	}
	containsBullet(value : any){
		if (typeof value == 'object' && value != null && value.type == 'list'){
			value = value.list;
		}
		if (Array.isArray(value)){
			let bContainsBullet = false;
			for (let i = 0; i < value.length; i++){
				let val = value[i];
				if (this.isBullet(val)){
					bContainsBullet = true;
					break;
				}
				if (typeof val != 'string' || !/^[ \t]*$/s.test(val)){
					// indent can only follow blanks
					break;
				}
			}
			return bContainsBullet;
		} else {
			return this.isBullet(value);
		}
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
					if (/^[ \t]*\0x01\{\.\}/.test(text)){
						// there is a bullet in the text
						let indent = text.replace(/^([ \t]*).*$/, '$1');
						output.bulletIndent = this.bulletIndent == null ? null : this.bulletIndent.clone();
						let bulletObject = output.bullets[text.replace(/^([ \t]*\0x01\{\.\}).*$/, '$1')];
						if (bulletObject == null){
							lines.push('ERROR computing bullet'); // should never happen TODO: raise exception?
						} else {
							this.bulletIndent = new BulletIndent(indent, this.bulletIndent, bulletObject.level, this.annotations.bulletStyles);
						}
						text = text.replace(/[ \t]*\0x01\{\.\}/, indent + (this.bulletIndent != null ? this.bulletIndent.getBullet() : ''));
					} else if (this.bulletIndent != null) {
						// there is a non-bulleted line in the output; see if it should reset bulleting levels because it is less indented then the bullet(s)
						let nextLineIndent = text.replace(/^([ \t]*).*$/,'$1'); // TODO: Should this be an option?
						while (this.bulletIndent != null && this.bulletIndent.indent.length >= nextLineIndent.length){
							this.bulletIndent = this.bulletIndent.parent;
						}
					}
				} else if (/^[ \t]*\0x01\{\.\}/.test(text)){
					// during mode 0, capture the unique bullets
					let bullet = text.replace(/^([ \t]*\0x01\{\.\}).*$/, '$1');
					output.bullets[bullet] = {bullet: bullet, length: bullet.length};
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
	decodeQuote(value){
		// using the JSON parser to unescape the string
		let tempJson = JSON.parse('{"data":"' + value + '"}');
		return tempJson.data;
	}
	syntaxError(msg, ctx){
		console.error(msg);
		this.errors.push(new Error(ctx.start.line, ctx.stop.line, ctx.start.column + 1, ctx.stop.column, msg));
	}
}

interface TextTemplateVisitor {
    (source: string, subString: string): boolean;
}

export class Error {
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
declare global {
  interface Window {
    ParserFacade: any;
  }
}

export function createColorizeLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateColorizeLexer(chars);

    lexer.strictMode = false;
	window.ParserFacade = this;
    return lexer;
}

export function createLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateLexer(chars);

    lexer.strictMode = false;
    return lexer;
}

export function parseTemplate(input, listeners? : ConsoleErrorListener[]){
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
export function processSubtemplates(input: string, lineOffset: number) : {} {
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
			folds.push({
				start: tokenObject.line + numberBlankLines + lineOffset,
				end: tokenArray[tokenArray.length - 1].line + lineOffset,
				kind: monaco.languages.FoldingRangeKind.Region
			});
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
						if (parts[0].line != parts[6].line){
							// fold any multi-line subtemplates
							folds.push({
								start: parts[0].line + lineOffset,
								end: parts[6].line + lineOffset,
								kind: monaco.languages.FoldingRangeKind.Region
							});
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
export function getTokensWithSymbols(input : string){
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

export function getTokens(input: String) : Token[] {
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
export function provideFoldingRanges(model, context, token) {
	folds = [];
	processedSubtemplates = processSubtemplates(model.getValue(), 0); // collect folds
	return folds;
}

export function provideDefinition(model, position, token){
	let currentLine : string = model.getLinesContent()[position.lineNumber - 1];
	let tokenArray = getTokensWithSymbols(model.getValue());
	let column = position.column - 1;  // position uses 1 origin and tokens use 0 origin
	let definitionName = '';
	for (let iToken = 0; iToken < tokenArray.length; iToken++){
		if (tokenArray[iToken].line == position.lineNumber && column >= tokenArray[iToken].column && (((iToken + 1) == tokenArray.length) || tokenArray[iToken + 1].line > position.lineNumber || column < tokenArray[iToken + 1].column)){
			if (tokenArray[iToken].name == 'IDENTIFIER' && iToken > 0 && tokenArray[iToken - 1].name == 'POUND'){
				definitionName = '#' + tokenArray[iToken].text;
			} else if (tokenArray[iToken].name == 'POUND' && (iToken + 1) < tokenArray.length && tokenArray[iToken].name == 'IDENTIFIER'){
				definitionName = '#' + tokenArray[iToken + 1].text;
			} else if (tokenArray[iToken].name == 'METHODNAME' && tokenArray[iToken].text.startsWith('.#')){
				definitionName = tokenArray[iToken].text.substr(1, tokenArray[iToken].text.length - 2);
			}
			break;
		}
	}
	if (definitionName == ''){
		return; // not pointing to an identifier
	}
	let subtemplatePositions : any[] = [];
	getSubtemplatePositions(subtemplatePositions, processedSubtemplates, 0, '');
	subtemplatePositions.sort((a, b) => (a.line > b.line) ? 1 : -1);
	let subtemplateMap = {};
	let level = '';
	for (let i = 0; i < subtemplatePositions.length; i++){
		let subtemplate = subtemplatePositions[i];
		subtemplateMap[subtemplate.name] = subtemplate;
		if (position.lineNumber >= subtemplate.line && ((i + 1) == subtemplatePositions.length || position.lineNumber < subtemplatePositions[i + 1].line)){
			level = subtemplate.name + '.';
		}
	}
	let definition = null;
	let keyArray = (level + definitionName).split('.');
	for (let i = 0; definition == null && i < keyArray.length; i++){
		definition = subtemplateMap[keyArray.slice(i).join('.')];
	}
	if (definition == null){
		return;
	}
	return {
        range: new monaco.Range(definition.line, definition.column + 1, definition.endLine, definition.endColumn + 1),
        uri: model.uri
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
let folds = [];
let urls = {};
let invocations = 0;

export function runValidation(input ,mode) : void {
	let invocation = ++invocations;
	setTimeout(()=>{
		if (invocation == invocations){
			validate(input, invocation, mode);
		}
	}, mode != 1 || invocation == 1 ? 0 : 2000); // if delay (other than the first time), wait 2 seconds after last keystroke to allow typing in the editor to continue
}
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
function validate(input, invocation, mode) : void { // mode 0 = immediate, 1 = delay (autorun when data changes), 2 = skip
	setTimeout(()=>{
		if (invocation != invocations){
			return;
		}
		input = mode == 2 || input.length == 0 ? ' ' : input; // parser needs at least one character
		let errors : Error[] = [];
		if (mode != 2){
			document.getElementById('interpolated').innerHTML = 'parsing...';
			console.log('parsing...');
		}
		setTimeout(()=>{
			if (invocation != invocations){
				return;
			}
			if (processedSubtemplates == null){
				processedSubtemplates = processSubtemplates(input, 0); 
			}
			input = processedSubtemplates.input;
			let tree = parsedTemplates[input];
			if (!tree){
				tree = parseTemplate(input, [new ConsoleErrorListener(), new CollectorErrorListener(errors)])
				parsedTemplates[input] = tree;
				parsedTokens[input] = tokensAsString(tree);
			}
			/* used to get json representation of tree for debugging
			const getCircularReplacer = () => {
			  const seen = new WeakSet();
			  return (key, value) => {
				if (typeof value === 'object' && value !== null) {
				  if (seen.has(value)) {
					return;
				  }
				  seen.add(value);
				}
				return value;
			  };
			};
			let treeJson : string = JSON.stringify(tree, getCircularReplacer()); */
			if (mode != 2){
				document.getElementById('interpolated').innerHTML = "interpolating...";
				console.log('interpolating...');
			}
			setTimeout(()=>{
				if (invocation != invocations){
					return;
				}
				var visitor = new TextTemplateVisitor();
				// clone to allow interpreter errors to be undone
				errors.forEach((error)=>{
					visitor.errors.push(error);
				});
				visitor.input = input;
				visitor.bulletIndent = null; // start bulleting from 0,0
				// add subtemplates found by processSubtemplates to visitor
				Object.keys(processedSubtemplates.subtemplates).forEach((key)=>{
					let subtemplate = processedSubtemplates.subtemplates[key];
					visitor.parseSubtemplates(processedSubtemplates.subtemplates[key], key, subtemplate.line - 1, subtemplate.column);
				});
				var result = visitor.visitCompilationUnit(tree);
				if (invocation != invocations){
					return;
				}
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
								urls[key].loading = true
								console.debug('loading ' + key);
								$.ajax({
									url: key,
									success: function (data) {
										if (data.error){
											urls[key].data = data.error
											urls[key].error = true;
											console.error(data.error);
										} else {
											if (typeof data != 'string'){
												data = JSON.stringify(data);
											}
											urls[key].data = data;
										}
										let invocation = ++invocations;
										setTimeout(()=>{
											if (invocation == invocations){
												validate(monaco.editor.getModels()[0].getValue(), invocation, 0);
											}
										}, 0);
									}
								});
							}
						}
					}
				});
				if (urlsBeingLoaded.length > 0){
					let loadingMessage = 'loading ' +  (urlsBeingLoaded.length == 1 ? urlsBeingLoaded[0] + '...' : (':\n  ' + (urlsBeingLoaded.join('\n  '))));
					document.getElementById('interpolated').innerHTML = loadingMessage;
					console.log(loadingMessage);
				} else if (mode != 2){
					console.log('done')
					document.getElementById('interpolated').innerHTML = (result == null ? 'null' : result.toString());
				}
				let monacoErrors = [];
				for (let e of visitor.errors) {
					monacoErrors.push({
						startLineNumber: e.startLine,
						startColumn: e.startCol,
						endLineNumber: e.endLine,
						endColumn: e.endCol,
						message: e.message,
						severity: monaco.MarkerSeverity.Error
					});
				};
				monaco.editor.setModelMarkers(monaco.editor.getModels()[0], "owner", monacoErrors);
			}, 1);
		}, 1);
	}, 1);
}
