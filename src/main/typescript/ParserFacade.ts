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

class TextTemplateVisitor extends TextTemplateParserVisitor {
	context : any;
	visitText = function(ctx){
		return ctx.getText();
	};
	visitIdentifierValue = function(ctx) {
		var key = ctx.getText();
		if (!this.context){
			return "ERROR: No Context";
		}
		var keys = key.split('.');
		
		var Document = this.context.Document;
		if (!Document){
			return "ERROR: No Document";
		}
		if (!Document[key]){
			return null;
		}
		return Document[key];
	};
	visitTemplatetoken = function(ctx) {
		// there are three children, the left brace, the token, and the right brace
		// compute the value of the token and return it as a string.
		return ctx.children[1].accept(this).join("");
	};
	visitTemplatecontents = function(ctx) {
		var value = this.visitChildren(ctx);
		return value != null ? value.join("") :  "";
	};
	visitTemplatecontexttoken = function(ctx) {
		var oldContext = this.context;
		this.context = ctx.children[1].accept(this);
		if (typeof this.context === "string"){
			try{
				this.context = JSON.parse(this.context);
			} catch(e){
				this.context = oldContext;
				return "bad JSON";
			}
			var result = ctx.children[3].accept(this)[0];
			this.context = oldContext;
			return result.slice(1, result.length).join(""); // remove the (undefined) results from the brackets
		}
		return this.visitChildren(ctx);
	};
	visitCompilationUnit = function(ctx) {
		return this.visitChildren(ctx).join("");
	};
	visitMethod = function(ctx) {
		return ctx.getText();
	};
	visitBraceIdentifier = function(ctx) {
		var children = this.visitChildren(ctx);
		return [children[0] + (children[1] ? ('-'+children[1].join('-')) : "")];
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
		let methodArguments: string[] = children[3]
		let methodSpec: string[] = [];
		methodSpec.push(children[1]); // method name
		if (methodArguments){
			for (let i = 0; i < methodArguments.length; i += 2){
				methodSpec.push(methodArguments[i]);
			}
		}
		return methodSpec;
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
	visitBracketedArgument = function(ctx) {
		return this.visitChildren(ctx);
	};
	visitTextedArgument = function(ctx) {
		return ctx.getText();
	};
	visitComment = function(ctx) {
		return " ";
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
