/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />

import {CommonTokenStream, InputStream, Token, error, Parser, CommonToken} from '../../../node_modules/antlr4/index.js'
import {DefaultErrorStrategy} from '../../../node_modules/antlr4/error/ErrorStrategy.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"
import {TextTemplateParserVisitor} from "../../main-generated/javascript/TextTemplateParserVisitor.js"

class ConsoleErrorListener extends error.ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.log("ERROR " + msg);
    }
}
class TemplateData {
	private dictionary = {};
	private list: [TemplateData];
	type: string;
	constructor(jsonData: string | {} | []) {
		let json: {};
		if (typeof jsonData == "string") {
			json = JSON.parse(jsonData.toString());
		} else if (Array.isArray(jsonData)) {
			this.type = "list";
			let array: [] = jsonData;
			array.forEach((item) => {
				this.list.push(new TemplateData(item));
			});				
		} else {
			json = jsonData;
		}
		this.type = "dictionary";
		this.dictionary['^'] = this; // make sure that the top level points to itself
		Object.keys(json).forEach((keyname) => {
			let value: any = json[keyname];
			if (typeof value == "object") {
				this.dictionary[keyname] = new TemplateData(value);
				this.dictionary[keyname].dictionary['^'] = this; // allows ^.^.variable name
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
}


class TextTemplateVisitor extends TextTemplateParserVisitor {
	context : TemplateData;
	visitText = function(ctx){
		return ctx.getText();
	};
	visitMethodableIdentifer = function(ctx) {
		var key = ctx.getText();
		if (!this.context){
			return "ERROR: No Context";
		}
		return this.context.getValue(key);
	};
	visitTemplatetoken = function(ctx) {
		// there are three children, the left brace, the token, and the right brace
		return ctx.children[1].accept(this);
	};
	visitTemplatecontents = function(ctx) {
		var value = this.visitChildren(ctx);
		return value != null ? value.join("") :  "";
	};
	visitTemplatecontexttoken = function(ctx) {
		let oldContext : TemplateData = this.context;
		let context : any = ctx.children[1].children[0].accept(this);
		if (typeof context === "string"){
			try{
				this.context = new TemplateData(context);
			} catch(e){
				this.context = oldContext;
				return "bad JSON for template context";
			}
		} else {
			this.context = context;
		}
		if (!ctx.children[3].getText()){
			// protect code against illegal bracketted expression while editing
			return null;
		}
		var result = ctx.children[3].accept(this);
		if (result) {
			result = result[0];
		}
		this.context = oldContext;
		return result;
	};
	visitCompilationUnit = function(ctx) {
		return this.visitChildren(ctx).join("");
	};
	visitMethod = function(ctx) {
		let methodName : string = ctx.getText();
		return methodName.substr(1, methodName.length - 2);  // drop parens
	};
	visitMethodInvoked = function(ctx) {
		var children = this.visitChildren(ctx);
		let value : any = children[0];
		// for now, convert all values into strings
		if (Array.isArray(value)){
			value = value.join(', ');
		}
		if (children.length > 1){
			children.slice(1).forEach((child) => {
				let method : string = child[0];
				var args = child[1];
				//if (args.length == 0 && (method == 'ToUpper' || method == 'ToLower')){
					switch (method){
						case "ToUpper":
							value = <string>value.toUpperCase();
							break;
						case "ToLower":
							value = <string>value.toLowerCase();
							break;
						case "Matches":
							let matches : boolean = false;
							args.forEach((arg)=>{
								if (arg == value){
									matches = true;
								}
							});
							value = matches;
							break;
						default:
							value = value + '[.' + method + '(' + args.join(', ') + ')]';
							break;
					}
				//} else {
				//	value = value + '[.' + method + '(' + args.join(', ') + ')]';
				//}
			});
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
		return ctx.children[1].getText().replace(/\\n/g,"\n").replace(/\\'/g,"'").replace(/\\\\/g,"\\").replace(/\\b/g,"\b").replace(/\\f/g,"\f").replace(/\\r/g,"\r").replace(/\\t/g,"\t").replace(/\\\//g,"\/"); // handle backslash plus '\/bfnrt
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
		return " ";
	};
	visitBracedarrow = function(ctx) {
		let result : boolean = ctx.children[0].accept(this);
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
		return [result.slice(1, result.length).join("")]; // ignore the brackets
	};
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

export function validate(input) : Error[] {
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
		if (typeof value === "object" && value !== null) {
		  if (seen.has(value)) {
			return;
		  }
		  seen.add(value);
		}
		return value;
	  };
	};
	let treeJson : string = JSON.stringify(tree, getCircularReplacer());
	let parsed : string = "";
	try{
		let treeTokens : CommonToken[] = parser._interp._input.tokens;
		let symbolicNames : string[] = parser.symbolicNames;
		
		for (let e of treeTokens){
			if (e.type != -1) {
				parsed += symbolicNames[e.type] + "(" + input.substring(e.start, e.stop + 1) + ") ";
			}
		}
	} catch(err) {
		parsed = '*****ERROR*****';
	}
	var visitor = new TextTemplateVisitor();
	var result = visitor.visitCompilationUnit(tree);
    document.getElementById("parsed").innerHTML = parsed.replace(/\n/g,'\\n').replace(/\t/g,'\\t');
	document.getElementById("interpolated").innerHTML = result;
    return errors;
}
