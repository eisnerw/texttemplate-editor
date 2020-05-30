parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    templatecontents+ 
    EOF
    ;

subtemplateSection: SUBTEMPLATES TEXT* subtemplateSpecs;

subtemplateSpecs: subtemplatespec*;

subtemplatespec: templatecontexttoken TEXT*;

templatecontents: comment* (subtemplateSection | templatetoken | templatecontexttoken | text+);

comment: COMMENT+;

text: TEXT;

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: bracedarrow #braceArrow | bracedthinarrow #braceThinArrow | optionallyInvokedMethodable #bracedMethodable | conditionalexpression #bracedConditional;

methodInvoked: methodable methodInvocation+;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | methodInvoked #condition;

templatecontexttoken: LBRACE ((namedSubtemplate | optionallyInvokedMethodable) COLON | COLON) (namedSubtemplate | optionallyInvokedMethodable) RBRACE;

templatespec: namedSubtemplate | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET COMMENT* templatecontents* COMMENT* RBRACKET;

methodabletemplatespec: LBRACKET COMMENT* templatecontents* COMMENT* RBRACKETLP;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedthinarrow: conditionalexpression THINARROW optionallyInvokedMethodable;

bracedarrowtemplatespec: optionallyInvokedMethodable COMMA optionallyInvokedMethodable | optionallyInvokedMethodable;

methodable: QUOTE TEXT QUOTE #quoteLiteral | APOSTROPHE TEXT APOSTROPHE #apostropheLiteral | templatespec #methodableTemplatespec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #methodableIdentifer;

methodInvocation: (method|DOT methodabletemplatespec) (conditionalexpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvokedMethodable: (methodInvoked | methodable);

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templatetoken #tokenedArgument | bracketedtemplatespec #bracketedArgument | TEXT #textedArgument;

namedSubtemplate: POUND IDENTIFIER;
