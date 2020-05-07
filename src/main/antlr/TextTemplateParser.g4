parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text templatetoken text* | templatecontexttoken | text;

text: TEXT;

templatecontexttoken: LBRACE identifier method* COLON templatespec RBRACE;

templatespec: identifier | bracketedtemplatespec;

bracketedtemplatespec: LBRACKET texttemplate+ RBRACKET;

templatetoken: LBRACE methodcall RBRACE;

methodcall: condition | identifier method*;

condition: identifier method+ ARROW conditiontemplatespec;

conditiontemplatespec: templatespec COMMA templatespec | templatespec;

identifier: IDENTIFIER;

method: DOT IDENTIFIER LP arguments* RP;

arguments: argument (COMMA argument)*;

argument: QUOTE ARGUMENTTEXT* QUOTE | APOSTROPHE ARGUMENTTEXT* APOSTROPHE | templatetoken | bracketedtemplatespec | ARGUMENTTEXT;
