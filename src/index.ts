// -------------------------
// Utility Path Functions
// -------------------------
function joinPaths(...parts: string[]): string {
    return parts.join('/').replace(/\/+/g, '/');
  }
  
  function dirname(path: string): string {
    const segments = path.split('/');
    segments.pop();
    return segments.join('/') || '/';
  }
  
  function isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }
  
  function existsSync(path: string): boolean {
    try {
      Bun.file(path);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // -------------------------
  // String Prototype Helpers
  // -------------------------
  String.prototype.isAlpha = function (this: string): boolean {
    return /^[a-zA-Z]+$/.test(this);
  };
  
  String.prototype.isNumber = function (this: string): boolean {
    return /^[0-9]+$/.test(this);
  };
  
  // -------------------------
  // Token Interface (with location)
  // -------------------------
  interface Token {
    type: string;
    value: string;
    line: number;
    column: number;
  }
  
  // -------------------------
  // Reader class to load file content using Bun
  // -------------------------
  class Reader {
    filePath: string;
    file?: ReturnType<typeof Bun.file>;
    constructor(filePath: string) {
      this.filePath = filePath;
    }
    read() {
      this.file = Bun.file(this.filePath);
      return this.file.text();
    }
  }
  
  // -------------------------
  // Include Resolution and Preprocessing
  // -------------------------
  function resolveInclude(includePath: string, currentDir: string, includeDirs: string[]): string {
    if (isAbsolute(includePath)) return includePath;
    let fullPath = joinPaths(currentDir, includePath);
    if (existsSync(fullPath)) return fullPath;
    for (const dir of includeDirs) {
      fullPath = joinPaths(dir, includePath);
      if (existsSync(fullPath)) return fullPath;
    }
    throw new Error(`Included file not found: ${includePath}`);
  }
  
  async function processUsing(
    filePath: string,
    processedFiles: Set<string> = new Set(),
    includeDirs: string[] = []
  ): Promise<string> {
    let resolvedPath = filePath;
    if (!isAbsolute(filePath)) {
      resolvedPath = joinPaths(process.cwd(), filePath);
    }
    if (processedFiles.has(resolvedPath)) return "";
    processedFiles.add(resolvedPath);
    const reader = new Reader(resolvedPath);
    const content = await reader.read();
    const currentDir = dirname(resolvedPath);
    const usingRegex = /USING\s+("[^"]+"|[^\s;]+)\s*;/g;
    let processedContent = content;
    let match: RegExpExecArray | null;
    while ((match = usingRegex.exec(content)) !== null) {
      let includeFile = match[1];
      if (includeFile.startsWith("\"") && includeFile.endsWith("\"")) {
        includeFile = includeFile.slice(1, -1);
      }
      const resolvedIncludePath = resolveInclude(includeFile, currentDir, includeDirs);
      const includedContent = await processUsing(resolvedIncludePath, processedFiles, includeDirs);
      processedContent = processedContent.replace(match[0], includedContent);
    }
    return processedContent;
  }
  
  // -------------------------
  // Custom Error Class for Parsing (with file field)
  // -------------------------
  class ParseError extends Error {
    token?: Token;
    file?: string;
    constructor(message: string, token?: Token, file?: string) {
      super(message);
      this.name = "ParseError";
      this.token = token;
      this.file = file;
    }
  }
  
  // -------------------------
  // Tokenizer: Converts input into tokens (with location) and supports comments
  // -------------------------
  class Tokenizer {
    input: string;
    output: Token[];
    constructor(input: string) {
      this.input = input;
      this.output = [];
    }
    async tokenize() {
      let buff = "";
      // "=" is handled explicitly below.
      const symbols = ["(", ")", "{", "}", ";", ":", ",", "[", "]"];
      let i = 0;
      let line = 1;
      let column = 1;
      let tokenStartLine = line;
      let tokenStartColumn = column;
      const flushBuffer = () => {
        if (buff.length > 0) {
          this.handleBuffer(buff, tokenStartLine, tokenStartColumn);
          buff = "";
        }
      };
      while (i < this.input.length) {
        const char = this.input.at(i)!;
        
        // Treat both CR and LF as newlines.
        if (char === "\n" || char === "\r") {
          flushBuffer();
          line++;
          column = 1;
          i++;
          continue;
        }
        
        // Single-line comment //
        if (char === "/" && this.input.at(i + 1) === "/") {
          flushBuffer();
          i += 2;
          column += 2;
          while (i < this.input.length && this.input.at(i) !== "\n" && this.input.at(i) !== "\r") {
            i++;
            column++;
          }
          continue;
        }
        
        // Block comment /* */
        if (char === "/" && this.input.at(i + 1) === "*") {
          flushBuffer();
          i += 2;
          column += 2;
          while (i < this.input.length && !(this.input.at(i) === "*" && this.input.at(i + 1) === "/")) {
            if (this.input.at(i) === "\n" || this.input.at(i) === "\r") {
              line++;
              column = 1;
            } else {
              column++;
            }
            i++;
          }
          if (i < this.input.length) {
            i += 2;
            column += 2;
          }
          continue;
        }
        
        // Explicit check for "="
        if (char === "=") {
          flushBuffer();
          this.output.push({ type: "symbol", value: "=", line, column });
          i++;
          column++;
          continue;
        }
        
        // Accumulate letters/digits or attached "*" (for pointer syntax)
        if (char.isAlpha() || char.isNumber() || (char === "*" && buff.length > 0)) {
          if (buff.length === 0) {
            tokenStartLine = line;
            tokenStartColumn = column;
          }
          buff += char;
        } else if (char === '"') {
          flushBuffer();
          const strStartLine = line;
          const strStartColumn = column;
          let stringLiteral = '"';
          i++;
          column++;
          while (i < this.input.length && this.input.at(i) !== '"') {
            const c = this.input.at(i)!;
            stringLiteral += c;
            if (c === "\n" || c === "\r") {
              line++;
              column = 1;
            } else {
              column++;
            }
            i++;
          }
          if (i < this.input.length) {
            stringLiteral += '"';
            i++;
            column++;
          } else {
            throw new ParseError("Unterminated string literal", { type: "string", value: stringLiteral, line: strStartLine, column: strStartColumn });
          }
          this.output.push({ type: "string", value: stringLiteral, line: strStartLine, column: strStartColumn });
          continue;
        } else if (symbols.includes(char)) {
          flushBuffer();
          this.output.push({ type: "symbol", value: char, line, column });
        } else if (/\s/.test(char)) {
          flushBuffer();
        } else {
          flushBuffer();
          this.output.push({ type: "unknown", value: char, line, column });
        }
        
        i++;
        column++;
      }
      flushBuffer();
      return this.output;
    }
    handleBuffer(buff: string, line: number, column: number) {
      const keywords = [
        "USING",
        "NAME",
        "FUNCTION",
        "EXIT",
        "RETURN",
        "INTEGER",
        "CHARACTER",
        "LONG",
        "SHORT",
        "SYSCALL",
        "IF",
        "ELSE",
        "SWITCH",
        "FOR",
        "WHILE",
        "CASE",
        "DEFAULT"
      ];
      if (/^\d+$/.test(buff)) {
        this.output.push({ type: "number", value: buff, line, column });
      } else if (keywords.includes(buff.toUpperCase().replace("*", ""))) {
        this.output.push({ type: "keyword", value: buff.toUpperCase(), line, column });
      } else {
        this.output.push({ type: "identifier", value: buff, line, column });
      }
    }
  }
  
  
 // -------------------------
// AST Node Base Definition
// -------------------------
interface ASTNode {
    type: string;
    expression?: any;
  }
  
  // -------------------------
  // Specific AST Node Definitions
  // -------------------------
  interface ExpressionNode extends ASTNode {
    value: string;
  }
  
  interface BlockNode extends ASTNode {
    body: ASTNode[];
  }
  
  interface ParameterNode extends ASTNode {
    dataType: string;
    name: string;
    isArray?: boolean;
    isPointer?: boolean;
  }
  
  interface FunctionDeclarationNode extends ASTNode {
    name: string;
    params: ParameterNode[];
    body: BlockNode;
  }
  
  interface VariableDeclarationNode extends ASTNode {
    dataType: string;
    name: string;
    isArray?: boolean;
    isPointer?: boolean;
    initializer?: ExpressionNode;
  }
  
  interface ReturnStatementNode extends ASTNode {
    expression: ExpressionNode;
  }
  
  interface ExitStatementNode extends ASTNode {
    exitCode: NumberLiteralNode;
  }
  
  interface NumberLiteralNode extends ASTNode {
    value: number;
  }
  
  interface IfStatementNode extends ASTNode {
    condition: ExpressionNode;
    consequent: BlockNode;
    alternate?: BlockNode;
  }
  
  interface SwitchStatementNode extends ASTNode {
    expression: ExpressionNode;
    cases: (CaseNode | DefaultCaseNode)[];
  }
  
  interface CaseNode extends ASTNode {
    value: ExpressionNode;
    body: BlockNode;
  }
  
  interface DefaultCaseNode extends ASTNode {
    body: BlockNode;
  }
  
  interface ForStatementNode extends ASTNode {
    initializer: ExpressionNode;
    condition: ExpressionNode;
    increment: ExpressionNode;
    body: BlockNode;
  }
  
  interface WhileStatementNode extends ASTNode {
    condition: ExpressionNode;
    body: BlockNode;
  }
  
  interface NamespaceDeclarationNode extends ASTNode {
    name: string;
    body: BlockNode;
  }
  
  interface ExpressionStatementNode extends ASTNode {
    expression: ExpressionNode;
  }
  
  interface SyscallDeclarationNode extends ASTNode {
    args: ExpressionNode[];
  }
  
  interface ProgramAST {
    declarations: ASTNode[];
  }
  
  // -------------------------
// Parser: Builds an AST from tokens using recursive descent parsing
// -------------------------
class Parser {
    tokens: Token[];
    pos: number;
    fileName?: string;
    constructor(tokens: Token[], fileName?: string) {
      this.tokens = tokens;
      this.pos = 0;
      this.fileName = fileName;
    }
    currentToken(): Token {
      if (this.pos >= this.tokens.length) {
        throw new ParseError("Unexpected end of input", undefined, this.fileName);
      }
      return this.tokens[this.pos];
    }
    eat(type: string, value?: string): Token {
      const token = this.currentToken();
      if (token.type !== type || (value !== undefined && token.value !== value)) {
        throw new ParseError(
          `Expected token type '${type}'${value ? " with value '" + value + "'" : ""}, but got type '${token.type}' with value '${token.value}' at line ${token.line}, column ${token.column}.`,
          token,
          this.fileName
        );
      }
      this.pos++;
      return token;
    }
    parseExpressionUntil(endSymbol: string): ExpressionNode {
      const exprTokens: string[] = [];
      while (this.currentToken().value !== endSymbol) {
        exprTokens.push(this.currentToken().value);
        this.pos++;
        if (this.pos >= this.tokens.length) {
          throw new ParseError(`Expected '${endSymbol}' but reached end of input.`, undefined, this.fileName);
        }
      }
      return { type: "Expression", value: exprTokens.join(" ") };
    }
    
    // ----- New Function for Syscall Declaration Parsing -----
    parseSyscallDeclaration(): SyscallDeclarationNode {
      this.eat("keyword", "SYSCALL");
      const args: ExpressionNode[] = [];
      // Expect one or more number tokens until a semicolon is reached.
      while (this.currentToken().value !== ";") {
        // Enforce that each argument is a number token.
        const numToken = this.eat("number");
        args.push({ type: "Expression", value: numToken.value });
      }
      this.eat("symbol", ";");
      return { type: "SyscallDeclaration", args };
    }
    
    // ----- New Functions for Declaration Parsing -----
    parseDeclaration(): ASTNode {
        const token = this.currentToken();
        if (token.type === "keyword") {
          if (token.value === "USING") {
            this.eat("keyword", "USING");
            this.eat("string");
            this.eat("symbol", ";");
            return { type: "ExpressionStatement", expression: { type: "Expression", value: "" } };
          }
          if (token.value === "NAME") {
            return this.parseNamespaceDeclaration();
          }
          if (token.value === "FUNCTION") {
            return this.parseFunctionDeclaration();
          }
          if (token.value === "SYSCALL") {
            return this.parseSyscallDeclaration();
          }
          
          const validTypes = new Set(["INTEGER", "CHARACTER", "LONG", "SHORT"]);
          if (validTypes.has(token.value)) {
            return this.parseVariableDeclaration();
          }
          return this.parseStatement();
        }
        return this.parseExpressionStatement();
      }
    
    
    parseNamespaceDeclaration(): NamespaceDeclarationNode {
      this.eat("keyword", "NAME");
      const nameToken = this.eat("identifier");
      const name = nameToken.value;
      const body = this.parseDeclarationBlock();
      return { type: "NamespaceDeclaration", name, body };
    }
    
    parseExpressionStatement(): ExpressionStatementNode {
      const expr = this.parseExpressionUntil(";");
      this.eat("symbol", ";");
      return { type: "ExpressionStatement", expression: expr };
    }
    
    parseDeclarationBlock(): BlockNode {
      this.eat("symbol", "{");
      const body: ASTNode[] = [];
      while (this.currentToken().value !== "}") {
        body.push(this.parseDeclaration());
      }
      this.eat("symbol", "}");
      return { type: "Block", body };
    }
    
    parseProgram(): ProgramAST {
      // Skip top-level USING directives.
      while (
        this.pos < this.tokens.length &&
        this.currentToken().type === "keyword" &&
        this.currentToken().value === "USING"
      ) {
        this.eat("keyword", "USING");
        this.eat("string");
        this.eat("symbol", ";");
      }
      const declarations: ASTNode[] = [];
      while (this.pos < this.tokens.length) {
        declarations.push(this.parseDeclaration());
      }
      return { declarations };
    }
    
    // ----- Functions for Parameter Parsing -----
    parseParameterList(): ParameterNode[] {
      const params: ParameterNode[] = [];
      if (this.currentToken().value === ")") {
        this.eat("symbol", ")");
        return params;
      }
      while (true) {
        params.push(this.parseParameter());
        if (this.currentToken().value === ",") {
          this.eat("symbol", ",");
        } else {
          break;
        }
      }
      this.eat("symbol", ")");
      return params;
    }
    
    parseParameter(): ParameterNode {
      let typeToken = this.eat("keyword");
      let dataType = typeToken.value;
      let isPointer = false;
      let isArray = false;
      if (dataType.endsWith("*")) {
        isPointer = true;
        dataType = dataType.slice(0, -1);
      } else if (this.currentToken().value === "*") {
        this.eat("symbol", "*");
        isPointer = true;
      }
      const nameToken = this.eat("identifier");
      const name = nameToken.value;
      if (this.currentToken().value === "[") {
        this.eat("symbol", "[");
        this.eat("symbol", "]");
        isArray = true;
      }
      return { type: "Parameter", dataType, name, isPointer, isArray };
    }
    
    // ----- Function for Variable Declaration Parsing -----
    parseVariableDeclaration(): VariableDeclarationNode {
      let typeToken = this.eat("keyword");
      let dataType = typeToken.value;
      let isPointer = false;
      let isArray = false;
      if (dataType.endsWith("*")) {
        isPointer = true;
        dataType = dataType.slice(0, -1);
      } else if (this.currentToken().value === "*") {
        this.eat("symbol", "*");
        isPointer = true;
      }
      const nameToken = this.eat("identifier");
      const name = nameToken.value;
      if (this.currentToken().value === "[") {
        this.eat("symbol", "[");
        this.eat("symbol", "]");
        isArray = true;
      }
      let initializer: ExpressionNode | undefined = undefined;
      if (this.currentToken().value === "=") {
        this.eat("symbol", "=");
        initializer = this.parseExpressionUntil(";");
      }
      this.eat("symbol", ";");
      return { type: "VariableDeclaration", dataType, name, isPointer, isArray, initializer };
    }
    
    parseReturnStatement(): ReturnStatementNode {
      this.eat("keyword", "RETURN");
      const expr = this.parseExpressionUntil(";");
      this.eat("symbol", ";");
      return { type: "ReturnStatement", expression: expr };
    }
    
    parseFunctionDeclaration(): FunctionDeclarationNode {
      this.eat("keyword", "FUNCTION");
      const nameToken = this.eat("identifier");
      const name = nameToken.value;
      this.eat("symbol", "(");
      const params = this.parseParameterList();
      const body = this.parseBlock();
      return { type: "FunctionDeclaration", name, params, body };
    }
    
    parseBlock(): BlockNode {
        this.eat("symbol", "{");
        const body: ASTNode[] = [];
        while (this.currentToken().value !== "}") {
          body.push(this.parseDeclaration());
        }
        this.eat("symbol", "}");
        return { type: "Block", body };
      }
      
    
    parseStatement(): ASTNode {
      const token = this.currentToken();
      if (token.type === "keyword") {
        switch (token.value) {
          case "EXIT":
            return this.parseExitStatement();
          case "RETURN":
            return this.parseReturnStatement();
          case "IF":
            return this.parseIfStatement();
          case "SWITCH":
            return this.parseSwitchStatement();
          case "FOR":
            return this.parseForStatement();
          case "WHILE":
            return this.parseWhileStatement();
          default:
            throw new ParseError("Unknown statement starting with token: " + token.value, token, this.fileName);
        }
      }
      throw new ParseError("Unknown statement starting with token: " + token.value, token, this.fileName);
    }
    
    parseExitStatement(): ExitStatementNode {
      this.eat("keyword", "EXIT");
      const codeToken = this.eat("number");
      const exitCode = parseInt(codeToken.value, 10);
      this.eat("symbol", ";");
      return { type: "ExitStatement", exitCode: { type: "NumberLiteral", value: exitCode } };
    }
    
    parseIfStatement(): IfStatementNode {
      this.eat("keyword", "IF");
      this.eat("symbol", "(");
      const condition = this.parseExpressionUntil(")");
      this.eat("symbol", ")");
      const consequent = this.parseBlock();
      let alternate: BlockNode | undefined;
      if (this.currentToken().type === "keyword" && this.currentToken().value === "ELSE") {
        this.eat("keyword", "ELSE");
        alternate = this.parseBlock();
      }
      return { type: "IfStatement", condition, consequent, alternate };
    }
    
    parseSwitchStatement(): SwitchStatementNode {
      this.eat("keyword", "SWITCH");
      this.eat("symbol", "(");
      const expression = this.parseExpressionUntil(")");
      this.eat("symbol", ")");
      this.eat("symbol", "{");
      const cases: (CaseNode | DefaultCaseNode)[] = [];
      while (this.currentToken().value !== "}") {
        if (this.currentToken().type === "keyword" && this.currentToken().value === "CASE") {
          cases.push(this.parseCase());
        } else if (this.currentToken().type === "keyword" && this.currentToken().value === "DEFAULT") {
          cases.push(this.parseDefaultCase());
        } else {
          throw new ParseError("Unexpected token in switch: " + this.currentToken().value, this.currentToken(), this.fileName);
        }
      }
      this.eat("symbol", "}");
      return { type: "SwitchStatement", expression, cases };
    }
    
    parseCase(): CaseNode {
      this.eat("keyword", "CASE");
      const value = this.parseExpressionUntil(":");
      this.eat("symbol", ":");
      const body = this.parseBlock();
      return { type: "Case", value, body };
    }
    
    parseDefaultCase(): DefaultCaseNode {
      this.eat("keyword", "DEFAULT");
      this.eat("symbol", ":");
      const body = this.parseBlock();
      return { type: "DefaultCase", body };
    }
    
    parseForStatement(): ForStatementNode {
      this.eat("keyword", "FOR");
      this.eat("symbol", "(");
      const initializer = this.parseExpressionUntil(";");
      this.eat("symbol", ";");
      const condition = this.parseExpressionUntil(";");
      this.eat("symbol", ";");
      const increment = this.parseExpressionUntil(")");
      this.eat("symbol", ")");
      const body = this.parseBlock();
      return { type: "ForStatement", initializer, condition, increment, body };
    }
    
    parseWhileStatement(): WhileStatementNode {
      this.eat("keyword", "WHILE");
      this.eat("symbol", "(");
      const condition = this.parseExpressionUntil(")");
      this.eat("symbol", ")");
      const body = this.parseBlock();
      return { type: "WhileStatement", condition, body };
    }
  }
  
  // -------------------------
  // Main Execution
  // -------------------------
  async function main() {
    const includeDirs = ["./includes", "./lib"];
    // "test.ampl" is used for error reporting.
    const mergedContent = await processUsing("test.ampl", new Set(), includeDirs);
    const tokenizer = new Tokenizer(mergedContent);
    const tokens = await tokenizer.tokenize();
    const parser = new Parser(tokens, "test.ampl");
    try {
      const ast = parser.parseProgram();
      console.log("AST:", JSON.stringify(ast, null, 2));
    } catch (err) {
      if (err instanceof ParseError) {
        console.error("Parse Error:", err.message);
        if (err.file) {
          console.error(`In file: ${err.file}`);
        }
        if (err.token) {
          console.error(`At line ${err.token.line}, column ${err.token.column} (token: ${err.token.value})`);
        }
      } else {
        console.error(err);
      }
    }
  }
  
  main().catch(err => console.error(err));