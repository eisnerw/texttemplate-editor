parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=templatecontents)+
    EOF
    ;

templatecontents: comment* (templatetoken | templatecontexttoken | text+);

comment: COMMENT+;

text: (texts+=TEXT);

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: bracedarrow #braceArrow | (evaluatedValue | identifier) #braceIdentifier | conditionalexpression #braceConditional;

evaluatedValue: identifier methodInvocation+;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | evaluatedValue #condition;

templatecontexttoken: LBRACE ((evaluatedValue | identifier) COLON | COLON) templatespec RBRACE;

templatespec: identifier | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET COMMENT* templatecontents* COMMENT* RBRACKET methodInvocation*;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedarrowtemplatespec: templatespec COMMA templatespec | templatespec;

identifier: QUOTE TEXT QUOTE #quoteLiteral | APOSTROPHE TEXT APOSTROPHE #apostropheLiteral | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #identifierValue;

methodInvocation: method (conditionalexpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templatetoken #tokenedArgument | bracketedtemplatespec #bracketedArgument | TEXT #textedArgument;
