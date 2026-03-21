// ============================================================
// INTERPRETER
// Tree-walk interpreter that directly executes the AST.
// This serves as the "backend" of our compiler pipeline,
// analogous to code generation + execution.
//
// The interpreter maintains a runtime environment (store)
// mapping variable names to their integer values.
//
// For a production compiler, this stage would instead generate
// intermediate code (e.g., three-address code or LLVM IR)
// and then emit target machine code.
//
// Reference: Aho et al., Chapters 6-8
//            Nystrom, "Crafting Interpreters"
// ============================================================

import { ProgramNode, StatementNode, ExpressionNode } from "./parser";
import { SymbolTable } from "./semantic";

export interface RuntimeError {
  message: string;
  line: number;
  column: number;
}

export interface InterpreterResult {
  output: string[];
  errors: RuntimeError[];
  store: Map<string, number>; // Final state of all variables
}

/**
 * Executes the program AST.
 * @param ast - The validated program AST
 * @param symbolTable - Symbol table from semantic analysis
 * @param inputValues - Values to supply to 'input' statements (in order)
 */
export function interpret(
  ast: ProgramNode,
  symbolTable: SymbolTable,
  inputValues: number[]
): InterpreterResult {
  const store = new Map<string, number>();
  const output: string[] = [];
  const errors: RuntimeError[] = [];
  let inputIndex = 0;

  // Initialize all declared variables to 0 (default for integers)
  for (const [name] of symbolTable) {
    store.set(name, 0);
  }

  // ── Execute Statements ────────────────────────────────────
  for (const stmt of ast.body) {
    try {
      executeStatement(stmt);
    } catch (err) {
      if (err instanceof RuntimeException) {
        errors.push(err.runtimeError);
      } else {
        throw err;
      }
    }
  }

  function executeStatement(stmt: StatementNode): void {
    switch (stmt.kind) {
      case "VarDecl":
        // Variable already initialized to 0 in store
        break;

      case "InputStmt": {
        // Read next value from provided inputs
        if (inputIndex < inputValues.length) {
          const val = inputValues[inputIndex++];
          store.set(stmt.variable, val);
        } else {
          throw new RuntimeException({
            message: `'input' for '${stmt.variable}' requires a value but none was provided`,
            line: stmt.line,
            column: stmt.column,
          });
        }
        break;
      }

      case "OutputStmt": {
        const val = evaluateExpression(stmt.expression);
        output.push(String(val));
        break;
      }

      case "AssignStmt": {
        const val = evaluateExpression(stmt.expression);
        store.set(stmt.variable, val);
        break;
      }
    }
  }

  // ── Evaluate Expressions ──────────────────────────────────
  function evaluateExpression(expr: ExpressionNode): number {
    switch (expr.kind) {
      case "NumberLiteral":
        return expr.value;

      case "Identifier": {
        if (!store.has(expr.name)) {
          throw new RuntimeException({
            message: `Undefined variable '${expr.name}' at runtime`,
            line: expr.line,
            column: expr.column,
          });
        }
        return store.get(expr.name)!;
      }

      case "BinaryExpr": {
        const left = evaluateExpression(expr.left);
        const right = evaluateExpression(expr.right);

        switch (expr.operator) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/":
            if (right === 0) {
              throw new RuntimeException({
                message: `Runtime error: Division by zero`,
                line: expr.line,
                column: expr.column,
              });
            }
            // Integer division (truncate toward zero)
            return Math.trunc(left / right);
          default:
            throw new RuntimeException({
              message: `Unknown operator '${expr.operator}'`,
              line: expr.line,
              column: expr.column,
            });
        }
      }
    }
  }

  return { output, errors, store };
}

class RuntimeException extends Error {
  runtimeError: RuntimeError;
  constructor(err: RuntimeError) {
    super(err.message);
    this.runtimeError = err;
  }
}
