parser grammar TextTemplateParser;


options {
    tokenVocab = 'TextTemplateLexer';
}

start: exp EOF ;

exp : LPAR exp RPAR
    | IDENTIFIER
    | DQUOTE stringContents* DQUOTE
    ;

stringContents : TEXT
               | ESCAPE_SEQUENCE
               | BACKSLASH_PAREN exp RPAR
               ;