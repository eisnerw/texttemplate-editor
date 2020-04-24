lexer grammar TextTemplateLexer;


// We're in the default mode; define our program tokens
WS: [ \n\r\t]+ -> skip;

CURLY_R: '}' -> popMode; // When we see this, revert to the previous context.

OPEN_STRING: '"' -> pushMode(STRING); // Switch context
ID: [A-Za-z_][A-Za-z0-9]*;

// Define rules on how tokens are recognized within a string.
// Note that complex escapes, like Unicode, are not illustrated here.
mode STRING;

ENTER_EXPR_INTERP: '$(' -> pushMode(DEFAULT_MODE); // When we see this, start parsing program tokens.

ID_INTERP: '$'[A-Za-z_][A-Za-z0-9_]*;
ESCAPED_DOLLAR: '\\$';
ESCAPED_QUOTE: '\\"';
TEXT: ~('$'|'\n'|'"')+; // This doesn't cover escapes, FYI.

CLOSE_STRING: '"' -> popMode; // Revert to the previous mode; our string is closed.
