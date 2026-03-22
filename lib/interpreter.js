// Interpreter

export class RuntimeError {
  constructor(message, line) {
    this.message = message;
    this.line    = line ?? 0;
    this.phase   = 'Runtime';
  }

  toString() {
    return `[Runtime] Line ${this.line}: ${this.message}`;
  }
}

export class Interpreter {
  constructor(ast, inputs = []) {
    this.ast        = ast;
    this.inputs     = inputs.map(v => v.trim()).filter(v => v !== '');
    this.inputIdx   = 0;
    
    this.env        = new Map();
    
    this.output     = [];
    
    this.trace      = [];

    this.error      = null;
  }

  // Code execution
  run() {
    try {
      for (const stmt of this.ast.body) {
        this.execStatement(stmt);
      }
    } catch (err) {
      if (err instanceof RuntimeError) {
        this.error = err;
      } else {
        throw err;
      }
    }

    return {
      output: this.output,
      trace:  this.trace,
      env:    Object.fromEntries(this.env),
      error:  this.error,
    };
  }

  execStatement(stmt) {
    switch (stmt.type) {
      case 'VarDecl':
        this.execVarDecl(stmt);
        break;
      case 'InputStmt':
        this.execInputStmt(stmt);
        break;
      case 'OutputStmt':
        this.execOutputStmt(stmt);
        break;
      case 'AssignStmt':
        this.execAssignStmt(stmt);
        break;
      default:
        throw new RuntimeError(`Unknown statement type: ${stmt.type}`, stmt.line);
    }
  }

  execVarDecl(stmt) {
    const value = stmt.init !== null ? this.evalExpr(stmt.init) : 0;
    this.env.set(stmt.name, value);
    this.trace.push({
      line: stmt.line,
      op:   'DECLARE',
      name: stmt.name,
      value,
      desc: stmt.init
        ? `Declare '${stmt.name}' = ${value}`
        : `Declare '${stmt.name}' = 0 (default)`,
    });
  }

  execInputStmt(stmt) {
    if (this.inputIdx >= this.inputs.length) {
      throw new RuntimeError(
        `Not enough input values provided. Variable '${stmt.name}' needs an input.`,
        stmt.line
      );
    }
    const raw   = this.inputs[this.inputIdx++];
    const value = parseInt(raw, 10);
    if (isNaN(value)) {
      throw new RuntimeError(
        `Input value '${raw}' for variable '${stmt.name}' is not a valid integer`,
        stmt.line
      );
    }
    this.env.set(stmt.name, value);
    this.trace.push({
      line:  stmt.line,
      op:    'INPUT',
      name:  stmt.name,
      value,
      desc:  `Read input for '${stmt.name}' → ${value}`,
    });
  }

  execOutputStmt(stmt) {
    const value = this.evalExpr(stmt.expr);
    this.output.push(value);
    this.trace.push({
      line:  stmt.line,
      op:    'OUTPUT',
      value,
      desc:  `Output → ${value}`,
    });
  }

  execAssignStmt(stmt) {
    const value = this.evalExpr(stmt.expr);
    this.env.set(stmt.name, value);
    this.trace.push({
      line:  stmt.line,
      op:    'ASSIGN',
      name:  stmt.name,
      value,
      desc:  `'${stmt.name}' ← ${value}`,
    });
  }

  // Expression Evaluation
  evalExpr(expr) {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value;

      case 'Identifier': {
        if (!this.env.has(expr.name)) {
          throw new RuntimeError(`Undefined variable '${expr.name}'`, expr.line);
        }
        return this.env.get(expr.name);
      }

      case 'UnaryExpr':
        return -this.evalExpr(expr.operand);

      case 'BinaryExpr': {
        const left  = this.evalExpr(expr.left);
        const right = this.evalExpr(expr.right);
        switch (expr.op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/':
            if (right === 0) {
              throw new RuntimeError('Division by zero is not allowed', expr.line);
            }
            // Integer division
            return Math.trunc(left / right);
          default:
            throw new RuntimeError(`Unknown operator '${expr.op}'`, expr.line);
        }
      }

      default:
        throw new RuntimeError(`Unknown expression type: ${expr.type}`, expr?.line);
    }
  }
}

export function countInputStatements(ast) {
  if (!ast || !ast.body) return 0;
  return ast.body.filter(s => s.type === 'InputStmt').length;
}

export function getInputVariableNames(ast) {
  if (!ast || !ast.body) return [];
  return ast.body
    .filter(s => s.type === 'InputStmt')
    .map(s => s.name);
}
