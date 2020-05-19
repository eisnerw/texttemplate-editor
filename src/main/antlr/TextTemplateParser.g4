parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=templatecontents)+
    EOF
    ;

templatecontents: comment* (templatetoken | templatecontexttoken | text+);

comment: COMMENT+;

text: TEXT;

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: bracedarrow #braceArrow | optionallyInvokedMethodable #bracedMethodable | conditionalexpression #bracedConditional;

methodInvoked: methodable methodInvocation+;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | methodInvoked #condition;

templatecontexttoken: LBRACE (optionallyInvokedMethodable COLON | COLON) (subtemplate | optionallyInvokedMethodable) RBRACE;

templatespec: subtemplate | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET COMMENT* templatecontents* COMMENT* RBRACKET;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedarrowtemplatespec: optionallyInvokedMethodable COMMA optionallyInvokedMethodable | optionallyInvokedMethodable;

methodable: QUOTE TEXT QUOTE #quoteLiteral | APOSTROPHE TEXT APOSTROPHE #apostropheLiteral | templatespec #methodableTemplatespec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #methodableIdentifer;

methodInvocation: method (conditionalexpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvokedMethodable: (methodInvoked | methodable);

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templatetoken #tokenedArgument | bracketedtemplatespec #bracketedArgument | TEXT #textedArgument;

subtemplate: POUND IDENTIFIER;
