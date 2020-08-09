lexer grammar TextTemplateLexer;

SLASH_STAR: '/*' .*? '*/' -> skip;
COMMENT_LINE: '\n' [ \t]* '//' ~[\n]*  ->skip;
COMMENT_SKIP: [ \t]*  '//' ~[\n]* ('\n' [ \t]* '//' ~[\n]*)* ->skip;
CONTINUATION: [ \t]*  '`' [ \t]* '\n' [ \t]*;
CONTINUATION_COMMENT: [ \t]*  '`' [ \t]* '//'  ~[\n]* ('\n' [ \t]* '//' ~[\n]*)* '\n' [ \t]* ->type(CONTINUATION);
BULLET: [ \t]* '{.}';
TEXT: ~[{}/ \n]+ ;
LBRACE: '{' -> pushMode(BRACED);
E_RBRACE: '}' -> type(RBRACE);
SPACES: ' '+;
TEXT_SLASH: '/' ->type(TEXT);
NL: '\n';
SUBTEMPLATES: [ \t\n]+ 'Subtemplates:' [ \t\n]+;

mode BRACED;
BRACED_SLASH_STAR: '/*' .*? '*/' -> skip;
LBRACKET_CONTINUE: '[' ' '* '`' ~'\n'* '\n' ->type(LBRACKET),pushMode(BRACKETED);
BRACED_COMMENT:  '//' ~[\n]* ('\n' | EOF) ->skip;
IDENTIFIER: [@$a-zA-Z_^][a-zA-Z0-9_]* ;
METHODNAME: '.' [#@a-zA-Z_][a-zA-Z0-9_]* '(' -> pushMode(PARENED);
DOT: '.';
ARROW: '=>';
RELATIONAL: ('==' | '!=' | '=' | '<=' | '>=' | '<' | '>');
THINARROW: '->';
RBRACE: '}' -> popMode;
WS: [ \t\n]+ ->skip; // allow white space in braced
LP: '(' ->pushMode(NESTED);
BRACED_RP: ')' ->type(RP)	;
BRACED_COMMA: ',' ->type(COMMA);
COLON : ':';
LBRACKET_WHITE_SPACE: '['  [ \t]*  '\n' [ \t]* ->type(LBRACKET),pushMode(BRACKETED);
LBRACKET: '[' ->pushMode(BRACKETED);
BRACED_QUOTE: '"' ->type(QUOTE),pushMode(QUOTED);
BRACED_APOSTROPHE: '\'' ->type(APOSTROPHE),pushMode(APOSTROPHED);
AND: '&';
OR: '|';
NOT: '!';
POUND: '#';
DIGITS: ('0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9')+;
BRACED_ILLEGAL: ('%' | '*' | '-' | '=' | '{' | ';' | '<' | '>' | '?' | '\\' | ']')+;

mode PARENED;
PARENED_SLASH_STAR: '/*' .*? '*/' -> skip;
REGEX: '/' REGEXFIRSTCHAR REGEXCHAR* '/' ('g' | 'i' | 'm' | 's')*;
PARENED_COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF) ->skip;
PARENED_WS: [ \t\n]+ ->skip; // allow white space in braced
PARENED_BRACKET: '[' ->type(LBRACKET),pushMode(BRACKETED);	
ARGUMENTTEXT: ~[(),{}&|!.'"\t\n\u005b]+ ->type(TEXT); // u005b left bracket
PARENED_METHODNAME: '.' [#a-zA-Z_][a-zA-Z0-9_]* '(' ->type(METHODNAME),pushMode(PARENED);
RP: ')' -> popMode;
QUOTE: '"' -> pushMode(QUOTED);
APOSTROPHE: '\'' -> pushMode(APOSTROPHED);
PARENED_BRACE: '{' -> type(LBRACE),pushMode(BRACED);
COMMA: ',';
PARENED_AND: '&' ->type(AND);
PARENED_OR: '|' ->type(OR);
PARENED_NOT: '!' ->type(NOT);
PARENED_LP: '(' -> type(LP),pushMode(NESTED);
PARENED_DOT: '.' ->type(DOT);
PARENED_RELATIONAL: ('==' | '!=' | '=' | '<=' | '>=' | '<' | '>') ->type(RELATIONAL);
PARENED_ILLEGAL: [}];
fragment REGEXFIRSTCHAR : ~[*\r\n\u2028\u2029\\/[] | REGEXBACKSLASH | '[' REGEXCLASSCHAR* ']';
fragment REGEXCHAR : ~[\r\n\u2028\u2029\\/[] | REGEXBACKSLASH | '[' REGEXCLASSCHAR* ']';
fragment REGEXCLASSCHAR : ~[\r\n\u2028\u2029\]\\] | REGEXBACKSLASH;
fragment REGEXBACKSLASH: '\\' ~[\r\n\u2028\u2029];

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
BRACKETED_SLASH_STAR: '/*' .*? '*/' -> skip;
BRACKETED_COMMENT_LINE: '\n' [ \t]* '//' ~[\n]* ->skip;
BRACKETED_BULLET: [ \t]* '{.}' ->type(BULLET);
BRACKETED_COMMENT_SKIP: [ \t]*  '//' ~[\n]* ('\n' [ \t]* '//' ~[\n]*)* ->skip;
BRACKETED_CONTINUE: [ \t]*  '`' [ \t]* '\n' [ \t]* ->type(CONTINUATION);
BRACKETED_CONTINUATION_COMMENT: [ \t]*  '`' [ \t]* '//'  ~[\n]* ('\n' [ \t]* '//' ~[\n]*)* '\n' [ \t]*  ->type(CONTINUATION);
RBRACKET_WHITE_SPACE: [ \t]* '\n' [ \t]* ']' ->type(RBRACKET),popMode;
RBRACKETLP: '](' ->mode(PARENED);
RBRACKET: ']' -> popMode;
BRACKETED_TEXT: ~[{}/ \n\u005d]+ ->type(TEXT); // u005d right bracket
BRACKETED_LBRACE: 	'{' -> type(LBRACE),pushMode(BRACED);
BRACKETED_RBRACE: '}' -> type(RBRACE);
BRACKETED_SP: ' '+ ->type(SPACES);
BRACKETED_SLASH: '/' ->type(TEXT);
BRACKETED_NL: '\n' ->type(NL);
BRACKETED_SUBTEMPLATES: [ \t\n]+ 'Subtemplates:' [ \t\n]+ ->type(SUBTEMPLATES);

mode NESTED;
NESTED_SLASH_STAR: '/*' .*? '*/' -> skip;
NESTED_COMMENT5: [ ]+  '//' ~[\n]* ('\n' | EOF) ->skip;
NESTED_IDENTIFIER: [$a-zA-Z_][a-zA-Z0-9_]* ->type(IDENTIFIER);
NESTED_METHODNAME: '.' [a-zA-Z_][a-zA-Z0-9_]* '(' -> type(METHODNAME),pushMode(PARENED);
NESTED_DOT: '.' ->type(DOT);
NESTED_RELATIONAL: ('==' | '!=' | '=' | '<=' | '>=' | '<' | '>') ->type(RELATIONAL);
NESTED_WS: [ \t\n]+ ->skip; // allow white space in braced
NESTED_LP: '(' -> type(LP),pushMode(NESTED);
NESTED_RP: ')' ->type(RP),popMode;
NESTED_AND: '&' ->type(AND);
NESTED_OR: '|' ->type(OR);
NESTED_NOT: '!' ->type(NOT);
NESTED_ILLEGAL: ([@#%^*-={;<>?/\\+] | ']')+;

