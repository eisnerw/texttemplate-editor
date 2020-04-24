/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />
import {createLexer} from './ParserFacade'
import {CommonTokenStream, error, InputStream} from '../../../node_modules/antlr4/index.js'
import ILineTokens = monaco.languages.ILineTokens;
import IToken = monaco.languages.IToken;

export class TextTemplateState implements monaco.languages.IState {
    clone(): monaco.languages.IState {
        return new TextTemplateState();
    }

    equals(other: monaco.languages.IState): boolean {
        return true;
    }

}

export class TextTemplateTokensProvider implements monaco.languages.TokensProvider {
    getInitialState(): monaco.languages.IState {
        return new TextTemplateState();
    }

    tokenize(line: string, state: monaco.languages.IState): monaco.languages.ILineTokens {
        // So far we ignore the state, which is not great for performance reasons
        return tokensForLine(line);
    }

}

const EOF = -1;

class TextTemplateToken implements IToken {
    scopes: string;
    startIndex: number;

    constructor(ruleName: String, startIndex: number) {
        this.scopes = ruleName.toLowerCase() + ".texttemplate";
        this.startIndex = startIndex;
    }
}

class TextTemplateLineTokens implements ILineTokens {
    endState: monaco.languages.IState;
    tokens: monaco.languages.IToken[];

    constructor(tokens: monaco.languages.IToken[]) {
        this.endState = new TextTemplateState();
        this.tokens = tokens;
    }
}

export function tokensForLine(input: string): monaco.languages.ILineTokens {
    let errorStartingPoints: number[] = [];

    class ErrorCollectorListener extends error.ErrorListener {
        syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
            errorStartingPoints.push(column)
        }
    }

    const lexer = createLexer(input);
    lexer.removeErrorListeners();
    let errorListener = new ErrorCollectorListener();
    lexer.addErrorListener(errorListener);
    let done = false;
    let myTokens: monaco.languages.IToken[] = [];
    do {
        let token = lexer.nextToken();
        if (token == null) {
            done = true
        } else {
            // We exclude EOF
            if (token.type == EOF) {
                done = true;
            } else {
                let tokenTypeName = lexer.symbolicNames[token.type];
                let myToken = new TextTemplateToken(tokenTypeName, token.column);
                myTokens.push(myToken);
            }
        }
    } while (!done);

    // Add all errors
    for (let e of errorStartingPoints) {
        myTokens.push(new TextTemplateToken("error.texttemplate", e));
    }
    myTokens.sort((a, b) => (a.startIndex > b.startIndex) ? 1 : -1)

    return new TextTemplateLineTokens(myTokens);
}
