#!/usr/bin/env bun

import { readFileSync } from "fs";

// -------------------------
// AST Node type definitions (assumed to be declared)
// -------------------------
// (Include all your AST type definitions here, such as ProgramAST, ASTNode, NamespaceDeclarationNode,
// FunctionDeclarationNode, VariableDeclarationNode, ExitStatementNode, SyscallDeclarationNode, etc.)

// -------------------------
// Symbol Table (Now Supports Global and Local)
// -------------------------

interface VariableInfo {
  dataType: string;
  name: string;
  offset?: number; // Offset from rbp (for local) or undefined (for global)
  initializer?: number | string;
}

class SymbolTable {
  private table: { [name: string]: VariableInfo } = {};
  private nextOffset: number = 0;
  private parent?: SymbolTable;

  constructor(parent?: SymbolTable) {
    this.parent = parent;
  }

  addVariable(
    name: string,
    dataType: string,
    initializer?: number | string
  ): VariableInfo {
    if (this.table[name]) {
      throw new Error(`Variable '${name}' already declared in this scope.`);
    }
    let variableInfo: VariableInfo;
    if (this.parent === undefined) {
      variableInfo = { dataType, name, initializer };
    } else {
      this.nextOffset -= 8; // Allocate space on the stack (8 bytes per variable)
      variableInfo = {
        dataType,
        name,
        offset: this.nextOffset,
        initializer,
      };
    }
    this.table[name] = variableInfo;
    return variableInfo;
  }

  getVariable(name: string): VariableInfo | undefined {
    if (this.table[name]) {
      return this.table[name];
    }
    if (this.parent) {
      return this.parent.getVariable(name);
    }
    return undefined;
  }

  getAllVariables(): VariableInfo[] {
    return Object.values(this.table);
  }
}

// -------------------------
// Helper Function: Format a local offset as [rbp - N] or [rbp + N]
// -------------------------

function formatOffset(offset: number): string {
    // Offsets in our symbol table are negative for locals.
    return offset < 0 ? `rbp - ${Math.abs(offset)}` : `rbp + ${offset}`;
  }  

// -------------------------
// Compiler Class
// -------------------------

class Compiler {
  private ast: ProgramAST;
  private assembly: string = "";
  private globalSymbolTable: SymbolTable;
  private currentSymbolTable: SymbolTable;
  private globalCodeAssembly: string = ""; // Store code outside functions.
  private globalVariablesAssembly: string = "";
  private currentFunctionName: string | null = null;

  constructor(ast: ProgramAST) {
    this.ast = ast;
    this.globalSymbolTable = new SymbolTable();
    this.currentSymbolTable = this.globalSymbolTable; // Start at the global scope
  }

  private loadAST(filePath: string): ProgramAST {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as ProgramAST;
  }

  private handleBlockBody(body: ASTNode[]): string {
    let blockAssembly = "";
    for (const node of body) {
      blockAssembly += this.generateNodeAssembly(node);
    }
    return blockAssembly;
  }

  private generateNodeAssembly(node: ASTNode): string {
    switch (node.type) {
      case "NamespaceDeclaration": {
        const namespaceNode = node as NamespaceDeclarationNode;
        return `
; Namespace: ${namespaceNode.name}
${this.handleBlockBody(namespaceNode.body.body)}
`;
      }
      case "FunctionDeclaration": {
        const funcNode = node as FunctionDeclarationNode;
        this.currentFunctionName = funcNode.name;
        // Create a new, local symbol table for the function.
        const prevSymbolTable = this.currentSymbolTable;
        this.currentSymbolTable = new SymbolTable(this.globalSymbolTable);
        let functionAssembly = `
${funcNode.name}:
  push rbp
  mov rbp, rsp
  ; Function Body
${this.handleBlockBody(funcNode.body.body)}
  ; end of body
  mov rsp, rbp
  pop rbp
  ret
`;
        this.currentSymbolTable = prevSymbolTable;
        this.currentFunctionName = null;
        return functionAssembly;
      }
      case "VariableDeclaration": {
        const varNode = node as VariableDeclarationNode;
        let initializerValue: number | string | undefined = undefined;
        if (varNode.initializer) {
          if (varNode.initializer.type === "NumberLiteral") {
            initializerValue = varNode.initializer.value;
          } else if (typeof varNode.initializer.value === "string") {
            if (/^[0-9]+$/.test(varNode.initializer.value)) {
              initializerValue = parseInt(varNode.initializer.value, 10);
            } else {
              initializerValue = varNode.initializer.value;
            }
          } else {
            console.warn(`Unexpected initializer type: ${typeof varNode.initializer.value}`);
          }
        }
        const variableInfo = this.currentSymbolTable.addVariable(
          varNode.name,
          varNode.dataType,
          initializerValue
        );
        // Handle global or local allocation
        if (variableInfo.offset === undefined) {
          // Global variable
          this.globalVariablesAssembly += `
      ${variableInfo.name}: dq ${variableInfo.initializer ?? "0"}`;
          return `; Global VariableDeclaration: ${varNode.name}`;
        } else {
          // Local variable
          const varAssembly = `
        ; Local VariableDeclaration: ${varNode.name} (offset: ${variableInfo.offset})
        sub rsp, 8 ; Allocate space on the stack
      `;
          const offsetStr = formatOffset(variableInfo.offset);
          if (typeof variableInfo.initializer === "number") {
            return (
              varAssembly +
              `
        mov QWORD [${offsetStr}], ${variableInfo.initializer}
      `
            );
          } else if (typeof variableInfo.initializer === "string") {
            // Instead of a memory-to-memory move, load the value from the global into rax first.
            return (
              varAssembly +
              `
        mov rax, [${variableInfo.initializer}]
        mov QWORD [${offsetStr}], rax
      `
            );
          }
          return varAssembly;
        }
      }
      
      case "ReturnStatement": {
        return "  ret\n";
      }
      case "SyscallDeclaration": {
        const syscallNode = node as SyscallDeclarationNode;
        let syscallAssembly = `; SYSCALL: `;
        for (const arg of syscallNode.args) {
          syscallAssembly += `${arg.value} `;
        }
        return (
          syscallAssembly +
          `
; end of syscall declaration`
        );
      }
      case "ExitStatement": {
        const exitNode = node as ExitStatementNode;
        if (exitNode.exitCode.type === "NumberLiteral") {
          return `  mov rax, 60
  mov rdi, ${exitNode.exitCode.value} ; Exit code (literal)
  syscall
`;
        } else {
          const varInfo = this.currentSymbolTable.getVariable(exitNode.exitCode.value);
          if (!varInfo) {
            throw new Error(`Variable ${exitNode.exitCode.value} not found in exit.`);
          }
          if (varInfo.offset !== undefined) {
            // For local variables, properly format the offset.
            const offsetStr = formatOffset(varInfo.offset);
            return `  mov rax, 60
  mov rdi, [${offsetStr}] ; Exit code (variable)
  syscall
`;
          }
          // Global variable
          return `  mov rax, 60
  mov rdi, [${varInfo.name}] ; Exit code (variable)
  syscall
`;
        }
      }
      default:
        console.warn(`Unhandled node type: ${node.type}`);
        return "";
    }
  }
  // Generate the data section from global variables.
  private generateDataSection(): string {
    return `section .data
  ${this.globalVariablesAssembly}
`;
  }

  generateAssembly(): string {
    // Collect all global variable declarations first
    for (const declaration of this.ast.declarations) {
      this.generateNodeAssembly(declaration);
    }
    this.assembly = `${this.generateDataSection()} 
section .text
  global _start

_start:
${this.globalCodeAssembly}
  call main
  mov rax, 60
  xor rdi, rdi
  syscall

`;
    for (const declaration of this.ast.declarations) {
      if (declaration.type !== "VariableDeclaration")
        this.assembly += this.generateNodeAssembly(declaration);
    }
    return this.assembly;
  }
}

// -------------------------
// Main Execution
// -------------------------

function loadAST(filePath: string): ProgramAST {
  const data = readFileSync(filePath, "utf-8");
  return JSON.parse(data) as ProgramAST;
}

const compiler = new Compiler(loadAST("output.temp.json"));
const assemblyCode = compiler.generateAssembly();

console.log(assemblyCode);

Bun.write("output.asm", assemblyCode).then(() => {
  console.log("Assembly written to output.asm");
});
