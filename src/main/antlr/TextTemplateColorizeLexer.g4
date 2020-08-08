lexer grammar TextTemplateColorizeLexer;

COMMENT: '//' ~[\n]*;
SLASH_STAR_COMMENT: '/*' .*? '*/' ->type(COMMENT);
SLASHSTAR: '/*';
TEXT: ~[{/]+ ;
LBRACE: '{' -> pushMode(BRACED);
TEXT_SLASH: '/' ->type(TEXT);
SUBTEMPLATES: 'Subtemplates:' [ \t\n]+ EOF;
ERROR: .;


mode BRACED;
BRACED_SLASH_STAR_COMMENT: '/*' .*? '*/' ->type(COMMENT);
BRACED_SLASH_STAR: '/*'->type(SLASHSTAR);
TICK: '`';
BRACED_COMMENT:  '//' ~[\n]* ('\n' | EOF) ->type(COMMENT);
POUNDIDENTIFIER: '#' [@$a-zA-Z_^][a-zA-Z0-9_]*;
IDENTIFIER: [@$a-zA-Z_^][a-zA-Z0-9_]* ;
KEYWORD: '.' ('ToUpper'|'GreaterThan'|'LessThan'|'Where'|'Exists' | '@BulletStyle' | '@MissingValue' | 'Anded' | 'Assert' | 'Case' | 'Count' | 'IfMissing' | 'Matches' | 'ToJson' | 'ToLower');
LP: '(' -> pushMode(PARENED);
DOT: '.';
ARROW: '=>';
THINARROW: '->';
RBRACE: '}' -> popMode;
WS: [ \t\n]+ ->skip; // allow white space in braced
BRACED_COMMA: ',' ->type(COMMA);
COLON : ':';
LBRACKET_WHITE_SPACE: '['  [ \t]*  '\n' [ \t]* ->type(LBRACKET),pushMode(BRACKETED);
LBRACKET: '[' ->pushMode(BRACKETED);
BRACED_QUOTE: '"' ->type(LQUOTE),pushMode(QUOTEDMODE);
LAPOSTROPHE: '\'' ->pushMode(APOSTROPHED);
AND: '&';
OR: '|';
NOT: '!';

BRACED_ILLEGAL: ([%*-={;<>?\\+] | ']')+ ->type(ERROR);

mode PARENED;
PARENED_SLASH_STAR_COMMENT: '/*' .*? '*/' ->type(COMMENT);
REGEX: '/' REGEXFIRSTCHAR REGEXCHAR* '/' ('g' | 'i' | 'm' | 's')*;
PARENED_SLASH_STAR: '/*' ->type(SLASHSTAR);
PARENED_COMMENT: [ ]+  '//' ~[\n]* ('\n' | EOF) ->type(COMMENT);
PARENED_WS: [ \t\n]+ ->skip; // allow white space in braced
PARENED_BRACKET: '[' ->type(LBRACKET),pushMode(BRACKETED);	
ARGUMENTTEXT: ~[(),{}&|!.'"\t\n\u005b]+ ->type(TEXT); // u005b left bracket
PARENED_KEYWORD: ('ToUpper'|'GreaterThan'|'LessThan'|'Where');
RP: ')' -> popMode;
LQUOTE: '"' -> pushMode(QUOTEDMODE);
PARENED_APOSTROPHE: '\'' ->type(LAPOSTROPHE),pushMode(APOSTROPHED);
PARENED_BRACE: '{' -> type(LBRACE),pushMode(BRACED);
COMMA: ',';
PARENED_AND: '&' ->type(AND);
PARENED_OR: '|' ->type(OR);
PARENED_NOT: '!' ->type(NOT);
PARENED_LP: '(' -> type(LP),pushMode(NESTED);
PARENED_DOT: '.' ->type(DOT);
PARENED_ILLEGAL: [.] ->type(ERROR);
fragment REGEXFIRSTCHAR : ~[*\r\n\u2028\u2029\\/[] | REGEXBACKSLASH | '[' REGEXCLASSCHAR* ']';
fragment REGEXCHAR : ~[\r\n\u2028\u2029\\/[] | REGEXBACKSLASH | '[' REGEXCLASSCHAR* ']';
fragment REGEXCLASSCHAR : ~[\r\n\u2028\u2029\]\\] | REGEXBACKSLASH;
fragment REGEXBACKSLASH: '\\' ~[\r\n\u2028\u2029];

mode QUOTEDMODE;
RQUOTE: '"' ->popMode;
fragment ESC: '\\' (["\\/bfnrt] | UNICODE);
fragment UNICODE : 'u' HEX HEX HEX HEX;
fragment HEX : [0-9a-fA-F];
QUOTED: (ESC | ~["\\])*;
QUOTED_BAD_BACKSLASH: '\\' ~["\\/bfnrt] ->type(ERROR);

mode APOSTROPHED;
RAPOSTROPHE: '\'' ->popMode;
APOSTROPHED_TEXT: ~[']* ->type(QUOTED);

mode BRACKETED;
BRACKETED_SLASH_STAR_COMMENT: '/*' .*? '*/' ->type(COMMENT);
BRACKETED_SLASH_STAR: '/*' ->type(SLASHSTAR);
BRACKETED_COMMENT_LINE: '\n' [ \t]* '//' ~[\n]* ->type(COMMENT);
BULLET: [ \t]* '{.}' ;
BRACKETED_COMMENT_SKIP: [ \t]*  '//' ~[\n]* ('\n' [ \t]* '//' ~[\n]*)* ->type(COMMENT);
BRACKETED_TICK: '`';
RBRACKET_WHITE_SPACE: [ \t]* '\n' [ \t]* ']' ->type(RBRACKET),popMode;
RBRACKET: ']' -> popMode;
BRACKETED_TEXT: ~[{}/\n\u005d]+ ->type(TEXT); // u005d right bracket
BRACKETED_LBRACE: 	'{' -> type(LBRACE),pushMode(BRACED);
BRACKETED_RBRACE: '}' -> type(RBRACE);
BRACKETED_SLASH: '/' ->type(TEXT);
BRACKETED_SUBTEMPLATES: 'Subtemplates:' [ \t\n]+ EOF->type(SUBTEMPLATES);

mode NESTED;
NESTED_SLASH_STAR_COMMENT: '/*' .*? '*/' ->type(COMMENT);
NESTED_SLASH_STAR: '/*' ->type(SLASHSTAR);
NESTED_IDENTIFIER: [$a-zA-Z_][a-zA-Z0-9_]* ->type(IDENTIFIER);
NESTED_KEYWORD: ('ToUpper'|'GreaterThan'|'LessThan'|'Where') ->type(KEYWORD);
NESTED_DOT: '.' ->type(DOT);
NESTED_WS: [ \t\n]+ ->skip; // allow white space in braced
NESTED_LP: '(' -> type(LP),pushMode(NESTED);
NESTED_RP: ')' ->type(RP),popMode;
NESTED_AND: '&' ->type(AND);
NESTED_OR: '|' ->type(OR);
NESTED_NOT: '!' ->type(NOT);
NESTED_ILLEGAL: . ->type(ERROR);

