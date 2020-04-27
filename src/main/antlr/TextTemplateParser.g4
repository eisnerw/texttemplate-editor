parser grammar TextTemplateParser;

options { tokenVocab=TextTemplateLexer; }

compilationUnit:
    (texttemplates+=texttemplate)+
    EOF
    ;

texttemplate: text (templatetokens+=templatetoken) | text;

text: TEXT;

templatetoken: LBRACE (identifiers+=identifier) RBRACE
    ;

identifier: IDENTIFIER;
