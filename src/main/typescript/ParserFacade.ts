/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />

import {CommonTokenStream, InputStream, Token, error, Parser, CommonToken} from '../../../node_modules/antlr4/index.js'
import {DefaultErrorStrategy} from '../../../node_modules/antlr4/error/ErrorStrategy.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"
import {TextTemplateParserVisitor} from "../../main-generated/javascript/TextTemplateParserVisitor.js"

class ConsoleErrorListener extends error.ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.log('ERROR ' + msg);
    }
}
class Indent {
	public parentIndent : Indent;
	public bNewline : boolean; // indent followed new line
	public indentText : string;
	public length : number;
	public beforeBullet : string;
	public afterBullet : string;
	public bulletWidth : number;
	public level : number;
	public index : number;
	public bullet;
	public error : string; 
	constructor(indentText : string, current : Indent){
		this.bNewline = indentText.startsWith('\n');
		this.indentText = indentText.replace('\n', '');
		this.length = this.indentText.length;
		let splitIndent = this.indentText.split('{.}');
		this.beforeBullet = splitIndent[0];
		this.afterBullet = splitIndent.length == 2 ? splitIndent[1] : '';
		this.bullet = 'o ';
		if (current){
			if (this.indentText.length == current.indentText.length){ // TODO: handle case where the length is the same, but not the text
				// another line at the same level
				this.index = current.index + 1;
				this.parentIndent = current.parentIndent; // replacing current
				this.level = current.level;
				// TODO: compute the bullet
			} else if (this.indentText.length > current.indentText.length){
				// indenting from the current line
				this.index = 0;
				this.parentIndent = current;
				this.level = current.level + 1;
			} else {
				let parentIndent = current.parentIndent;
				while (parentIndent !== null){
					// find the matching level
					if (parentIndent.indentText.length != this.indentText.length){
						parentIndent = parentIndent.parentIndent;
					} else {
						break; // found it
					}
				}
				if (!parentIndent){
					this.error = 'ERROR: improper indenting because indent levels don\'t match';
					this.beforeBullet = 'ERROR';
					this.level = current.level;
					this.parentIndent = current.parentIndent;
					this.index = current.index + 1;
				} else {
					this.index = parentIndent.index + 1;
					this.parentIndent = parentIndent.parentIndent;
					this.level = parentIndent.level;
				}
			}	
		} else {
			this.index = 0;
			this.level = 0;
			this.parentIndent = null;
		}
		this.bullet = '(' + this.level + '-' + this.index + ')';
	}
}

class TemplateData {
	private dictionary = {};
	private list: TemplateData[] = [];
	type: string;
	constructor(jsonData: string | {} | []) {
		let json: {};
		if (typeof jsonData == 'string') {
			json = JSON.parse(jsonData);
		} else if (Array.isArray(jsonData)) {
			this.type = 'list';
			let array: [] = jsonData;
			array.forEach((item) => {
				this.list.push(new TemplateData(item));
			});
			return;
		} else if (jsonData instanceof TemplateData){ // filter or clone
			if ((<TemplateData>jsonData).type == 'list'){
				this.type = 'list';
				(<TemplateData>jsonData).list.forEach((item)=>{
					this.list.push(new TemplateData(item));
				});
				return;
			} else {
				json = JSON.parse((<TemplateData>jsonData).toJson()); // clone by converting to Json and back
			}
		} else {
			json = jsonData;
		}
		this.type = 'dictionary';
		if (Array.isArray(json)){
			// the json string is an array.  Convert it into a dictionary with the arbitrary key "data"
			json = {data: json};
		}
		Object.keys(json).forEach((keyname) => {
			let value: any = json[keyname];
			if (typeof value == 'object') {
				if (value != null && (!Array.isArray(value) || value.length > 0)){ // don't add null values or empty arrays
					this.dictionary[keyname] = new TemplateData(value);
					this.dictionary[keyname].dictionary['^'] = this; // allows ^.^.variable name TODO: should only do this for a dictionary
				}
			} else {
				this.dictionary[keyname] = value;
            }
		});
	}
	getValue(key : string) : any {
		let keySplit = key.split('.');
		let value = this.dictionary[keySplit[0]];
		if (value == undefined && keySplit[0] == '^'){
			return this; // allows ^.^... to get to the top
		}
		if (keySplit.length == 1 || value === undefined){
			return value;
		}
		if (value instanceof TemplateData){
			return <TemplateData>value.getValue(keySplit.slice(1).join('.'));
		}
	}
	iterateList(fn: () => any) {
		this.type = 'dictionary'; // temporarily change to each iterated dictionary
		this.list.forEach((item : TemplateData)=>{
			this.dictionary = item.dictionary;
			fn();
		});
		this.type = 'list';
		this.dictionary = {};
	}
	count(){
		return this.list.length;
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
				if (keyname != '^'){
					let value : any = this.dictionary[keyname];
					result += (this.indent(indentLevel + 1) + (bComma ? ',' : '') + '"' + keyname + '": ');
					if (value instanceof TemplateData){
						result += (<TemplateData>value).toJson(indentLevel + 1);
					} else if (typeof value == 'string') {
						result += ('"' + value.replace(/\n/g,'\\n') + '"');
					} else {
						result += value.toString();
					}
					result += '\n';
					bComma = true;
				}
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
	subtemplates : any = {};
	errors = [];
	recursionLevel = 0;
	indent : Indent = null;
	annotations = {};
	visitText = function(ctx){
		return ctx.getText();
	};
	visitMethodableIdentifer = function(ctx) {
		var key = ctx.getText();
		if (!this.context || !(this.context instanceof TemplateData)){
			return undefined; // attempt to look up a variable without a context returns undefined
		}
		if (key.startsWith('@.')){
			return this.annotations[key.substr(2)];
		}
		let value = this.context.getValue(key);
		if (value === undefined && this.annotations.MissingValue !== undefined){
			return this.annotations.MissingValue;
		}
		return this.context.getValue(key);
	};
	visitTemplatetoken = function(ctx) {
		// there are three children, the left brace, the token, and the right brace
		let result : any = ctx.children[1].accept(this);
		if (Array.isArray(result)){
			return result[0];
		}
		return result;
	};
	visitTemplatecontents = function(ctx) {
		var value = this.visitChildren(ctx);
		if (value){
			for (let i = 0; i < value.length; i++){
				if (Array.isArray(value[i])){ 
					value[i] = value[i].join(''); // TODO: does this break anything?
				}
			}
		}		
		/*
		if (Array.isArray(value) && Array.isArray(value[0]) && value[0].length > 1){
			let newValue : string[] = [];
			value[0].forEach((val)=>{
				if (typeof val == 'string'){
					val.split('\n').forEach((subval)=>{
						newValue.push(subval);
					});
				}
			});
			
			value[0] = newValue.join('\n    ') + '\n';
		}
		*/
		if (!ctx.children || ctx.children[0].constructor.name == 'SubtemplateSectionContext'){
			return ''; //prevent displaying the Subtemplate section and avoid error for invalid brace 
		}
		if (Array.isArray(value) && value.length == 1){
			return value[0];
		}
		return value != null ? value.join('') :  '';
	};
	visitTemplatecontexttoken = function(ctx) {
		if (ctx.children.length < 3){
			return null; // invalid
		}
		let oldContext : TemplateData = this.context;
		let bHasContext : boolean = ctx.children[1].getText() != ':'; // won't change context if format {:[template]}
		if (bHasContext && ctx.children[1].children){  // ctx.children[1].children protects against invalid spec
			let context : any = ctx.children[1].children[0].accept(this);
			if (Array.isArray(context) && context.length == 1){
				context = context[0]; // support templates as contexts
			}
			if (typeof context === 'string'){
				try{
					if (context.toLowerCase().startsWith('http') || context.startsWith('/')){
						if (urls[context] && urls[context].data){
							if (urls[context].data.startsWith('[')){
								// text templates requires that the top level be a dictionary
								// create a container for the array under 'data'
								this.context = new TemplateData('{"data":' + urls[context].data + '}');
							} else {
								this.context = new TemplateData(urls[context].data);
							}
						} else {
							bHasContext = false;
							if (!urls[context]){
								urls[context] = {};
							}
						}
					} else {
						this.context = new TemplateData(context);
					}
				} catch(e){
					this.context = oldContext;
					return 'Error loading context: ' + e.message;
				}
			} else if (bHasContext) { // context may not be specified
				if (context){
					this.context = context;
				} else {
					this.context = new TemplateData({}); // provide an empty context for lookups
				}
			}
		}
		if (!ctx.children[3] || !ctx.children[3].getText() || ctx.children[3].exception){
			// protect code against illegal bracketted expression while editing
			return null;
		}
		var result = [];
		result = ctx.children[bHasContext ?  3 : 2].accept(this);
		if (oldContext) {
			// protect agaist error when the parse tree is invalid
			this.context = oldContext;
		}
		return result;
	};
	visitCompilationUnit = function(ctx) {
		if (!ctx.children){
			return ''; // no data
		}
		if (ctx.children.length > 2){
			// the next to the last node may be the subtemplates, so visit it to get the subtemplate dictionary
			this.visitChildren(ctx.children[ctx.children.length - 2])
		}
		let result : [] = this.visitChildren(ctx);
		let spliced = result.splice(0, result.length - 1); // remove the result of the <EOF> token
		if (spliced.length == 1){
			return spliced[0];
		}
		return spliced.join(''); 
	};
	visitMethod = function(ctx) {
		let methodName : string = ctx.getText();
		return methodName.substr(1, methodName.length - 2);  // drop parens
	};
	visitMethodInvoked = function(ctx) {
		let bMethodableIsTemplate = ctx.getText().startsWith('[') || ctx.getText().startsWith('#');
		let oldAnnotations = {};
		// clone by shallow copy
		for (let key in this.annotations){
			oldAnnotations[key] = this.annotations[key];
		}
		ctx.children.slice(1).forEach((child) => {
			let method : string = child.children[0].accept(this);
			if (method.startsWith('@') && bMethodableIsTemplate){
				let args : any = child.children[1];
				this.callMethod(method, this.annotations, args);
			} else if ((method == 'Exists' || method == 'IfMissing' || method.startsWith('#')) && this.annotations.MissingValue){
				delete this.annotations.MissingValue; // prevent missing value mechanism from replacing nulls
			}
		});
		let value : any = undefined;
		if (this.context && this.context.type == 'list'){
			// create an arry of results and then run the method on the array
			value = [];
			this.context.iterateList(()=>{
				value.push(ctx.children[0].accept(this));
			});
		} else {
			value = ctx.children[0].accept(this);
		}
		// call each method, which follow the identifier value
		ctx.children.slice(1).forEach((child) => {
			let method : string = child.children[0].accept(this);
			if (!method.startsWith('@')){
				let args : any = child.children[1];
				if (Array.isArray(value) && (method == 'ToUpper' || method == 'ToLower' || method == 'Matches')){
					let computedValue : string[] = [];
					value.forEach((val) =>{
						computedValue.push(this.callMethod(method, val, args));
					});
					value = computedValue;
				} else {
					value = this.callMethod(method, value, args);
				}
			}
		});
		this.annotations = oldAnnotations; // restore the annotations
		return value;
	};
	visitQuoteLiteral = function(ctx) {
		//return ctx.children[1].getText().replace(/\\n/g,"\n").replace(/\\"/g,'"').replace(/\\\\/g,"\\").replace(/\\b/g,"\b").replace(/\\f/g,"\f").replace(/\\r/g,"\r").replace(/\\t/g,"\t").replace(/\\\//g,"\/"); // handle backslash plus "\/bfnrt
		// using the JSON parser to unescape the string
		var tempJson = JSON.parse('{"data":"' + ctx.children[1].getText() + '"}');
		return tempJson.data;
	};
	visitApostropheLiteral = function(ctx) {
		return ctx.children[1].getText().replace(/\\n/g,'\n').replace(/\\'/g,"'").replace(/\\\\/g,'\\').replace(/\\b/g,'\b').replace(/\\f/g,'\f').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\\//g,'\/'); // handle backslash plus '\/bfnrt
	};
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
		return ctx.children[1].getText();
	};
	visitApostrophedArgument = function(ctx) {
		return ctx.children[1].getText();
	};
	visitTokenedArgument = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitTextedArgument = function(ctx) {
		return ctx.getText();
	};
	visitComment = function(ctx) {
		if (ctx.start.start == 0){
			return ''; // special case for a comment at the beginning of the fileCreatedDate{
		}
		return ' ';
	};
	visitBracedthinarrow = function(ctx) {
		let oldMissingValue = this.annotations.MissingValue;
		delete this.annotations.MissingValue; // conditionals need to see the absense of a value
		let result : any = ctx.children[0].accept(this);
		this.annotations.MissingValue = oldMissingValue;
		if (typeof result == 'boolean' && result && ctx.children[2].children){ // protect against invalid syntax
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		if (typeof result == 'string' && result.startsWith('ERROR:')){
			return result;
		}
		return ''; // false means ignore this token
	};
	visitBracedarrow = function(ctx) {
		let oldMissingValue = this.annotations.MissingValue;
		delete this.annotations.MissingValue; // conditionals need to see the absense of a value
		let result : boolean = ctx.children[0].accept(this);
		this.annotations.MissingValue = oldMissingValue;
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
	visitBracketedtemplatespec = function(ctx) {
		let result : any = this.visitChildren(ctx);
		result = result.slice(1, result.length - 1);  // ignore the results from brackets
		if (result.length == 1){
			return result[0];
		}
		return result.join('');
	};
	visitMethodableTemplatespec = function(ctx) {
		let value : any;
		if (this.context && this.context.type == 'list'){
			value = [];
			this.context.iterateList(()=>{
				value.push(this.visitChildren(ctx)[0]);
			});
		} else {
			value = this.visitChildren(ctx)[0];
		}
		return value;
	}
	visitNamedSubtemplate = function(ctx) {
		let subtemplateName : string = typeof ctx == 'string' ? ctx : ctx.getText();
		if (!this.subtemplates[subtemplateName]){
			let subtemplateUrl = '/subtemplate/' + subtemplateName.substr(1); // remove the #
			if (!urls[subtemplateUrl]){
				urls[subtemplateUrl] = {};
			}
			if (!urls[subtemplateUrl].data){
				return 'loading subtemplate "' + subtemplateName + '"';
			}
			this.subtemplates[subtemplateName] = urls[subtemplateUrl].data;
		}
		let parserInput = '{:' + this.subtemplates[subtemplateName] + '}';
		const lexer = createLexer(parserInput);
		const parser = createParserFromLexer(lexer);
		const tree = parser.compilationUnit();
		if (this.recursionLevel > 20){
			return 'ERROR: too many levels of recursion when invoking ' + subtemplateName;
		}
		++this.recursionLevel;
		let oldTokenString = this.annotations['Tokens'];
		this.annotations['Tokens'] = tokensAsString(parser, parserInput);
		let result : any = this.visitCompilationUnit(tree);
		--this.recursionLevel;
		this.annotations['Tokens'] = oldTokenString;
		return result;
	}
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
	visitTemplatespec = function(ctx) {
		return this.visitChildren(ctx)[0]; // remove a level of arrays
	};
	visitSubtemplateSection = function(ctx) {
		// report any subtemplates that take more than one line for folding
		folds = [];
		if (ctx.children[1].children == null){
			// protect against invalid section
			return '';
		}
		ctx.children[1].children.forEach((child)=>{
			if (child.start.line != child.stop.line){
				folds.push({
					start: child.start.line,
					end: child.stop.line,
					kind: monaco.languages.FoldingRangeKind.Region
				});
			}
		});
		// visit the children to load the subtemplates dictionary, but don't output anything
		this.visitChildren(ctx);
		return '';
	};
	visitOptionallyInvokedMethodable = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitNotConditional = function(ctx) {
		let result : any = this.visitChildren(ctx)[1];
		return !result;
	};
	visitCondition = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitBracedMethodable = function(ctx) {
		// remove extraneous array
		return this.visitChildren(ctx)[0];
	};
	visitBracketedArgument = function(ctx) {
		// remove extraneous array
		return this.visitChildren(ctx)[0];
	};
	visitNestedConditional = function(ctx) {
		return this.visitChildren(ctx)[1];  // return second of three children (left paren, the conditional, right paren)
	};
	visitBraceThinArrow = function(ctx) {
		return this.visitChildren(ctx)[0];
	};
	visitIndent = function(ctx) {
		let bulletText : string = ctx.children[0].getText();
		let indent : Indent = new Indent(bulletText, this.indent);
		this.indent = indent;
		let bulletNewLine = ctx.children[0].getText().startsWith('\n') ? '\n' : ''
		let bullet : string = bulletNewLine + indent.beforeBullet + indent.bullet + indent.afterBullet;
		let result = ctx.children[1].accept(this);
		this.indent = indent; // restore the current level of indent which may have been changed by the children
		let multilineResult = '';
		for (let i = 0; i < result.length; i++){
			// arrays within the results are values that need to be bulleted
			if (Array.isArray(result[i])){
				// apply the indent to each result
				let multilines = result[i];
				for (let j = 0; j < multilines.length; j++){
					result[i] = multilines[j];
					multilineResult += ((bulletNewLine + indent.beforeBullet + this.indent.bullet + indent.afterBullet) + result.join(''));
					bulletNewLine = '\n'; // the lack of a new line is a special case for a bullet or indent that occurs at the very beginning of input
					if (j < (multilines.length - 1)){
						this.indent = new Indent(bulletText, this.indent); // increase the index
					}
				}
				return multilineResult; // note: currently only supports one multiline per indent
			}
		}
		return bullet + result.join('');
	};
	visitBeginningIndent = function(ctx) {
		return this.visitIndent(ctx);
	};
	callMethod = function(method : string, value : any, args: any){
		let argValues = [];
		if (args.constructor.name == 'ConditionContext'){
			// the argument is a boolean
			argValues[0] = args.accept(this);
		} else if (args.constructor.name == 'ArgumentsContext'){
			let argResults = args.accept(this);
			if (argResults){
				argResults.forEach((arg) =>{
					if (arg !== undefined){ // remove result of commas
						argValues.push(arg);
					}
				});
			}
		}
		let parentCtx : any = args.parentCtx;
		// TODO: table driven argmument handling
		let bTemplate = parentCtx.children[1] && parentCtx.children[1].constructor.name == "MethodabletemplatespecContext";
		if (bTemplate || method.startsWith('#')){
			let oldContext : TemplateData = this.context;
			// TODO: consider a clean context as a child of the context
			this.context = new TemplateData({});
			this.context.add('$0', value);
			for (let i = 0; i < argValues.length; i++){
				this.context.add('$' + (i + 1), argValues[i]);
			}
			if (!bTemplate){
				value = this.visitNamedSubtemplate(method);
			} else {
				let result = parentCtx.children[1].accept(this);
				value = ''; 
				if (result){ // needed to protect against bad syntax
					value = result[1]; // ignore the brackets when callling a bracketed template
				}
			}
			this.context = oldContext;
		} else if (value == null && !(method == 'Exists' || method == 'Count' || method == 'Where' || method == 'ToJson' || method == 'Matches' || method == 'IfMissing')){
			value = value; // null with most methods returns null
		} else if (typeof value != 'string' && (method == 'ToUpper' || method == 'ToLower')){
			let msg = 'ERROR: invalid method, ' + method + ' for this data: ' + parentCtx.getText();
			this.errors.push(new Error(parentCtx.start.line, parentCtx.stop.line, parentCtx.start.column, parentCtx.stop.column, msg));
			value = msg;
		} else if (args.children && (method == 'ToUpper' || method == 'ToLower')){
			let msg = 'ERROR: invalid argument for ' + method + ': ' + args.getText();
			this.errors.push(new Error(args.start.line, args.stop.line, args.start.column, args.stop.column, msg));
			value = msg;
		} else if (!args.children && (method == 'GreaterThan' || method == 'LessThan')){
			let msg = 'ERROR: missing argument for ' + method + ': ' + args.getText();
			this.errors.push(new Error(parentCtx.start.line, parentCtx.stop.line, parentCtx.start.column, parentCtx.stop.column, msg));
			value = msg;
		} else if (args.children && args.children.length > 1 && (method == 'GreaterThan' || method == 'LessThan')){
			let msg = 'ERROR: too many arguments for ' + method + ': ' + args.getText();
			this.errors.push(new Error(args.start.line, args.stop.line, args.start.column, args.stop.column, msg));
			value = msg;
		} else if (args.children && args.children.length < 3 && method == 'Case'){
			let msg = 'ERROR: too few arguments for ' + method + ': ' + args.getText();
			this.errors.push(new Error(args.start.line, args.stop.line, args.start.column, args.stop.column, msg));
			value = msg;
		} else {
			switch (method){
				case 'ToUpper':
					value = <string>value.toUpperCase();
					break;

				case 'ToLower':
					value = <string>value.toLowerCase();
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

				case 'Matches':
					let matches : boolean = false;
					if (argValues.length == 0 || value == null){
						if (argValues.length == 0 && value == null){
							value = true; //TODO: is it appropriate to match nulls?
						} else {
							value = false;
						}
					} else {
						argValues.forEach((arg)=>{
							if ((!isNaN(arg) && !isNaN(value) && parseInt(arg) == parseInt(value)) || arg.toString() == value.toString()){
								matches = true;
							}
						});
						value = matches;
					}
					break;

				case 'Anded':
					if (Array.isArray(value)){
						for (let i : number = 0; i < value.length - 1; i++){
							if (i == (value.length - 2)){
								value[i] += ' and ';
							} else {
								value[i] += ', ';
							}
						}
						value = value.join('');
					}
					break;
					
				case 'Exists':
				case 'Count':
				case 'Where':
					if (!args.children){
						// no arguments
						if (method == 'Where'){
							let msg : string = 'ERROR: no condition specified for .Where()';
							let parentCtx : any = args.parentCtx;
							this.errors.push(new Error(parentCtx.start.line, parentCtx.stop.line, parentCtx.start.column, parentCtx.stop.column, msg));
							value = msg;
						} else if (method == 'Count'){
							if (value == undefined){
								value = 0;
							} else if (value instanceof TemplateData && value.type == 'list'){
								value = value.count();
							} else {
								value = 1;
							}
						} else { // Exists
							if (value == undefined){
								value = false;
							} else {
								value = true;
							}
						}
					} else if (!(args.constructor.name == 'ConditionContext' || args.constructor.name == 'NotConditionalContext' || args.constructor.name == 'LogicalOperatorContext' || args.constructor.name == 'NestedConditionalContext')){
						let msg = 'ERROR: invalid argument for ' + method + ': ' + args.getText();
						this.errors.push(new Error(args.start.line, args.stop.line, args.start.column, args.stop.column, msg));
						value = msg;
					} else {
						if (value instanceof TemplateData){
							let oldContext : TemplateData = this.context;
							// temporarily set the context to the value being evaluated
							this.context = <TemplateData>value;
							let result = [];
							if (this.context.type = 'list'){
								this.context.iterateList(()=>{
									if (args.accept(this)){
										// the condition returned true; add a clone of the iteration 
										result.push(new TemplateData(this.context)); 
									}
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
									value = new TemplateData(result); // multivalues is a list
									break;
							}
						}
						if (method == 'Count'){
							if (value == undefined){
								value = 0;
							} else if (value instanceof TemplateData && value.type == 'list'){
								value = value.count();
							} else {
								value = 1;
							}
						} else if (method == 'Exists'){
							if (value){
								value = true;
							} else {
								value = false;
							}
						}
					}
					break;

				case 'IfMissing':
					if (!value) {
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

				case '@MissingValue':
					value['MissingValue'] = argValues[0];
					break;
					
				default:
					value = value + '[.' + method + '(' + argValues.join(', ') + ')]';
					let parentCtx : any = args.parentCtx;
					let msg = 'ERROR: unknown function: .' + method + '(' + argValues.join(', ') + ')';
					this.errors.push(new Error(parentCtx.start.line, parentCtx.stop.line, parentCtx.start.column, parentCtx.stop.column, msg));
					break;
			}
		}
		return value;
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
declare global {
  interface Window {
    ParserFacade: any;
  }
}

export function createLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateLexer(chars);

    lexer.strictMode = false;
	window.ParserFacade = this;
    return lexer;
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
	return folds;
}

export let folds = [];
let urls = {};
let model;
let concurrency = 0;

export function inputChanged(input, model, monaco) : void {
	let invocation = ++concurrency;
	setTimeout(()=>{
		if (invocation == concurrency){
			validate(input, model, monaco, invocation);
		}
	}, 2000);
}
function tokensAsString(parser, input){
	let parsed = '';
	if (input){
		try{
			let treeTokens : CommonToken[] = parser._interp._input.tokens;
			let symbolicNames : string[] = parser.symbolicNames;
			
			for (let e of treeTokens){
				if (e.type != -1) {
					parsed += symbolicNames[e.type] + '(' + input.substring(e.start, e.stop + 1) + ') ';
				}
			}
		} catch(err) {
			parsed = '*****ERROR*****';
		}
	}
	return parsed.replace(/\n/g,'\\n').replace(/\t/g,'\\t');
}
function validate(input, model, monaco, invocation) : void {
    let errors : Error[] = [];
    const lexer = createLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ConsoleErrorListener());

    const parser = createParserFromLexer(lexer);
	setTimeout(()=>{
		if (invocation != concurrency){
			return;
		}
		parser.removeErrorListeners();
		parser.addErrorListener(new CollectorErrorListener(errors));
		parser._errHandler = new TextTemplateErrorStrategy();

		const tree = parser.compilationUnit();
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
		let parsed : string = '';
		parsed = tokensAsString(parser, input);
		setTimeout(()=>{
			if (invocation != concurrency){
				return;
			}
			var visitor = new TextTemplateVisitor();
			visitor.annotations['Tokens'] = parsed;
			visitor.errors = errors;
			folds = []; // folds will be computed while visiting
			var result = visitor.visitCompilationUnit(tree);
			if (invocation != concurrency){
				return;
			}
			//document.getElementById('parsed').innerHTML = parsed.replace(/\n/g,'\\n').replace(/\t/g,'\\t');
			document.getElementById('interpolated').innerHTML = result;
			Object.keys(urls).forEach((key : string) =>{
				if (!key.startsWith('/') && (key.split('//').length != 2 || key.split('//')[1].indexOf('/') == -1)){
					delete urls[key] // clean up incomplete urls
				} else {
					if (!urls[key].data && !urls[key].loading){
						urls[key].loading = true;
						$.ajax({
							url: key,
							success: function (data) {
								if (data.error){
									urls[key].data = data.error;
								} else {
									if (typeof data != 'string'){
										data = JSON.stringify(data);
									}
									urls[key].data = data;
									//model.undo(); // strange way of getting the model to revalidate
									//model.redo();
								}
							}
						});
					}
				}
			});
			let monacoErrors = [];
			for (let e of errors) {
				monacoErrors.push({
					startLineNumber: e.startLine,
					startColumn: e.startCol,
					endLineNumber: e.endLine,
					endColumn: e.endCol,
					message: e.message,
					severity: monaco.MarkerSeverity.Error
				});
			};
			monaco.editor.setModelMarkers(model, "owner", monacoErrors);
		}, 0);
	}, 0);
}
