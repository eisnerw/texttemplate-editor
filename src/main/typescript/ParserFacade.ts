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
class TemplateData {
	private dictionary = {};
	private list: TemplateData[] = [];
	type: string;
	constructor(jsonData: string | {} | []) {
		let json: {};
		if (typeof jsonData == 'string') {
			json = JSON.parse(jsonData);
		}
		else if (Array.isArray(jsonData)) {
			this.type = 'list';
			let array: [] = jsonData;
			array.forEach((item) => {
				this.list.push(new TemplateData(item));
			});
			return;
		} else {
			json = jsonData;
		}
		this.type = 'dictionary';
		this.dictionary['^'] = this; // make sure that the top level points to itself
		if (Array.isArray(json)){
			// the json string resulted in an error.  Convert it into a dictionary
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
}

class TextTemplateVisitor extends TextTemplateParserVisitor {
	context : TemplateData;
	subtemplates : any = {};
	visitText = function(ctx){
		return ctx.getText();
	};
	visitMethodableIdentifer = function(ctx) {
		var key = ctx.getText();
		if (!this.context){
			return 'ERROR: No Context';
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
		if (Array.isArray(value) && Array.isArray(value[0]) && value[0].length > 1){
			let newValue : string[] = [];
			value[0].forEach((val)=>{
				if (typeof val == 'string'){
					val.split('\n').forEach((subval)=>{
						newValue.push(subval);
					});
				}
			});
			value[0] = '\n    ' + newValue.join('\n    ') + '\n';
		}
		if (!ctx.children || ctx.children[0].constructor.name == 'SubtemplateSectionContext'){
			return ''; //prevent displaying the Subtemplate section and avoid error for invalid brace 
		}
		return value != null ? value.join('') :  '';
	};
	visitTemplatecontexttoken = function(ctx) {
		if (ctx.children.length < 3){
			return null; // invalid
		}
		let oldContext : TemplateData = this.context;
		let bHasContext : boolean = ctx.children[1].getText() != ':'; // won't change context if format {:[template]}
		if (bHasContext){ 
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
					return 'bad JSON for template context';
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
		let result : string[] = this.visitChildren(ctx);
		return result.splice(0, result.length - 1).join(''); // remove the result of the <EOF> token
	};
	visitMethod = function(ctx) {
		let methodName : string = ctx.getText();
		return methodName.substr(1, methodName.length - 2);  // drop parens
	};
	visitMethodInvoked = function(ctx) {
		let value : any = [];
		if (this.context && this.context.type == 'list'){
			// create an arry of results and then run the method on the array
			this.context.iterateList(()=>{
				value.push(ctx.children[0].accept(this));
			});
		} else {
			value = ctx.children[0].accept(this);
		}
		var children = this.visitChildren(ctx);
		// call each method, which follow the identifier value
		children.slice(1).forEach((child) => {
			let method : string = child[0];
			var args = child[1]
			if (Array.isArray(value) && (method == 'ToUpper' || method == 'ToLower' || method == 'Matches')){
				let computedValue : string[] = [];
				value.forEach((val) =>{
					computedValue.push(this.callMethod(method, val, args));
				});
				value = computedValue;
			} else {
				value = this.callMethod(method, value, args);
			}
		});
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
		let result : boolean = ctx.children[0].accept(this);
		if (Array.isArray(result)){
			result = result[0]; // TODO:why is this one level deep????
		}
		if (result){
			return this.visitChildren(ctx.children[2].children[0]); // true
		}
		return ''; // false means ignore this token
	};
	visitBracedarrow = function(ctx) {
		let result : boolean = ctx.children[0].accept(this);
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
		let leftCondition : boolean = this.visitChildren(ctx.children[0])[0];
		if (!leftCondition && operator == '&'){
			return false;
		}
		if (leftCondition && operator == '|') {
			return true;
		}
		return this.visitChildren(ctx.children[2])[0];
	};	
	visitBracketedtemplatespec = function(ctx) {
		let result : [] = this.visitChildren(ctx);
		return result.slice(1, result.length).join(''); // ignore the brackets
	};
	visitMethodableTemplatespec = function(ctx) {
		let value : any = [];
		if (this.context && this.context.type == 'list'){
			this.context.iterateList(()=>{
				value.push(this.visitChildren(ctx)[0]);
			});
		} else {
			value.push(this.visitChildren(ctx)[0]);
		}
		return value;
	}
	visitNamedSubtemplate = function(ctx) {
		if (this.context && this.context.type == 'list'){
			// compute a result for each dictionary in the list
			let result : any = [];
			this.context.iterateList(()=>{
				result.push(this.visitNamedSubtemplate(ctx)); // recurse with each dictionary in the list
			});
			return result;
		} else {
			let subtemplateName : string = ctx.getText();
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
			const lexer = createLexer(this.subtemplates[subtemplateName]);
			const parser = createParserFromLexer(lexer);
			const tree = parser.compilationUnit();
			return this.visitCompilationUnit(tree);
		}
	}
	visitSubtemplateSpecs = function(ctx) {
		if (ctx.children){
			ctx.children.forEach((child)=>{
				if (child.children[0].children[1].constructor.name == 'NamedSubtemplateContext'){
					let templateString : string = child.children[0].children[3].getText();
					this.subtemplates[child.children[0].children[1].getText()] = templateString.substr(1, templateString.length - 2);
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

	callMethod = function(method : string, value : any, args: any){
		if (typeof value != 'string' && (method == 'ToUpper' || method == 'Matches' || method == 'ToLower')){
 			if (method != 'Matches') {
				return value;
			}
			value = value.toString();
		}
		switch (method){
			case 'ToUpper':
				value = <string>value.toUpperCase();
				break;
			case 'ToLower':
				value = <string>value.toLowerCase();
				break;
			case 'Matches':
				let matches : boolean = false;
				args.forEach((arg)=>{
					if (arg == value){
						matches = true;
					}
				});
				value = matches;
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
				if (value == undefined){
					value = false;
				} else {
					value = true;
				}
				break;
				
			case 'Count':
				if (value == undefined){
					value = 0;
				} else if (value instanceof TemplateData && value.type == 'list'){
					value = value.count();
				} else {
					value = 1;
				}
				break;
				
			default:
				value = value + '[.' + method + '(' + args.join(', ') + ')]';
				break;
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

export function validate(input, model) : Error[] {
    let errors : Error[] = [];
    const lexer = createLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ConsoleErrorListener());

    const parser = createParserFromLexer(lexer);
    parser.removeErrorListeners();
    parser.addErrorListener(new CollectorErrorListener(errors));
    parser._errHandler = new TextTemplateErrorStrategy();

    const tree = parser.compilationUnit();
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
	let treeJson : string = JSON.stringify(tree, getCircularReplacer());
	let parsed : string = '';
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
	var visitor = new TextTemplateVisitor();
	folds = []; // folds will be computed while visiting
	var result = visitor.visitCompilationUnit(tree);
    document.getElementById('parsed').innerHTML = parsed.replace(/\n/g,'\\n').replace(/\t/g,'\\t');
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
							model.undo(); // strange way of getting the model to revalidate
							model.redo();
						}
					}
				});
			}
		}
	});
    return errors;
}
