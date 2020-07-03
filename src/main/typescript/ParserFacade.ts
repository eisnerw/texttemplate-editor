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
	public indentText : string;
	public length : number;
	public beforeBullet : string;
	public afterBullet : string;
	public bulletWidth : number;
	public level : number;
	public index : number;
	public computedIndent;
	public error : string; 
	constructor(indentText : string, current : Indent){
		this.indentText = indentText.replace('\n', '');
		let length = this.indentText.length
		this.length = length;
		let splitIndent = this.indentText.split('{.}');
		this.beforeBullet = splitIndent[0];
		this.afterBullet = splitIndent.length == 2 ? splitIndent[1] : '';
		let bBulleting = indentText.includes('{.}') || (!!current && current.indentText.includes('{.}'));
		if (!!current && bBulleting && current.level !== undefined){
			if (this.indentText == current.indentText){ 
				// another line at the same level
				this.index = current.index + 1;
				this.parentIndent = current.parentIndent; // replacing current
				this.level = current.level;
				// TODO: compute the bullet text
			} else if (length > current.indentText.length){ 
				// indenting from the current line
				this.index = 0;
				this.parentIndent = current;
				this.level = current.level + 1;
			} else {
				let parentIndent = current.parentIndent;
				while (parentIndent !== null){
					// find the matching level
					if (parentIndent.indentText.length != length){
						parentIndent = parentIndent.parentIndent;
					} else {
						break; // found it
					}
				}
				if (!parentIndent){
					/*
					this.error = 'ERROR: improper indenting because indent levels don\'t match';
					this.beforeBullet = 'ERROR';
					this.level = current.level;
					this.parentIndent = current.parentIndent;
					this.index = current.index + 1;
					*/
					// treat this as if indenting from the current line
					this.index = 0;
					this.parentIndent = current;
					this.level = current.level === undefined ? 0 : current.level + 1;
				} else {
					this.index = parentIndent.index + 1;
					this.parentIndent = parentIndent.parentIndent;
					this.level = parentIndent.level;
				}
			}	
		} else if (bBulleting){
			this.index = 0;
			this.level = 0;
			this.parentIndent = null;
		} else {
			this.parentIndent = current;
		}
		if (splitIndent.length == 1){
			this.computedIndent = this.beforeBullet;
		} else {
			this.computedIndent = '(' + this.level + '-' + this.index + ')'; // TODO: compute bullet text
		}
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
		this.type = 'dictionary';
		if (Array.isArray(json)){
			// the json string is an array.  Convert it into a dictionary with the arbitrary key "data"
			json = {data: json};
		}
		Object.keys(json).forEach((keyname) => {
			let value: any = json[keyname];
			if (typeof value == 'object') {
				if (value != null && (!Array.isArray(value) || value.length > 0)){ // don't add null values or empty arrays
					this.dictionary[keyname] = new TemplateData(value, this);
				}
			} else {
				this.dictionary[keyname] = value;
            }
		});
		if (parent){
			this.parent = parent;
		}
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
	subtemplates : any = {};
	errors = [];
	model;
	input;
	recursionLevel = 0;
	indent : Indent = null;
	annotations = {};
	lastLine = '\n';  // eliminate an edge effect by pretending that we are starting from a new line
	bNoValues : boolean = false; // used when visiting children to get pure interpolations with tokens
	visitText = function(ctx){
		let result = ctx.getText();
		if (result.includes('\n')){
			this.lastLine = result.replace(/.*(\n.*)$/s, '$1'); 
		} else {
			this.lastLine += result;
		}
		return result;
	};
	visitMethodableIdentifer = function(ctx) {
		var key = ctx.getText();
		if (this.bNoValues){
			this.bNoValues = false;
			let result = this.visitMethodableIdentifer(ctx);
			this.bNoValues = true;
			if (!key.startsWith('$') && typeof result == 'string'){
				return '{' + key + '}';
			}
			return result;
		}
		this.lastLine += key;
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
			result = result[0];
		}
		if (this.bNoValues){
			return result;
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
		let oldLastLine = this.lastLine;
		let oldContext : TemplateData = this.context;
		let bHasContext : boolean = ctx.children[1].getText() != ':'; // won't change context if format {:[template]}
		if (bHasContext && ctx.children[1].children){  // ctx.children[1].children protects against invalid spec
			let oldNoValues = this.bNoValues;
			this.bNoValues = false; // need values to get context
			let context : any = ctx.children[1].children[0].accept(this);
			this.bNoValues = oldNoValues;
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
								this.context = new TemplateData('{"data":' + urls[context].data + '}', this.context);
							} else {
								this.context = new TemplateData(urls[context].data, this.context);
							}
						} else {
							bHasContext = false;
							if (!urls[context]){
								urls[context] = {};
							}
						}
					} else {
						this.context = new TemplateData(context, this.context);
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
		this.lastLine = oldLastLine; // undo any side effects from the above
		result = ctx.children[bHasContext ?  3 : 2].accept(this);
		if (oldContext) {
			// protect agaist error when the parse tree is invalid
			this.context = oldContext;
		}
		return result;
	};
	visitCompilationUnit = function(ctx) {
		//console.log(this.getParseTree(ctx)); // for debugging
		if (!ctx.children){
			return ''; // no data
		}
		if (ctx.children.length > 2 && ctx.children[ctx.children.length - 2].children[0].constructor.name == 'SubtemplateSectionContext'){
			// the next to the last node is subtemplates, so visit it first to get the subtemplate dictionary
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
		let oldLastLine = this.lastLine; // preserve last line so it isn't affected during method calculation
		let oldAnnotations = {};
		let oldNoValues = this.bNoValues;
		// clone by shallow copy
		for (let key in this.annotations){
			oldAnnotations[key] = this.annotations[key];
		}
		ctx.children.slice(1).forEach((child) => {
			let method : string = child.children[0].accept(this);
			if (method.startsWith('@') && bMethodableIsTemplate){
				this.bNoValues = false; // get the real arguments
				let args : any = child.children[1];
				this.bNoValues = oldNoValues;
				this.callMethod(method, this.annotations, args);
			} else if ((method == 'Exists' || method == 'IfMissing' || method.startsWith('#')) && this.annotations.MissingValue){
				delete this.annotations.MissingValue; // prevent missing value mechanism from replacing nulls
			}
		});
		let noValueValue : any = undefined;
		let value : any = undefined;
		if (this.context && this.context.type == 'list'){
			// create an arry of results and then run the method on the array
			value = [];
			noValueValue = []
			this.context.iterateList((newContext : TemplateData)=>{
				let oldContext = this.context;
				this.context = newContext;
				this.bNoValues = false;
				value.push(ctx.children[0].accept(this));
				this.bNoValues = oldNoValues;
				if (this.bNoValues){
					noValueValue.push(ctx.children[0].accept(this));
				}
				this.context = oldContext;
			});
		} else {
			this.bNoValues = false;
			value = ctx.children[0].accept(this);
			this.bNoValues = oldNoValues;
			if (this.bNoValues){
				noValueValue = ctx.children[0].accept(this);
			}
		}
		// call each method, which follow the identifier value
		ctx.children.slice(1).forEach((child) => {
			let method : string = child.children[0].accept(this);
			if (!method.startsWith('@')){
				if (!this.bNoValues || (method == 'Case' || method == 'Anded' || method == 'Count' || method == 'Where')){
					this.bNoValues = false;
					let args : any = child.children[1];
					this.bNoValues = oldNoValues;
					if (Array.isArray(value) && (method == 'ToUpper' || method == 'ToLower' || method == 'Matches')){
						let computedValue : string[] = [];
						value.forEach((val) =>{
							computedValue.push(this.callMethod(method, val, args));
						});
						value = computedValue;
					} else {
						value = this.callMethod(method, value, args);
					}
					noValueValue = value;
				}
			}
		});
		this.annotations = oldAnnotations; // restore the annotations
		this.lastLine = oldLastLine; // restore last line
		if (this.bNoValues){
			return noValueValue;
		}
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
		let oldLastLine = this.lastLine; // preserve last line so it is not effected by conditions
		let oldNoValues = this.bNoValues;
		this.bNoValues = false; // conditions are checked with real data
		let result : any = ctx.children[0].accept(this);
		this.bNoValues = oldNoValues;
		this.lastLine = oldLastLine; // restore original last line;
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
		let oldLastLine = this.lastLine; // preserve last line so it is not effected by conditions
		let oldNoValues = this.bNoValues;
		this.bNoValues = false; // conditions are checked with real data
		let result : boolean = ctx.children[0].accept(this);
		this.bNoValues = oldNoValues;
		this.lastLine = oldLastLine; // restore original last line;
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
		let oldTokens = this.annotations['Tokens'];
		this.annotations['Tokens'] = tokensAsString(this.input, ctx.parser.getTokenStream().getTokens(ctx.getSourceInterval().start,ctx.getSourceInterval().stop), ctx.parser.symbolicNames);
		let result = [];
		// skip the first and last children because the are the surrounding brackets
		for (let i : number = 1; i < ctx.children.length - 1; i++){
			if (ctx.children[i].constructor.name != 'TerminalNodeImpl'){ // skip over unparsed (probably comments)
				let childResult = ctx.children[i].accept(this);
				//if (typeof childResult == "string"){
				//	if (childResult.includes('\n')){
				//		this.lastLine = childResult.replace(/.*(\n.*)$/s, '$1'); 
				//	} else {
				//		this.lastLine += childResult;
				//	}
				//}
				result.push(childResult);
			}
		}
		//let result : any = this.visitChildren(ctx);
		this.annotations['Tokens'] = oldTokens;
		if (result.length == 1){
			return result[0];
		}
		return result.join('');
	};
	visitMethodableTemplatespec = function(ctx) {
		if (this.bNoValues){
			if (this.context && this.context.type == 'list'){
				return this.visitChildrenWithoutValues(ctx);
			}
			return this.visitChildren(ctx)[0];
		}
		let value : any;
		if (this.context && this.context.type == 'list'){
			value = [];
			let template : string = this.getTemplateWithoutComments(ctx);
			if (template != ctx.getText()){
				console.log('TEMPLATE:'+ctx.getText());
				console.log('NOCOMMENTS:'+template);
			}
			template = template.substr(1, template.length - 2);
			// The strategy starts by extracting from the template a "beginning sequence" of whitespace, if any, followed by the first new line character followed by whitespace with or without a bullet indicator.
			// From that, we can determine if indents are to be handled by the bullet mechanism, calculate any indent and see if the template has beginning or ending new lines.
			// If this instance is part of a new line, we will have to determine the current indent and indent 4 spaces (nominally) from that.
			// If on a new line, we calculate the indent from the white space that follows the new line
			// If the beginning sequence contains a bullet indicator "{.}", we'll handle it using the bullet mechanism.
			// Otherwise, we'll emitting the beginning sequence without the indent once, processing
			// each line by removing the beginning and ending sequences and adding the indent.  
			// We emit the ending sequence once at the end of the result.
			
			let beginningSequence = template.replace(/^([ \t]*\n?[ \t]*(\{\.\})?)?.*/s,'$1');
			let endingSequence = template.replace(/.*?((\n)[ \t]*)?$/s, "$1");
			let noValueResult = this.visitChildrenWithoutValues(ctx);
			let bHasBullet = beginningSequence.includes('{.}') || (!!this.indent && this.indent.indentText.includes('{.}')); // comment
			let bOnNewLine = /\n[ \t]*(\{\.\})?[ \t]*$/.test(this.lastLine + beginningSequence);
			let bAddBullets = bHasBullet && !beginningSequence.includes('{.}');
			let lastIndent = bOnNewLine ? this.lastLine.replace(/.*?(\n([ \t]+))?$/s, '$2') : this.lastLine.replace(/^\n?([ \t]*).*$/s, '$1');
			let indentText = bOnNewLine ? (this.lastLine + beginningSequence).replace(/.*?(\n([ \t]+))?$/s, '$2') : lastIndent;
			let lastLineNonblankData = this.lastLine.replace(/^[ \t]*(.*)$/s,'$1');
			let bIndentBullets = false;
			let entryBulletLevel = !!this.indent && this.indent.indentText.includes('{.}') ? this.indent.level : -1;
			let bIndentingFirstBulletLine = bHasBullet && !this.indent && !bOnNewLine && lastLineNonblankData != "";
			if (!bHasBullet){
				// indent from the previous indent.  Default to 4 spaces if no indent (TODO: allow an annotation to change this)
				let newIndent = indentText;
				if (!bOnNewLine && lastLineNonblankData != ''){ // only add indent if the current line has non-blanks
					newIndent += '    '; // default of 4 spaces
				}
				this.indent = new Indent(newIndent, this.indent);
			} else if (bAddBullets) {
				let currentIndentSequence = this.indent.beforeBullet + this.indent.computedIndent + this.indent.afterBullet;
				if (this.lastLine.startsWith('\n' + currentIndentSequence)){
					// continuing an existing indent sequence
					let residual = this.lastLine.substr(currentIndentSequence.length + 1);
					if (residual.replace(/^[ \t]*/s,'') != ''){
						// there are residual characters after the bullet, so indenting is necessary
						bIndentBullets = true;
						this.indent = new Indent('    ' + this.indent.indentText, this.indent);
						value.push('\n' + this.indent.beforeBullet + this.indent.computedIndent + this.indent.afterBullet);
					}
				} else {
					// new line under bulleted line but without a bullet
					if (bOnNewLine && lastIndent.length > this.indent.beforeBullet.length){
						this.indent = new Indent(lastIndent.substr(this.indent.beforeBullet.length) + this.indent.indentText, this.indent);  // indent is based on the indent of the new line
						value.push(this.indent.computedIndent + this.indent.afterBullet);
					} else {
						this.indent = new Indent('    ' + this.indent.indentText, this.indent); // indent by the default value under the last indent
						if (bOnNewLine){
							// subtract the effect of any indent
							value.push(this.indent.beforeBullet.substr(lastIndent.length) + this.indent.computedIndent + this.indent.afterBullet);
						} else {
							value.push('\n' + this.indent.beforeBullet + this.indent.computedIndent + this.indent.afterBullet);
						}
					}	
				}
			} else if (bIndentingFirstBulletLine){
				// need to indent the data under the previous line
				this.indent = new Indent('    ' + indentText, this.indent);
			}
			let count = this.context.count(); // used to determine when we are at the end of the list
			let firstResultCount = count - 1;
			let oldLastLine = this.lastLine;
			let computedIndent = !!this.indent ? this.indent.computedIndent : '';
			let currentIndent = this.indent;
			this.context.iterateList((newContext : TemplateData)=>{
				count--;
				let oldContext : TemplateData = this.context;
				this.context = newContext;
				if ((!bHasBullet && !bOnNewLine) || bIndentingFirstBulletLine){
					this.lastLine = '\n' + this.indent.computedIndent; // children need to see what the indent will be
				}
				let result = this.visitChildren(ctx)[0];
				if (/^.*[^ \t\n]+.*\n.*\{\.\}/s.test(noValueResult)){
					this.indent = currentIndent; // force the numbering for the bullet to start over again
				} else if (!bHasBullet && !!this.indent && this.indent.indentText.includes('{.}')){
					// the existence of a new bullet indent is sufficient to set the flag unless the bullet is on s mre ;omr
					bHasBullet = true;
				}
				this.lastLine = oldLastLine; // restore the last because it may have been changed
				if (bAddBullets || bIndentBullets){
					if (count == firstResultCount){
						value.push(result + '\n')
					} else {
						this.indent = new Indent(this.indent.indentText, this.indent);
						value.push(this.indent.beforeBullet + this.indent.computedIndent + this.indent.afterBullet + result + (count == 0 ? '' : '\n'));
					}
				} else if (bIndentingFirstBulletLine){
					value.push('\n' + result);
					currentIndent.level = this.indent.level;
					currentIndent.index = this.indent.index;
					this.indent = currentIndent; // restore indent with indication of level/index
				} else if (bHasBullet){
					value.push(result + (count == 0 || beginningSequence.includes('\n') ? '' : '\n'));
				} else {
					if (computedIndent == '    ' + !result.startsWith('\n') && count == firstResultCount && !beginningSequence.includes('\n')){
						// indent have to start on a new line
						value.push(result + '\n');
					}
					//add the indent, remove beginning and ending sequence, and add a new line if necessary, but not on the last line
					value.push(computedIndent + result.substr(beginningSequence.length, result.length - beginningSequence.length - endingSequence.length) + (count == 0 ? '' : '\n'));
				}
				this.context = oldContext;
			});
			if (bIndentBullets || (entryBulletLevel != -1 && entryBulletLevel != this.indent.level)){
				this.indent = this.indent.parentIndent; // return to previous level
			}
			value = value.join('');
			if (!bHasBullet){
				if (bOnNewLine){
					if (beginningSequence.endsWith(indentText)){
						beginningSequence = beginningSequence.substr(0, beginningSequence.length - indentText.length); // remove the indent because it was handled in the iteration
					} else {
						value = value.substr(indentText.length); // remove the first indent because it is already part of the last line
					}
				} else {
					beginningSequence += '\n'; // start indented on a new line
				}
				this.indent = this.indent.parentIndent;  // done indenting
				// emit the iterated result value between the beginning and ending sequences surround by those sequences
				value = beginningSequence + value + endingSequence;
			}
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
		let oldInput = this.input;
		this.input = parserInput;
		this.annotations['Tokens'] = tokensAsString(parserInput, parser._interp._input.tokens, parser.symbolicNames);
		let result : any = this.visitCompilationUnit(tree);
		--this.recursionLevel;
		this.annotations['Tokens'] = oldTokenString;
		this.input = oldInput;
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
		let bulletTextArray = [];
		ctx.children[0].children.forEach(child=>{
			if (child.constructor.name == 'TerminalNodeImpl'){
				bulletTextArray.push(child.getText());
			} else {
				bulletTextArray.push(child.accept(this));
			}
		});
		let bulletText = bulletTextArray.join('');
		if (this.bNoValues){
			return bulletText + ctx.children[1].accept(this).join('');
		}
		if (!!this.indent && !this.indent.indentText.includes('{.}') && !bulletText.includes('\n')){
			// first bullet after non-bullet indent, so add in the extra indent
			bulletText = this.indent.computedIndent + bulletText;
		}
		let indent : Indent = new Indent(bulletText, this.indent);
		if (!!this.indent && !this.indent.indentText.includes('{.}') && this.indent.level !== undefined){
			indent.level = this.indent.level;
			indent.index = this.indent.index;
			indent = new Indent(bulletText, indent); // advance to proper level/index
		}
		this.indent = indent;
		let bulletNewLine = ctx.children[0].getText().startsWith('\n') ? '\n' : ''
		let bullet : string = bulletNewLine + indent.beforeBullet + indent.computedIndent + indent.afterBullet;
		this.lastLine = bullet;
		let result = ctx.children[1].accept(this);
		if (indent.level != this.indent.level){
			this.indent = indent; // restore the current level of indent which may have been changed by the children
		}
		let multilineResult = '';
		for (let i = 0; i < result.length; i++){
			// arrays within the results are values that need to be bulleted
			if (Array.isArray(result[i])){
				// apply the indent to each result
				let multilines = result[i];
				for (let j = 0; j < multilines.length; j++){
					result[i] = multilines[j];
					multilineResult += ((bulletNewLine + indent.beforeBullet + this.indent.computedIndent + indent.afterBullet) + result.join(''));
					bulletNewLine = '\n'; // the lack of a new line is a special case for a bullet or indent that occurs at the very beginning of input
					if (j < (multilines.length - 1)){
						this.indent = new Indent(bulletText, this.indent); // increase the index
					}
				}
				console.log('used multiline result: ' + multilineResult);
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
		let oldNoValues = this.bNoValues;
		this.bNoValues = false; // ignore bNoValues when getting argument values
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
		this.bNoValues = oldNoValues;
		let parentCtx : any = args.parentCtx;
		// TODO: table driven argmument handling
		let bTemplate = parentCtx.children[1] && parentCtx.children[1].constructor.name == "MethodabletemplatespecContext";
		if (bTemplate || method.startsWith('#')){
			let oldContext : TemplateData = this.context;
			// TODO: consider a clean context as a child of the context
			this.context = new TemplateData({}, this.context);
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
								this.context.iterateList((newContext)=>{
									let oldContext : TemplateData = this.context;
									this.context = newContext;
									if (args.accept(this)){
										// the condition returned true; add a clone of the iteration 
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
	visitChildrenWithoutValues = function(ctx){
		let oldNoValues = this.bNoValues;
		let oldContext = this.context;
		let oldLastLine = this.lastLine;
		if (!!this.context && this.context.type == 'list'){
			this.context = this.context.list[0];
		}
		this.bNoValues = true;
		let result = this.visitChildren(ctx);
		this.bNoValues = oldNoValues;
		this.context = oldContext;
		this.lastLine = oldLastLine;
		return result;
	}
	
	getTemplateWithoutComments = function(ctx){
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace('Context', '');
		switch (ctxName) {
			case "NamedSubtemplate":
			case "MethodInvoked":
			case "MethodableIdentifer":
			case "BeginningBulletHolder":
			case "BulletHolder":
			case "Text":
				templateParts.push(ctx.getText());
				break;
			case "Templatecontexttoken":
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
			case "Templatetoken":
				templateParts.push('{');
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					templateParts.push(this.getTemplateWithoutComments(ctx.children[i]));
				}
				templateParts.push('}');
				break;
			//case "OptionallyInvokedMethodable":
			//	templateParts.push('{' + ctx.getText() + '}');
			//	break;
			case "Bracketedtemplatespec":
				templateParts.push('[');
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					if (ctx.children[i].constructor.name != 'TerminalNodeImpl'){ // skip over unparsed (probably comments)
						templateParts.push(this.getTemplateWithoutComments(ctx.children[i]))
					}
				}
				templateParts.push(']');
				break;
			case "Bracedarrowtemplatespec":
			case "Bracedarrow":
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
	getParseTree = function(ctx, indent?){
		const indentBlanks = '   ';
		if (indent === undefined){
			indent = '';
		}
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace('Context','');
		switch (ctxName) {
			case "Templatecontents":
			case "CompilationUnit":
			case "QuoteLiteral":
			case "ApostropheLiteral":
			case "MethodInvocation":
			case "Comment":
			case "Bracedthinarrow":
			case "LogicalOperator":
			case "MethodableTemplatespec":
			case "SubtemplateSpecs":
			case "BracketedArgument":
			case "Indent":
			case "BeginningIndent":
			case "MethodInvoked":
			case "Templatecontexttoken":
				templateParts.push(indent + ctxName);
				ctx.children.forEach(child=>{
					if (child.getChildCount() > 0){
						templateParts.push(this.getParseTree(child, indentBlanks + indent));
					}
				});
				break;
			case "Method":
			case "MethodableIdentifer":
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
			case "Bracketedtemplatespec":
			case "Templatetoken":
				templateParts.push(indent + ctxName);
				for (let i : number = 1; i < ctx.children.length - 1; i++){
					templateParts.push(this.getParseTree(ctx.children[i], indentBlanks + indent));
				}
				break;
			case "Bracedarrowtemplatespec":
			case "Bracedarrow":
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
let model;
export function provideFoldingRanges(monacoModel, context, token) {
	model = monacoModel; // note: this is a convenient way to capture the model
	return folds;
}

export let folds = [];
let urls = {};
let invocations = 0;

export function inputChanged(input) : void {
	let invocation = ++invocations;
	setTimeout(()=>{
		if (invocation == invocations){
			validate(input, invocation);
		}
	}, invocation == 1 ? 0 : 2000); // first time is immediate.  Otherwise, wait 2 seconds after last keystroke to allow typing in the editor to continue
}
function tokensAsString(input, treeTokens : CommonToken[], symbolicNames : string[]){
	let parsed = '';
	if (input){
		try{
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
function validate(input, invocation) : void {
    let errors : Error[] = [];
    const lexer = createLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ConsoleErrorListener());

    const parser = createParserFromLexer(lexer);
	setTimeout(()=>{
		if (invocation != invocations){
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
		
		let parsed = '';
		parsed = tokensAsString(input, parser._interp._input.tokens, parser.symbolicNames);
		setTimeout(()=>{
			if (invocation != invocations){
				return;
			}
			var visitor = new TextTemplateVisitor();
			visitor.annotations['Tokens'] = parsed;
			visitor.errors = errors;
			visitor.model = model;
			visitor.input = input;
			folds = []; // folds will be computed while visiting
			var result = visitor.visitCompilationUnit(tree);
			if (invocation != invocations){
				return;
			}
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
									let invocation = ++invocations;
									setTimeout(()=>{
										if (invocation == invocations){
											validate(visitor.model.getValue(), invocation);
										}
									}, 0);
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
