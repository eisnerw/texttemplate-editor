export class Externals {
	public static getMethod(methodName : string){
		if (methodName == 'test'){
			return testMethod;
		} else {
			return null;
		}
	}
	public static getValueFunction(functionName : string) {
		if (functionName == 'test'){
			return testFunction;
		} else {
			return null;
		}
	}
}
function testMethod(value: any, args : any, visitor : any) {
	let argValues = [];
	if (typeof value != 'string'){
		value = visitor.compose(value, 2);
	}
	if (args.constructor.name == 'ArgumentsContext'){
		for (let i = 0; i < args.children.length; i++){
			let arg = args.children[i].accept(visitor);
			if (arg !== undefined){ // remove result of commas
				if (arg.constructor.name == 'RegExp'){
					argValues.push(arg);
				} else {
					argValues.push(visitor.compose(arg, 0));
				}
			}
		}
	}
	if (argValues.length != 2){
		visitor.syntaxError('Invalid parameters for test function', args.parentCtx);
		return value;
	}
	return argValues[0] + value.toUpperCase() + argValues[1];
}
function testFunction(ctx : any, visitor : any) {
	let value = visitor.visitIdentifier(ctx);
	if (typeof value == 'string'){
		value = '>>' + value;
	}
	return value;
}
