parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text* templatetoken text* | templatecontexttoken | text+;

text: (texts+=TEXT) COMMENT*;

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: QUOTE TEXT QUOTE | APOSTROPHE TEXT APOSTROPHE | bracedarrow | identifier methodInvocation* | conditionalexpression;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | identifier methodInvocation+ #condition;
	
templatecontexttoken: LBRACE ((identifier methodInvocation* | QUOTE TEXT QUOTE) COLON | COLON) templatespec RBRACE;

templatespec: identifier | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET texttemplate* RBRACKET;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedarrowtemplatespec: templatespec COMMA templatespec | templatespec;

identifier: IDENTIFIER;

methodInvocation: DOT method LP arguments* RP;

method: FUNCTION;

arguments: argument (COMMA argument)*;

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templatetoken #tokenedArgument | bracketedtemplatespec #bracketedArgument | TEXT #textedArgument;
