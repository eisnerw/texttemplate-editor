parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text* templatetoken text* | templatecontexttoken | text;

text: (texts+=TEXT+);

templatetoken: LBRACE bracedoptions RBRACE;

bracedoptions: QUOTE ARGUMENTTEXT QUOTE | APOSTROPHE ARGUMENTTEXT APOSTROPHE | bracedcondition | identifier method*;

templatecontexttoken: LBRACE (identifier method* | QUOTE ARGUMENTTEXT QUOTE) COLON templatespec RBRACE;

templatespec: identifier | bracketedtemplatespec;

methodcall: condition | identifier method*;

bracedcondition: identifier method+ ARROW bracedconditiontemplatespec;

bracedconditiontemplatespec: templatespec COMMA templatespec | templatespec;

identifier: IDENTIFIER;

method: DOT IDENTIFIER LP arguments* RP;

arguments: argument (COMMA argument)*;

argument: QUOTE ARGUMENTTEXT* QUOTE | APOSTROPHE ARGUMENTTEXT* APOSTROPHE | templatetoken | bracketedtemplatespec | ARGUMENTTEXT;
