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

indent: (NL | COMMENT) BULLET SPACES?;

beginningIndent: BULLET SPACES?;

comment: COMMENT+;

text: TEXT | NL | SPACES;

templateToken: LBRACE bracedOptions RBRACE;

bracedOptions: bracedArrow #braceArrow | bracedThinArrow #braceThinArrow | optionallyInvoked #braced | predicateExpression #bracedPredicate;

methodInvoked: methodable methodInvocation+;

predicateExpression: LP predicateExpression RP #nestedPredicate | NOT predicateExpression #notPredicate | predicateExpression (AND|OR) predicateExpression #logicalOperator | (methodInvoked | namedSubtemplate) #condition;

templateContextToken: LBRACE ((namedSubtemplate | optionallyInvoked) COLON | COLON) (namedSubtemplate | optionallyInvoked) RBRACE;

templateSpec: namedSubtemplate | bracketedTemplateSpec;

bracketedTemplateSpec: LBRACKET COMMENT? beginningIndent? templateContents* COMMENT* subtemplateSection? COMMENT* RBRACKET;

invokedTemplateSpec: LBRACKET COMMENT? beginningIndent? templateContents* COMMENT* RBRACKETLP;

bracedArrow: predicateExpression ARROW bracedArrowTemplateSpec;

bracedThinArrow: predicateExpression THINARROW optionallyInvoked;

bracedArrowTemplateSpec: optionallyInvoked COMMA optionallyInvoked | optionallyInvoked;

methodable: QUOTE TEXT? QUOTE #quoteLiteral | APOSTROPHE TEXT? APOSTROPHE #apostropheLiteral | templateSpec #methodableTemplateSpec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #identifier;

methodInvocation: (method|DOT invokedTemplateSpec) (predicateExpression | arguments*) RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvoked: (methodInvoked | methodable);

argument: QUOTE TEXT* QUOTE #quotedArgument | APOSTROPHE TEXT* APOSTROPHE #apostrophedArgument | templateToken #tokenedArgument | bracketedTemplateSpec #bracketedArgument | TEXT+ #textedArgument;

namedSubtemplate: POUND IDENTIFIER;
