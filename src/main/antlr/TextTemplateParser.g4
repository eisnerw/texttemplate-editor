parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text (templatetokens+=templatetoken) | text;

text: TEXT;

templatetoken: LBRACE (identifiers+=identifier method*) RBRACE
    ;

identifier: IDENTIFIER;

method: DOT IDENTIFIER LP arguments* RP;

arguments: argument (COMMA argument)*;

argument: QUOTE QUOTEDTEXT QUOTE | templatetoken | ARGUMENTTEXT;
