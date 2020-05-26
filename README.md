[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/eisnerw/texttemplate-editor) 

[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/eisnerw/texttemplate-editor) 

# texttemplate-monaco-editor

This project is based on the article [Writing a browser based editor using Monaco and ANTLR](https://tomassetti.me/writing-a-browser-based-editor-using-monaco-and-antlr/), which shows how to integrate ANTLR with monaco.

The language supported here is TextTemplate, which has been designed with several goals:

   ...


## Generating the lexer and the parser
```
./gradlew generateParser
```

## Build everything and run the server

```
npm install
npm i -g webpack webpack-cli
chmod u+x run

./gradlew generateParser
tsc
webpack
npm start
```

The  commands following the first three commands have been packaged in the "run" bash shell script.
Once the first three commands have been run, navigate to the project and launch the git bash shell.  

Compile and run using the command ./run

when the server starts, visit http://localhost:3000

The server can be stopped by typing CTRL-c

