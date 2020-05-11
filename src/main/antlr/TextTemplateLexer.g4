lexer grammar TextTemplateLexer;

COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF)	;
TEXT: ~[{}/ \n]+ ;
LBRACE: '{' -> pushMode(BRACED);
E_RBRACE: '}' -> type(RBRACE);
TEXT_SP: ' '+ ->type(TEXT);
TEXT_SLASH: '/' ->type(TEXT);
TEXT_NL: '\n' ->type(TEXT);


mode BRACED;
BRACED_COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF) ->skip;
IDENTIFIER: [a-zA-Z_][a-zA-Z0-9_]* ;
METHODNAME: '.' [a-zA-Z_][a-zA-Z0-9_]* '(' -> pushMode(PARENED);
DOT: '.';
ARROW: '=>';
RBRACE: '}' -> popMode;
WS: [ \t\r\n]+ ->skip; // allow white space in braced
LP: '(' -> pushMode(NESTED);
BRACED_RP: ')' ->type(RP)	;
BRACED_COMMA: ',' ->type(COMMA);
COLON : ':';
LBRACKET: '[' ->pushMode(BRACKETED);
BRACED_QUOTE: '"' ->type(QUOTE),pushMode(QUOTED);
BRACED_APOSTROPHE: '\'' ->type(APOSTROPHE),pushMode(APOSTROPHED);
AND: '&';
OR: '|';
NOT: '!';
BRACED_ILLEGAL: ([@#$%^*-={;<>?/\\+] | ']')+;

mode PARENED;
PARENED_COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF) ->skip;
PARENED_WS: [ \t\r\n]+ ->skip; // allow white space in braced
PARENED_BRACKET: '[' ->type(LBRACKET),pushMode(BRACKETED);	
ARGUMENTTEXT: ~[(),{}'" \t\r\n\u005b]+ ->type(TEXT); // u005b left bracket
RP: ')' -> popMode;
QUOTE: '"' -> pushMode(QUOTED);
APOSTROPHE: '\'' -> pushMode(APOSTROPHED);
PARENED_BRACE: '{' -> type(LBRACE),pushMode(BRACED);
COMMA: ',';
PARENED_ILLEGAL: [}(];

mode QUOTED;
QUOTED_QUOTE: '"' ->type(QUOTE),popMode;
fragment ESC: '\\' (["\\/bfnrt] | UNICODE);
fragment UNICODE : 'u' HEX HEX HEX HEX;
fragment HEX : [0-9a-fA-F];
QUOTED_TEXT: (ESC | ~["\\])* ->type(TEXT);
QUOTED_BAD_BACKSLASH: '\\' ~["\\/bfnrt];

mode APOSTROPHED;
APOSTROPHED_APOSTROPHE: '\'' ->type(APOSTROPHE),popMode;
APOSTROPHED_TEXT: ~[']* ->type(TEXT);

mode BRACKETED;
BRACKETED_COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF) ->type(COMMENT);
RBRACKET: ']' -> popMode;
BRACKETED_TEXT: ~[{}/ \n\u005d]+ ->type(TEXT); // u005d right bracket
BRACKETED_LBRACE: 	'{' -> type(LBRACE),pushMode(BRACED);
BRACKETED_RBRACE: '}' -> type(RBRACE);
BRACKETED_SP: ' '+ ->type(TEXT);
BRACKETED_SLASH: '/' ->type(TEXT);
BRACKETED_NL: '\n' ->type(TEXT);

mode NESTED;
NESTED_COMMENT5: [ ]+  '//' ~[\n]* ('\n' | EOF) ->skip;
NESTED_IDENTIFIER: [a-zA-Z_][a-zA-Z0-9_]* ->type(IDENTIFIER);
NESTED_METHODNAME: '.' [a-zA-Z_][a-zA-Z0-9_]* '(' -> type(METHODNAME),pushMode(PARENED);
NESTED_DOT: '.' ->type(DOT);
NESTED_WS: [ \t\r\n]+ ->skip; // allow white space in braced
NESTED_LP: '(' -> type(LP),pushMode(NESTED);
NESTED_RP: ')' ->type(RP),popMode;
NESTED_AND: '&' ->type(AND);
NESTED_OR: '|' ->type(OR);
NESTED_NOT: '!' ->type(NOT);
NESTED_ILLEGAL: ([@#$%^*-={;<>?/\\+] | ']')+;

