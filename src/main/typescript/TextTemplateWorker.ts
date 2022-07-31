/// <reference path="./TextTemplateInterpreter.ts" />
const ctx: Worker = self as any;
import textTemplateInterpreter = require("../../main-generated/javascript/TextTemplateInterpreter.js");

let urlParms = {};
let parmId = 0;
let input = null;
let bProcessing = false;
let queuedInput = null;
function processResult(parm){
	switch (parm.type){
		case 'result':
			ctx.postMessage({type: 'result', result: parm.result, errors: parm.errors, hoverPositions: parm.hoverPositions, debugLog: parm.debugLog});
			if (queuedInput != null){
				input = queuedInput;
				queuedInput = null;
				interpret(input);
			} else {
				bProcessing = false;
			}
			break;
		case 'url':
			ctx.postMessage({type: 'url', path: parm.path, id: ++parmId});
			urlParms[parmId] = parm;
			break;
		case 'status':
			ctx.postMessage({type: 'status', status: parm.status});
			break;
	}
}
ctx.addEventListener("message", (event) => {
	const payload = event.data;
	switch (payload.type){
		case 'input':
			if (bProcessing){
				if (input != payload.input){
					queuedInput = payload.input;
				}
			} else {
				input = payload.input;
				bProcessing = true;
				interpret(input, {data: payload.data, computeHoverPositions: payload.computeHoverPositions});
			}
			break;

		case 'url':
			if (urlParms[payload.id]){
				urlParms[payload.id].success(payload.data);
				delete urlParms[payload.id];
			}
			break;
	}
});
function interpret(input, options?){
	try{
		textTemplateInterpreter.interpret(input, processResult, options);
	} catch (e){
		processResult({type: 'result', result: 'EXCEPTION ' + e.stack, errors: []});
	}
}