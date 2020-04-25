/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />

import {CommonTokenStream, InputStream, Token, error, Parser} from '../../../node_modules/antlr4/index.js'
import {DefaultErrorStrategy} from '../../../node_modules/antlr4/error/ErrorStrategy.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"

class ConsoleErrorListener extends error.ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.log("ERROR " + msg);
    }
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

    // for some reason this isn't created, but it isn't used const tree = parser.compilationUnit();
    return errors;
}
