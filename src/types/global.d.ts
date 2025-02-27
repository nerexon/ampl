declare global {
    interface String {
        isAlpha(): boolean,
        isNumber(): boolean
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
    exitCode: NumberLiteralNode | ExpressionNode; // Now can be NumberLiteralNode or ExpressionNode
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
}

export {};