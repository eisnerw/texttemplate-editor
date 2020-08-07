/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />
import {createColorizeLexer} from './ParserFacade'
import {CommonTokenStream, error, InputStream} from '../../../node_modules/antlr4/index.js'
import ILineTokens = monaco.languages.ILineTokens;
import IToken = monaco.languages.IToken;

export class TextTemplateState implements monaco.languages.IState {
	public bMultilineComment = false;
	public sOpenBrackets = "";
    clone(): monaco.languages.IState {
        return new TextTemplateState(this.bMultilineComment, this.sOpenBrackets);
    }

    equals(other: TextTemplateState): boolean {
        return this.bMultilineComment == other.bMultilineComment && this.sOpenBrackets == other.sOpenBrackets;
    }

    constructor(bMultilineComment : boolean, sOpenBrackets : string) {
        this.bMultilineComment = bMultilineComment;
		this.sOpenBrackets = sOpenBrackets;
    }

}

export class TextTemplateTokensProvider implements monaco.languages.TokensProvider {
    getInitialState(): monaco.languages.IState {
        return new TextTemplateState(false, '');
    }

    tokenize(line: string, state: TextTemplateState): monaco.languages.ILineTokens {
        return tokensForLine(line, state.bMultilineComment, state.sOpenBrackets);
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
    endState: TextTemplateState;
    tokens: monaco.languages.IToken[];

    constructor(tokens: monaco.languages.IToken[], bMultilineComment : boolean, sOpenBrackets : string) {
        this.endState = new TextTemplateState(bMultilineComment, sOpenBrackets);
        this.tokens = tokens;
    }
}

export function tokensForLine(input: string, bMultilineComment : boolean, sOpenBrackets : string): monaco.languages.ILineTokens {
    let errorStartingPoints: number[] = [];

    class ErrorCollectorListener extends error.ErrorListener {
        syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
            errorStartingPoints.push(column)
        }
    }
	let relocate = bMultilineComment ? 2 : sOpenBrackets.length;
    const lexer = createColorizeLexer((bMultilineComment ? '/*' : sOpenBrackets)  + input);
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
 				if (token.column >= relocate || bMultilineComment){ // only look at tokens after the artificial tokens created by text in front of the input
					let tokenTypeName = lexer.symbolicNames[token.type];
					let myToken = new TextTemplateToken(tokenTypeName, token.column < 2 ? token.column : (token.column - relocate));
					myTokens.push(myToken);
					let lastOpenBracket = sOpenBrackets.length == 0 ? '' : sOpenBrackets[sOpenBrackets.length - 1];
					switch (myToken.scopes.replace('.texttemplate', '')){
						case 'slashstar':
							done = true; // don't go past the slash star because everything else is part of the comment (a completed pair is a 'comment')
							break;

						case 'rbrace':
						case 'rbracket':
						case 'rp':
						case 'rquote':
						case 'rapostrophe':
							sOpenBrackets = sOpenBrackets.substr(0, sOpenBrackets.length - 1);
							break;

						case 'lp':
							sOpenBrackets += '(';
							break;	

						case 'lbrace':
							sOpenBrackets += '{';
							break;

						case 'lbracket':
							sOpenBrackets += '[';
							break;

						case 'lquote':
							sOpenBrackets += '"'
							break;
							
						case 'lapostrophe':
							sOpenBrackets += '\'';
							break;
					}
				}				
            }
        }
    } while (!done);

    // Add all errors
    for (let e of errorStartingPoints) {
        myTokens.push(new TextTemplateToken("error.texttemplate", e));
    }
    myTokens.sort((a, b) => (a.startIndex > b.startIndex) ? 1 : -1)
	bMultilineComment = myTokens.length > 0 && myTokens[myTokens.length - 1].scopes == 'slashstar.texttemplate';
	if (bMultilineComment){
		myTokens[myTokens.length - 1].scopes = 'comment.texttemplate';
	}
    return new TextTemplateLineTokens(myTokens, bMultilineComment, sOpenBrackets);
}
