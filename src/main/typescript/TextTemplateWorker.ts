const ctx: Worker = self as any;
import textTemplateInterpreter = require("../../main-generated/javascript/TextTemplateInterpreter.js");
class SieveOfEratosthenes {
  
    calculate(limit: number) {

      const sieve = [];
      const primes: number[] = [];
      let k;
      let l;

      sieve[1] = false;
      for (k = 2; k <= limit; k += 1) {
        sieve[k] = true;
      }

      for (k = 2; k * k <= limit; k += 1) {
        if (sieve[k] !== true) {
          continue;
        }
        for (l = k * k; l <= limit; l += k) {
          sieve[l] = false;
        }
      }

      sieve.forEach(function (value, key) {
        if (value) {
          this.push(key);
        }
      }, primes);

      return primes;

    }

}

const sieve = new SieveOfEratosthenes();
let urlParms = {};
let parmId = 0;
let input = null;
let bProcessing = false;
let queuedInput = null;
function processResult(parm){
	switch (parm.type){
		case 'result':
			ctx.postMessage({type: 'result', result: parm.result, errors: parm.errors });
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
				interpret(input);
			}
			break;

		case 'url':
			urlParms[payload.id].success(payload.data);
			delete urlParms[payload.id];
			break;

		case 'primes':
			const limit = payload.limit;
			const primes = sieve.calculate(limit);
			ctx.postMessage({type: 'result', result: primes });
			break;
	}
});
function interpret(input){
	try{
		textTemplateInterpreter.interpret(input, processResult);
	} catch (e){
		processResult({type: 'result', result: 'EXCEPTION ' + e.stack, errors: []});
	}
}