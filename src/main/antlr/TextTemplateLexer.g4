lexer grammar TextTemplateLexer;

TEXT: ~[{}]+ ;
LBRACE: '{' -> pushMode(BRACED);
E_RBRACE: '}' -> type(RBRACE);

mode BRACED;
IDENTIFIER: [a-zA-Z_][a-zA-Z0-9_]* ;
DOT: '.';
RBRACE: '}' -> popMode;
WS: [ \t\r\n]+ ->skip; // allow white space in braced
LP: '(' -> pushMode(PARENED);
E_RP: ')';
E_COMMA: ',' ->type(COMMA);

mode PARENED;
ARGLBRACKET: '[';	
ARGUMENTTEXT: ~[(),{}" \t\r\n]+;
RP: ')' -> popMode;
QUOTE: '"' -> pushMode(QUOTED);
ARGLBRACE: '{' -> type(LBRACE),pushMode(BRACED);

COMMA: ',';
PAREN_BAD: [}(];

mode QUOTED;
RQUOTE: '"' ->type(QUOTE),popMode;
QUOTEDTEXT: ~["]+;




