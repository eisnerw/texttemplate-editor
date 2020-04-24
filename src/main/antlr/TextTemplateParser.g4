parser grammar TextTemplateParser;

string: ENTER_STRING stringPart* CLOSE_STRING;

stringPart:
  TEXT #TextStringPart
  | ID_INTERP #IdInterpPart
  | ENTER_EXPR_INTERP CURLY_R #ExprInterpPart
;
  