lexer grammar TextTemplateLexer;




LBRACE: '{' -> mode(EMBEDDED);
TEXT: ~[\\{}]+ ;
E_RBRACE: '}' -> type(RBRACE);
mode EMBEDDED;
IDENTIFIER: [a-zA-Z_][a-zA-Z0-9_]* ;
RBRACE: '}' -> mode(DEFAULT_MODE);
WS: [ \t\r\n]+;

