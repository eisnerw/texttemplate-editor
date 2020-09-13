parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
	beginningBullet?
    templateContents+ 
    EOF
    ;

subtemplateSection: SUBTEMPLATES text* subtemplateSpecs;

subtemplateSpecs: subtemplateSpec*;

subtemplateSpec: templateContextToken text*;

templateContents: beginningBullet? (subtemplateSection | bullet | templateToken | templateContextToken | text+);

bullet: NL BULLET SPACES?;

beginningBullet: BULLET SPACES?;

text: TEXT | NL | SPACES | continuation;

continuation: CONTINUATION;

templateToken: LBRACE bracedOptions RBRACE;

bracedOptions: bracedArrow #braceArrow | bracedThinArrow #braceThinArrow | optionallyInvoked #braced | predicateExpression #bracedPredicate;

methodInvoked: methodable methodInvocation+;

predicateExpression: LP predicateExpression RP #nestedPredicate | relationalOperand RELATIONAL relationalOperand #relationalOperation | NOT predicateExpression #notPredicate | predicateExpression (AND|OR) predicateExpression #logicalOperator | (methodInvoked | namedSubtemplate | identifierCondition) #condition;

relationalOperand: optionallyInvoked | quoteOperand | apostropheOperand | namedSubtemplate | identifierOperand | digits;

digits: MINUS* DIGITS;

quoteOperand: QUOTE TEXT? QUOTE;

apostropheOperand: APOSTROPHE TEXT? APOSTROPHE;

identifierOperand: IDENTIFIER;

identifierCondition: IDENTIFIER;

templateContextToken: LBRACE contextToken RBRACE;

contextToken: ((namedSubtemplate | optionallyInvoked) COLON | COLON) (namedSubtemplate | optionallyInvoked);

templateSpec: namedSubtemplate | bracketedTemplateSpec;

bracketedTemplateSpec: LBRACKET templateContents* subtemplateSection? RBRACKET;

invokedTemplateSpec: LBRACKET beginningBullet? templateContents* RBRACKETLP;

bracedArrow: predicateExpression ARROW bracedArrowTemplateSpec;

bracedThinArrow: predicateExpression THINARROW optionallyInvoked;

bracedArrowTemplateSpec: optionallyInvoked COMMA optionallyInvoked | optionallyInvoked;

methodable: QUOTE TEXT? QUOTE #quoteLiteral | APOSTROPHE TEXT* APOSTROPHE #apostropheLiteral | templateSpec #methodableTemplateSpec | (IDENTIFIER|TEXT) (DOT (IDENTIFIER|TEXT))* #identifier;

methodInvocation: (method|DOT invokedTemplateSpec) arguments* RP;

method: METHODNAME;

arguments: argument (COMMA argument)*;

optionallyInvoked: (methodInvoked | methodable);

argument: REGEX #regex | optionallyInvoked #optionallyInvokedArgument | predicateExpression #predicateArgument | digits #digitsArgument;

namedSubtemplate: POUND IDENTIFIER;
