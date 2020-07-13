parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
	beginningIndent?
    templateContents+ 
    EOF
    ;

subtemplateSection: SUBTEMPLATES text* subtemplateSpecs;

subtemplateSpecs: subtemplateSpec*;

subtemplateSpec: templateContextToken text*;

templateContents: comment? (subtemplateSection | indent | templateToken | templateContextToken | text+);

indent: bulletHolder indented;

bulletHolder: NL SPACES? LBRACE DOT RBRACE comment? SPACES? ;

indented: (comment? (templateToken | templateContextToken | text+))*;

beginningIndent: beginningBulletHolder indented;

beginningBulletHolder: SPACES? LBRACE DOT RBRACE SPACES?;

comment: COMMENT+;

text: TEXT | NL | SPACES;

templateToken: LBRACE bracedOptions RBRACE;

bracedOptions: bracedArrow #braceArrow | bracedThinArrow #braceThinArrow | optionallyInvokedMethodable #bracedMethodable | conditionalExpression #bracedConditional;

methodInvoked: methodable methodInvocation+;

conditionalExpression: LP conditionalExpression RP #nestedConditional | NOT conditionalExpression #notConditional | conditionalExpression (AND|OR) conditionalExpression #logicalOperator | (methodInvoked | namedSubtemplate) #condition;

templateContextToken: LBRACE ((namedSubtemplate | optionallyInvokedMethodable) COLON | COLON) (namedSubtemplate | optionallyInvokedMethodable) RBRACE;

templateSpec: namedSubtemplate | bracketedTemplateSpec;

bracketedTemplateSpec: LBRACKET COMMENT? beginningIndent? templateContents* COMMENT* subtemplateSection? COMMENT* RBRACKET;

invokedTemplateSpec: LBRACKET COMMENT? beginningIndent? templateContents* COMMENT* RBRACKETLP;

bracedArrow: conditionalExpression ARROW bracedArrowTemplateSpec;

bracedThinArrow: conditionalExpression THINARROW optionallyInvokedMethodable;

bracedArrowTemplateSpec: optionallyInvokedMethodable COMMA optionallyInvokedMethodable | optionallyInvokedMethodable;

methodable: QUOTE TEXT QUOTE #quoteLiteral | APOSTROPHE TEXT APOSTROPHE #apostropheLiteral | templateSpec #methodableTemplateSpec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #methodableIdentifier;

methodInvocation: (method|DOT invokedTemplateSpec) (conditionalExpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvokedMethodable: (methodInvoked | methodable);

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templateToken #tokenedArgument | bracketedTemplateSpec #bracketedArgument | TEXT+ #textedArgument;

namedSubtemplate: POUND IDENTIFIER;
