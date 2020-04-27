# texttemplate-monaco-editor

This project is explained in the article [Writing a browser based editor using Monaco and ANTLR](https://tomassetti.me/writing-a-browser-based-editor-using-monaco-and-antlr/).

A browser based editor for the TextTemplate language.

It shows how to integrate ANTLR with monaco.

## Generating the lexer and the parser

```
./gradlew generateParser
```

## Build everything and run the server

```
npm install
npm i -g webpack webpack-cli
./gradlew generateParser
tsc
webpack
cd server
../gradlew runServer
cd .. 
```

Now visit http://localhost:8888
