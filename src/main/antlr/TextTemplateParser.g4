parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text* templatetoken text* | templatecontexttoken | text+;

text: (texts+=TEXT) COMMENT*;

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: QUOTE TEXT QUOTE | APOSTROPHE TEXT APOSTROPHE | bracedarrow | identifier method* | conditionalexpression;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | identifier method+ #condition;
	
templatecontexttoken: LBRACE ((identifier method* | QUOTE TEXT QUOTE) COLON | COLON) templatespec RBRACE;

templatespec: identifier | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET texttemplate* RBRACKET;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedarrowtemplatespec: templatespec COMMA templatespec | templatespec;

identifier: IDENTIFIER;

method: DOT FUNCTION LP arguments* RP;

arguments: argument (COMMA argument)*;

argument: QUOTE TEXT* QUOTE | APOSTROPHE TEXT* APOSTROPHE | templatetoken | bracketedtemplatespec | TEXT;
