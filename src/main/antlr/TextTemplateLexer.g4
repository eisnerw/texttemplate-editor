lexer grammar TextTemplateLexer;

COMMENT1: [ ]+  '/' '/' ~[\n]* '\n' ->skip;
TEXT: ~[{} \n]+ ;
LBRACE: '{' -> pushMode(BRACED);
E_RBRACE: '}' -> type(RBRACE);
TEXT_SP: ' '+ ->type(TEXT);
TEXT_SLASH: '/' ->type(TEXT);
TEXT_NL: '\n' ->type(TEXT);


mode BRACED;
COMMENT2: [ ]+  '/' '/' ~[\n]* '\n' ->skip;
IDENTIFIER: [a-zA-Z_][a-zA-Z0-9_]* ;
DOT: '.';
ARROW: '=>';
RBRACE: '}' -> popMode;
WS: [ \t\r\n]+ ->skip; // allow white space in braced
LP: '(' -> pushMode(PARENED);
E_RP: ')';
E_COMMA: ',' ->type(COMMA);
COLON : ':';
LBRACKET: '[' ->pushMode(BRACKETED);
E_QUOTE: '"' ->type(QUOTE);
E_ILLEGAL_BRACED: ([!@#$%^&*-={;<>?/\\+] | ']')+;

mode PARENED;
WS2: [ \t\r\n]+ ->skip; // allow white space in braced
COMMENT3: [ ]+  '/' '/' ~[\n]* '\n' ->skip;
ARGLBRACKET: '[' ->type(LBRACKET),pushMode(BRACKETED);	
ARGUMENTTEXT: ~[(),{}'" \t\r\n\u005b]+; // u005b left bracket
RP: ')' -> popMode;
QUOTE: '"' -> pushMode(QUOTED);
APOSTROPHE: '\'' -> pushMode(APOSTROPHED);
ARGLBRACE: '{' -> type(LBRACE),pushMode(BRACED);

COMMA: ',';
E_PAREN: [}(];

mode QUOTED;
RQUOTE: '"' ->type(QUOTE),popMode;
QUOTEDTEXT: ~["]* ->type(ARGUMENTTEXT);

mode APOSTROPHED;
RAPOSTROPHE: '\'' ->type(APOSTROPHE),popMode;
APOSTROPHEDTEXT: ~[']* ->type(ARGUMENTTEXT);

mode BRACKETED;
COMMENT4: [ ]+  '/' '/' ~[\n]* '\n' ->skip;
RBRACKET: ']' -> popMode;
BRACKETEDTEXT: ~[{}\u005d]+ ->type(TEXT); // u005d right bracket
BRACKETEDLBRACE: '{' -> type(LBRACE),pushMode(BRACED);
EE_RBRACE: '}' -> type(RBRACE);




