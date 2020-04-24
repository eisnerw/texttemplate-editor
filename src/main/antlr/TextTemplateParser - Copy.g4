parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (inputs+=input)*
    (texttemplates+=texttemplate)*
    (outputs+=output)*
    EOF
    ;

eol:
    NL
    ;

input:
	INPUT_KW ID eol
    ;

output:
    OUTPUT_KW ID eol
    ;

texttemplate:
	target=ID EQUAL value=expression eol
	;

expression:
	NUMBER_LIT
	| ID
	| LPAREN expression RPAREN
	| expression operator=(MUL|DIV) expression
	| expression operator=(MINUS|PLUS) expression
	| MINUS expression
	;
	    