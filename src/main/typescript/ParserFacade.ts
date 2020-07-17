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
class BulletIndent {
	public level : number;
	public index : number;
	public indent : string;
	public parent : BulletIndent;
	public lastBullet = '';
	constructor(indent : string = null, currentBulletIndent : BulletIndent = null){
		if (indent == null){
			// indicates an empty BulletIndent
			return;
		}
		let currentIndent = currentBulletIndent == null ? '' : currentBulletIndent.indent;
		this.indent = indent;
		if (currentBulletIndent == null ){
			// establish the first level
			this.level = 0;
			this.index = 0;
			this.parent = null;
		} else if (indent == currentIndent){
			// staying on the same level
			this.level = currentBulletIndent.level;
			this.index = currentBulletIndent.index + 1;
			this.parent = currentBulletIndent.parent;
		} else {
			// search for the same level
			let matchingLevel : BulletIndent = currentBulletIndent.parent; // used to find a previous level
			while (matchingLevel != null){
				if (indent == matchingLevel.indent){
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
				this.level = currentBulletIndent.level + 1;
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
		return cloneBulletIndent;
	}
	getBullet(){
		let bullet = '(' + this.level + '.' + this.index + ')'; // TODO: bullet style
		this.lastBullet = this.indent + bullet;
		return bullet;
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
	bulletIndent : BulletIndent;
	recursionLevel = 0;
	annotations = {};
	visitText = function(ctx){
		return ctx.getText();
	};
	visitIdentifier = function(ctx) {
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
			if (ctx.children[1].constructor.name == 'NamedSubtemplateContext'){
				context = ctx.children[1].accept(this);
			} else {
				context = ctx.children[1].children[0].accept(this);
			}
			context = this.interpret(context);
			if (Array.isArray(context) && context.length == 1){
				context = context[0]; // support templates as contexts
			}
			if (typeof context === 'string'){
				try{
					if (context.toLowerCase().startsWith('http') || context.startsWith('/')){
						if (urls[context] && urls[context].data){
							this.context = new TemplateData(urls[context].data, this.context);
						} else {
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
		// subtemplates are inherited but can be replaced
		let oldSubtemplates = {};
		for (let key in this.subtemplates){
			oldSubtemplates[key] = this.subtemplates[key];
		}
		this.loadSubtemplates(ctx);
		let result : [] = this.visitChildren(ctx);
		this.subtemplates = oldSubtemplates;
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
		let oldAnnotations = {};
		let value : any = undefined;
		for (let key in this.annotations){
			oldAnnotations[key] = this.annotations[key];
		}
		if (valueContext != null){ // null implies that the value is the current context
			let bTargetIsTemplate = valueContext.getText().startsWith('[') || valueContext.getText().startsWith('#'); // value will be obtained from a template
			// preserve the incoming annotations by doing a shallow clone because a method could change one
			// process annotations first
			if (bTargetIsTemplate){ // TODO: flag annotations on non-templates as errors
				invocations.forEach((child) => {
					let method : string = child.children[0].accept(this);
					if (method.startsWith('@') && bTargetIsTemplate){
						let args : any = child.children[1];
						this.callMethod(method, this.annotations, args); // modify the current annotations so that old annotations are inherited
					} else if ((method == 'Exists' || method == 'IfMissing' || method.startsWith('#')) && !!this.annotations.MissingValue){
						delete this.annotations.MissingValue; // prevent missing value mechanism from replacing nulls TODO: is this the right place?
					}
				});
			}
			if (this.context && this.context.type == 'list'){
				// for non-annotations and under special circumstances, depending on how it was parsed, we'll obtain a single value rather than a list
				let bAggregatedResult : boolean = valueContext.constructor.name == 'InvokedTemplateSpecContext';  // only aggregate for this specific context
				if (bAggregatedResult){
					invocations.forEach((child) => {
						let method = child.children[0].accept(this);
						if (!method.startsWith('@')){ // TODO: add other tests
							bAggregatedResult = false; 
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
						list.push(this.interpret(valueContext.accept(this))); // reduce each result to a string
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
		// process non-annotactions by calling each method serially
		invocations.forEach((child) => {
			// Each child is a method and an argument(s) tree
			let method : string = child.children[0].accept(this);
			if (!method.startsWith('@')){ // annotations have already been processed
				let args : any = child.children[1]; // passing the argument tree to CallMethod
				value = this.callMethod(method, this.interpret(value), args);
			}
		});
		this.annotations = oldAnnotations; // restore the annotations
		return value;
	}
	visitQuoteLiteral = function(ctx) {
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
	visitBracedThinArrow = function(ctx) {
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
	visitBracedArrow = function(ctx) {
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
	visitBracketedTemplateSpec = function(ctx) {
		let oldTokens = this.annotations['Tokens'];
		this.annotations['Tokens'] = tokensAsString(this.input, ctx.parser.getTokenStream().getTokens(ctx.getSourceInterval().start,ctx.getSourceInterval().stop), ctx.parser.symbolicNames);
		let result = [];
		// skip the first and last children because the are the surrounding brackets
		for (let i : number = 1; i < ctx.children.length - 1; i++){
			if (ctx.children[i].constructor.name != 'TerminalNodeImpl'){ // skip over unparsed (probably comments)
				let childResult = ctx.children[i].accept(this);
				result.push(childResult);
			}
		}
		//let result : any = this.visitChildren(ctx);
		this.annotations['Tokens'] = oldTokens;
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
		if (typeof result == 'string'){
			result = [result]; // return in an array for consistency
		}
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
	visitTemplateSpec = function(ctx) {
		let result = this.visitChildren(ctx);
		//if (Array.isArray(result) && result.length == 1){
			return result[0];
		//}
		//return result;
	};
	visitSubtemplateSection = function(ctx) {
		// report any subtemplates that take more than one line for folding
		folds = [];
		if (ctx.children[1].children == null){
			// protect against invalid section
			return '';
		}
		ctx.children[1].children.forEach((child)=>{
			if (child.constructor.name != 'TerminalNodeImpl' && child.start.line != child.stop.line){
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
	visitOptionallyInvoked = function(ctx) {
		let result = this.visitChildren(ctx);
		//if (result.length == 1){
			return result[0];
		//}
		//return result;
	};
	visitNotConditional = function(ctx) {
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
		return {type:'indent', bullet: bulletText, result: ctx.children[1].accept(this)};
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
						argValues.push(this.interpret(arg));
					}
				});
			}
		}
		let parentCtx : any = args.parentCtx;
		// TODO: table driven argmument handling
		let bTemplate = parentCtx.children[1] && parentCtx.children[1].constructor.name == "InvokedTemplateSpecContext";
		if (bTemplate || method.startsWith('#')){
			if (Array.isArray(value)){
				value = value.join('');
			}
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
							if (this.context.type == 'list'){
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
					
				case '@ResetBullets':
					this.bulletIndent = null;
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
	getTemplateWithoutComments = function(ctx){
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace('Context', '');
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
	getParseTree = function(ctx, indent?){
		const indentBlanks = '   ';
		if (indent === undefined){
			indent = '';
		}
		let templateParts = [];
		let ctxName = ctx.constructor.name.replace('Context','');
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
			case "Indent":
			case "BeginningIndent":
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
	interpret = function(result){
		if (typeof result == 'object' && result != null && !Array.isArray(result)){
			if (result instanceof TemplateData || result.type == 'argument'){
				return result; // don't interpret if not appropriate
			}
			result = [result];  // do interpret expects arrays
		}
		if (!Array.isArray(result)){
			return result;
		}
		let output = {lines: [""], skipping: false, bulletIndent: this.bulletIndent, bNewLineInOutput: false};
		this.doInterpret(result, output, null);
		if (output.skipping){
			// never encountered a new line while skipping
			if (output.lines.length == 1){
				return null; // a null in the array nullified the whole array}
			}
			return [output.lines.slice(0, output.lines.length - 1).join('\n'), null];
			//return null; // TODO: there are multiple lines with the last one null. This may require more code
		}
		return output.lines.join('\n');
	}
	doInterpret = function(result, output, indent){
		let lines = output.lines;
		result.forEach((item : any)=>{
			if (item == null){
				lines[lines.length - 1] = ''; // skipping this line
				output.skipping = true;
				this.bulletIndent = output.bulletIndent; // restore the bulletIndent that was in effect for the skipped line
			} else if (this.isScalar(item)){
				this.addToOutput(item.toString(), output);
			} else if (Array.isArray(item)){
				let indentInTheOutput = lines[lines.length - 1].replace(/^([ \t]*(\{\.\})?).*/s,'$1'); 
				// determine if the current bulleted indent is being overridden by a plain indent
				let bReplaceIndent = !!indent && indent.includes('{.}') && !indentInTheOutput.includes('{.}') && indentInTheOutput.length > 0;
				this.doInterpret(item, output, bReplaceIndent ? indentInTheOutput : indent);
			} else if (typeof item == 'object' && item != null){
				if (item.type == 'indent'){
					this.addToOutput(item.bullet, output);
					if (item.result == null) {
					} else if (typeof item.result == 'string' || typeof item.result == 'number'){
						this.addToOutput(item.result.toString(), output);
					} else if (typeof item.result == 'object' && item.result != null){
						if (Array.isArray(item.result) || item.result.type == 'indent'){
							this.doInterpret([item.result], output, item.bullet);
						} else {
							// list
							for (let i = 0; i < item.result.list.length(); i ++){
								this.doInterpret(this.result.list[i], output, item.bullet);
								if (i < this.result.list.length - 1){
									this.addToOutput('\n', output);
								}
							}
						}	
					} else {
						let x = 'stop';
					}
				} else {
					// list
					if (!!indent && indent.includes('{.}')){
						// This is an unbulleted list under a bullet, so we need to turn each list item into an indent object with an indented bullet
						let bIncompleteBullet = /^[ \t]*\{\.\}[ \t]*$/.test(lines[lines.length - 1]);
						let newBullet = indent.replace(/([ \t]*\{\.\})/,'   ' + '$1'); // TODO: allow override of default tab
						for (let i = 0; i < item.list.length; i++){
							let itemResult = item.list[i];
							let indentObject = itemResult;
							// let the next level handle an array of items that aren't lists or indents
							if (!this.containsIndent(indentObject)){
								indentObject = {type:'indent', result: itemResult, bullet: bIncompleteBullet ? indent : newBullet};
							}
							if (i == 0){
								let doInterpretParm = [indentObject];
								if (bIncompleteBullet){
									doInterpretParm = Array.isArray(itemResult) ? itemResult : [itemResult];
								}
								this.doInterpret(doInterpretParm, output, indent);
							} else {
								if (!indent.includes('\n')){
									this.addToOutput('\n', output);
								}
								this.doInterpret([indentObject], output, indent);
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
							let bWillBeIndented = this.isIndent(listItem) || this.containsIndent(listItem);
							if (bWillBeIndented){
								newIndent = indent;
							}
							if (!bStartsWithNewLine && !(bIncompleteIndent && bFirst) && (!bEmptyLine || !bFirst)){
								this.addToOutput('\n', output); // start a new line
								if (!!newIndent && newIndent != '' && !bWillBeIndented){
									this.addToOutput(newIndent, output);
								}
							}
							this.doInterpret(Array.isArray(listItem) ? listItem : [listItem], output, newIndent);
							bFirst = false;
						});		
					}
				}
			} else {
				let x = 'stop';
			}
		});
	}
	isIndent(item : any){
		if (typeof item != 'object' || item == null || item.type != 'indent'){
			return false;
		}
		return true;
	}
	containsIndent(value : any){
		if (typeof value == 'object' && value != null && value.type == 'list'){
			value = value.list;
		}
		if (Array.isArray(value)){
			let bContainsIndent = false;
			for (let i = 0; i < value.length; i++){
				let val = value[i];
				if (this.isIndent(val)){
					bContainsIndent = true;
					break;
				}
				if (typeof val != 'string' || !/^[ \t]*$/s.test(val)){
					// indent can only follow blanks
					break;
				}
			}
			return bContainsIndent;
		} else {
			return this.isIndent(value);
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
		if (typeof value == 'object' && value != null){
			if (value.type == 'indent'){
				return value.bullet + this.valueAsString(value.result);
			} else {
				// list; return the value of the first item
				return this.valueAsString(value.list[0]);
			}
		}
		if (value == null){
			return '';
		}
		return value.toString();
	}
	isScalar(value){
		if (value != null && typeof value != "object"){
			return true;
		}
		return false;
	}
	addToOutput(text, output){
		let arText = text.split('\n');
		if (arText.length > 1){
			output.bNewLineInOutput = true;
		}
		if (output.skipping){
			if (arText.length == 1){
				return; // no carriage return, so continue skipping
			}
			text = arText.slice(1).join('\n'); // ignore text up to the first new line
			output.skipping = false;
		}
		let lines = output.lines;
		if (/^[ \t]*\{\.\}[ \t]*$/.test(lines[lines.length - 1])){
			// there is a residual bullet already in the output
			let indent = lines[lines.length - 1].replace(/^([ \t]*).*$/, '$1');
			output.bulletIndent = this.bulletIndent == null ? null : this.bulletIndent.clone();
			this.bulletIndent = new BulletIndent(indent, this.bulletIndent);
			lines[lines.length - 1] = lines[lines.length - 1].replace(/[ \t]*\{\.\}/, indent + this.bulletIndent.getBullet());
		} else {
			let lastLine = lines[lines.length - 1];
			if (output.bNewLineInOutput 
					// TODO: This is tricky and may need tuning.  
					&& this.bulletIndent != null 
					&& lastLine.length > 0 
					&& !lastLine.startsWith(this.bulletIndent.lastBullet) 
					&& !('\n' + text).includes('\n' + this.bulletIndent.lastBullet) 
					&& !/^\s*\{\.\}/.test(text)){ // TODO: this MAY be a condition that only occurs with no indenting
				// there is a non-bulleted line in the output; see if it should reset bulleting levels because it is less indented then the bullet(s)
				let lastLineIndent = lastLine.replace(/^([ \t]*).*$/,'$1'); // TODO: Should this be an option?
				while (this.bulletIndent != null && this.bulletIndent.indent.length >= lastLineIndent.length){
					this.bulletIndent = this.bulletIndent.parent;
				}
			}
		}
		let ar = text.split('\n');
		for (let i = 0; i < ar.length - 1; i++){
			if (false && /^[ \t]*\{\.\}/.test(ar[i])){
				// the line contains a bullet
				let indent = ar[i].replace(/^([ \t]*).*$/, '$1');
				output.bulletIndent = this.bulletIndent == null ? null : this.bulletIndent.clone();
				this.bulletIndent = new BulletIndent(indent, this.bulletIndent);
				ar[i] = ar[i].replace(/[ \t]*\{\.\}/, indent + this.bulletIndent.getBullet());
			}
			lines[lines.length - 1] += ar[i];
			lines.push('');
		}
		let lastLine = ar[ar.length - 1];
		lines[lines.length - 1] += lastLine;
	}
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

export function inputChanged(input ,mode) : void {
	let invocation = ++invocations;
	setTimeout(()=>{
		if (invocation == invocations){
			validate(input, invocation, mode);
		}
	}, mode != 1 || invocation == 1 ? 0 : 2000); // if delay (other than the first time), wait 2 seconds after last keystroke to allow typing in the editor to continue
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
function validate(input, invocation, mode) : void { // mode 0 = immediate, 1 = delay (autorun), 2 = skip
	if (mode != 2){
		document.getElementById('interpolated').innerHTML = 'lexing...';
		console.log('lexing...');
	}
	setTimeout(()=>{
		if (invocation != invocations){
			return;
		}
		input = mode == 2 || input.length == 0 ? ' ' : input; // parser needs at least one character
		let errors : Error[] = [];
		const lexer = createLexer(input);
		lexer.removeErrorListeners();
		lexer.addErrorListener(new ConsoleErrorListener());
		if (mode != 2){
			document.getElementById('interpolated').innerHTML = 'parsing...';
			console.log('parsing...');
		}
		setTimeout(()=>{
			if (invocation != invocations){
				return;
			}
			const parser = createParserFromLexer(lexer);
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
			let parserTokens = tokensAsString(input, parser._interp._input.tokens, parser.symbolicNames);
			if (mode != 2){
				document.getElementById('interpolated').innerHTML = "interpolating...";
				console.log('interpolating...');
			}
			setTimeout(()=>{
				if (invocation != invocations){
					return;
				}
				var visitor = new TextTemplateVisitor();
				visitor.annotations['Tokens'] = parserTokens;
				visitor.errors = errors;
				visitor.model = model;
				visitor.input = input;
				visitor.bulletIndent = null; // start bulleting from 0,0
				folds = []; // folds will be computed while visiting
				var result = visitor.visitCompilationUnit(tree);
				if (invocation != invocations){
					return;
				}
				if (Array.isArray(result)){
					result = visitor.interpret(result);
				}
				let urlsBeingLoaded = [];
				Object.keys(urls).forEach((key : string) =>{
					if (!key.startsWith('/') && (key.split('//').length != 2 || key.split('//')[1].indexOf('/') == -1)){
						delete urls[key] // clean up incomplete urls
					} else {
						if (!urls[key].data){
							urlsBeingLoaded.push(key);
							if (!urls[key].loading){
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
													validate(visitor.model.getValue(), invocation, 0);
												}
											}, 0);
										}
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
			}, 1);
		}, 1);
	}, 1);
}
