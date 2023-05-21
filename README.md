[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/eisnerw/texttemplate-editor) 

# texttemplate-monaco-editor

This project is based on the article [Writing a browser based editor using Monaco and ANTLR](https://tomassetti.me/writing-a-browser-based-editor-using-monaco-and-antlr/), which shows how to integrate ANTLR with monaco.

The language supported here is TextTemplate, a new string interpolaton language that has which has been designed with the goal of creating a language that is :

	(a) Concise, through the use of language constructs and default processing that eliminate unnecessary verbiage
	(b) Readable, through the use of familiar syntax, properly-named methods, and flexible comments and whitespace
	(c) Intuitive, through a highly generalized implementation such that once the basic concepts of the language are grasped for simple operations, performing more advanced operations should not require unique or specialized knowledge
	(d) Consistent, through an implementation that avoids, wherever possible, special cases and restrictions
	(e) Rich, through the anticipation and implementation of a wide range of methods and operators that perform typical as well as extraordinary manipulations
	(f) Documented, through content that includes adequate examples to demonstrate the concepts
	(g) Universal, through multiple implementations in a variety of computer languages, starting with JavaScript/Typescript, followed by Java, C# and others

The first version of the language has been completed and can be experienced in this project.  The Monaco editor acts as a lanaguage playground, and the documentation is actually an interpolation of the language.  The editor performs syntax checking and colorizing and can be used to develop and test templates.


## Generating the lexer and the parser
```
./gradlew generateParser
```

## Build everything and run the server
Note that prior to running, you may need to run:
```
 export NODE_OPTIONS=--openssl-legacy-provider
```

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

