parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
	beginningIndent?
    templatecontents+ 
    EOF
    ;

subtemplateSection: SUBTEMPLATES text* subtemplateSpecs;

subtemplateSpecs: subtemplatespec*;

subtemplatespec: templatecontexttoken text*;

templatecontents: comment? (subtemplateSection | indent | templatetoken | templatecontexttoken | text+);

indent: bulletHolder indented;

bulletHolder: NL SPACES? LBRACE DOT RBRACE comment? SPACES? ;

indented: (comment? (templatetoken | templatecontexttoken | text+))+;

beginningIndent: beginningBulletHolder indented;

beginningBulletHolder: SPACES? LBRACE DOT RBRACE SPACES?;

comment: COMMENT+;

text: TEXT | NL | SPACES;

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: bracedarrow #braceArrow | bracedthinarrow #braceThinArrow | optionallyInvokedMethodable #bracedMethodable | conditionalexpression #bracedConditional;

methodInvoked: methodable methodInvocation+;

conditionalexpression: LP conditionalexpression RP #nestedConditional | NOT conditionalexpression #notConditional | conditionalexpression (AND|OR) conditionalexpression #logicalOperator | methodInvoked #condition;

templatecontexttoken: LBRACE ((namedSubtemplate | optionallyInvokedMethodable) COLON | COLON) (namedSubtemplate | optionallyInvokedMethodable) RBRACE;

templatespec: namedSubtemplate | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET COMMENT? beginningIndent? templatecontents* COMMENT* RBRACKET;

methodabletemplatespec: LBRACKET COMMENT? beginningIndent? templatecontents* COMMENT* RBRACKETLP;

bracedarrow: conditionalexpression ARROW bracedarrowtemplatespec;

bracedthinarrow: conditionalexpression THINARROW optionallyInvokedMethodable;

bracedarrowtemplatespec: optionallyInvokedMethodable COMMA optionallyInvokedMethodable | optionallyInvokedMethodable;

methodable: QUOTE TEXT QUOTE #quoteLiteral | APOSTROPHE TEXT APOSTROPHE #apostropheLiteral | templatespec #methodableTemplatespec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #methodableIdentifer;

methodInvocation: (method|DOT methodabletemplatespec) (conditionalexpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvokedMethodable: (methodInvoked | methodable);

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templatetoken #tokenedArgument | bracketedtemplatespec #bracketedArgument | TEXT+ #textedArgument;

namedSubtemplate: POUND IDENTIFIER;
