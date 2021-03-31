/// <reference path="../../../node_modules/monaco-editor/monaco.d.ts" />
/// <reference path="./TextTemplateWorker.ts" />
import {CommonTokenStream, InputStream, Token, error, Parser, CommonToken} from '../../../node_modules/antlr4/index.js'
import {TextTemplateLexer} from "../../main-generated/javascript/TextTemplateLexer.js"
import {TextTemplateColorizeLexer} from "../../main-generated/javascript/TextTemplateColorizeLexer.js"
import {TextTemplateParser} from "../../main-generated/javascript/TextTemplateParser.js"
import Worker from "worker-loader!../../main-generated/javascript/TextTemplateWorker.js";

var processedSubtemplates = null; // keeps a tree of the latest subtemplates and any local subtemplates within them, including where they were found in the editor

declare global {
  interface window {
    ParserFacade: any;
  }
}

export function createColorizeLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateColorizeLexer(chars);

    lexer.strictMode = false;
	window['ParserFacade'] = this;
    return lexer;
}

export function createLexer(input: String) {
    const chars = new InputStream(input);
    const lexer = new TextTemplateLexer(chars);

    lexer.strictMode = false;
    return lexer;
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
			if (folds != null){
				folds.push({
					start: tokenObject.line + numberBlankLines + lineOffset,
					end: tokenArray[tokenArray.length - 1].line + lineOffset,
					kind: monaco.languages.FoldingRangeKind.Region
				});
			}
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
						if (folds != null && parts[0].line != parts[6].line){
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

export function provideFoldingRanges(model, context, token) {
	folds = [];
	processedSubtemplates = processSubtemplates(model.getValue(), 0); // collect folds
	return folds;
}

export  function provideHover(model, position) {
	let lineHoverPosition = hoverPositions[position.lineNumber];
	if (!lineHoverPosition || !lineHoverPosition.columns[position.column]){
		return null;
	}
	return {
		range: new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
		contents: [
			{ value: '**' + lineHoverPosition.columns[position.column].variable + '**'},
			{ value: '```html\n' + lineHoverPosition.columns[position.column].values.join(', ') + '\n```' }
		]
	}
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
	// The following doesn't work for complicated template/subtemplate relationships
	/*
	let definition = null;
	let keyArray = (level + definitionName).split('.');
	for (let i = 0; definition == null && i < keyArray.length; i++){
		definition = subtemplateMap[keyArray.slice(i).join('.')];
	}
	if (definition == null){
		return;
	}
	return [{
        range: new monaco.Range(definition.line, definition.column + 1, definition.endLine, definition.endColumn + 1),
        uri: model.uri
    };
	*/
	let defs = []; // return multiple ranges
	Object.keys(subtemplateMap).forEach((key)=>{
		if (key.endsWith(definitionName)){
			let definition = subtemplateMap[key];
			defs.push({
				range: new monaco.Range(definition.line, definition.column + 1, definition.endLine, definition.endColumn + 1),
				uri: model.uri
			});
		}
	});
	return defs;
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
let folds : any = [];
let urls = {};
let invocations = 0;
let callsToValidate = 0;
let nStage = 0;
let hoverPositions = {};

export function runValidation(input, options) : void {
	let invocation = ++invocations;
	setTimeout(()=>{
		if (invocation == invocations){
			validate(input, invocation, options);
		}
	}, options.mode != 1 || invocation == 1 ? 0 : 2000); // if delay (other than the first time), wait 2 seconds after last keystroke to allow typing in the editor to continue
}

export function validate(input, invocation, options, callback?) : void { // options.mode 0 = immediate, 1 = delay (autorun when data changes), 2 = skip, 3 = node
	if (nStage == 1){
		return; // avoid processing due to editor changes on the first invocation
	} else if (nStage == 0){
		nStage++;
	}
	callsToValidate++;
	let editor = options ? options.editor : null;
	window["workerObject"] = window["workerObject"] || {loaded: false};
	if (!window["workerObject"].loaded){
		window["workerObject"].worker = new Worker();
		window["workerObject"].worker.onmessage = (event) => {
			let payload = event.data;
			switch (payload.type){
				case 'result':
					nStage = 2; // indicates that any changes will now be interpreted
					let monacoErrors = [];
					for (let e of payload.errors) {
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
                    document.getElementById('interpolated').innerHTML = payload.result;
                    document.getElementById('debuglog').innerHTML = payload.debugLog.join('<br />');
					hoverPositions = payload.hoverPositions;
					break;

				case 'url':
                    let urlPrefix = (payload.path.startsWith('/') && window['textTemplateOptions'] && window['textTemplateOptions']['urlPrefix']) ? window['textTemplateOptions']['urlPrefix'] : '';
                    logit('loading ' + urlPrefix + payload.path + '...');
					$.ajax({
						url: urlPrefix + payload.path,
						success: function (data) {
							if (data.Result === null){
								logit('Unable to GET ' + this.url + ': NOT FOUND.');
							}
							if (data.Result){
								data = data.Result.replace(/\r/g,''); // accomodate servers that pass back an object
							}
							logit('received ' + payload.path);
							window["workerObject"].worker.postMessage({type:'url', data: data, id: payload.id});
							if (data && data.error){
								window["workerObject"].worker.postMessage({type:'url', data: data, id: payload.id});
							} else {
								let splitPath = payload.path.split('/');
								if (splitPath.length > 1 && splitPath[1] == 'subtemplate'){
									editor.setValue(editor.getValue() + '\n/*SHARED*/{#' + splitPath[2] + ':' + data + '}/*SHARED*/');
									if (callsToValidate < 2){
										// only fold for the first pass
										editor.getAction('editor.foldAll').run();
									}
								}
							}
						}
						,error: function(obj, err, errorThrown){
							logit(payload.path + ' ERROR: ' + errorThrown);
							let msg = 'Unable to GET ' + this.url + '. Received error: "' + err + ' ' + errorThrown + '"';
							window["workerObject"].worker.postMessage({type:'url', data: {error: msg}, id: payload.id});
							console.error(msg);
						}
					});
					break;
				
				case 'status':
					logit(payload.status);
					break;
			}
		};
		window["workerObject"].loaded = true;
		window["workerObject"].worker.postMessage({type:'input', input: input, data: options.data, computeHoverPositions: true});
	}
	document.getElementById('interpolated').innerHTML = '';
	window["workerObject"].worker.postMessage({type:'input', input: input, data: options.data, computeHoverPositions: true});			
}
function logit(text){
	console.debug(text);
	let currentOutput = document.getElementById('interpolated').innerHTML;
	document.getElementById('interpolated').innerHTML = currentOutput + (currentOutput == '' ? '' : '\n') + text;
}
