import { TOKEN_TYPES } from './lexer.js';

export class ParseError {
  constructor(message, token) {
    this.message = message;
    this.token   = token;
    this.line    = token?.line   ?? 0;
    this.column  = token?.column ?? 0;
    this.phase   = 'Syntax Analysis';
  }
  toString() {
    return `[Parser] Line ${this.line}, Col ${this.column}: ${this.message}`;
  }
}

const node = {
  program:     (body)                    => ({ type: 'Program',        body }),
  varDecl:     (name, init, line)        => ({ type: 'VarDecl',        name, init, line }),
  inputStmt:   (name, line)              => ({ type: 'InputStmt',      name, line }),
  outputStmt:  (expr, line)              => ({ type: 'OutputStmt',     expr, line }),
  assignStmt:  (name, expr, line)        => ({ type: 'AssignStmt',     name, expr, line }),
  binaryExpr:  (op, left, right, line)   => ({ type: 'BinaryExpr',     op, left, right, line }),
  unaryExpr:   (op, operand, line)       => ({ type: 'UnaryExpr',      op, operand, line }),
  identifier:  (name, line)             => ({ type: 'Identifier',     name, line }),
  numberLit:   (value, line)             => ({ type: 'NumberLiteral',  value, line }),
};

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
    this.errors = [];
  }

  peek()     { return this.tokens[this.pos]; }
  previous() { return this.tokens[this.pos - 1]; }
  isAtEnd()  { return this.peek().type === TOKEN_TYPES.EOF; }
  check(type){ return this.peek().type === type; }

  advance() {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  match(...types) {
    for (const t of types) {
      if (this.check(t)) { this.advance(); return true; }
    }
    return false;
  }

  consume(type, message) {
    if (this.check(type)) return this.advance();
    throw new ParseError(
      message ?? `Expected '${type}' but got '${this.peek().value ?? this.peek().type}'`,
      this.peek()
    );
  }

  synchronize() {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === TOKEN_TYPES.SEMICOLON) return;
      switch (this.peek().type) {
        case TOKEN_TYPES.TEE:
        case TOKEN_TYPES.DRIVE:
        case TOKEN_TYPES.PUTT:
          return;
      }
      this.advance();
    }
  }

  parse() {
    const body = [];
    while (!this.isAtEnd()) {
      try {
        body.push(this.parseStatement());
      } catch (err) {
        if (err instanceof ParseError) {
          this.errors.push(err);
          this.synchronize();
        } else {
          throw err;
        }
      }
    }
    return { ast: node.program(body), errors: this.errors };
  }

  parseStatement() {
    if (this.check(TOKEN_TYPES.TEE))   return this.parseVarDecl();
    if (this.check(TOKEN_TYPES.DRIVE)) return this.parseInputStmt();
    if (this.check(TOKEN_TYPES.PUTT))  return this.parseOutputStmt();
    if (this.check(TOKEN_TYPES.IDENTIFIER)) return this.parseAssignStmt();

    throw new ParseError(
      `Unexpected token '${this.peek().value ?? this.peek().type}'. Expected a statement (tee, drive, putt, or assignment).`,
      this.peek()
    );
  }

  parseVarDecl() {
    const kwToken = this.consume(TOKEN_TYPES.TEE);
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER, "Expected variable name after 'tee'");
    let init = null;
    if (this.match(TOKEN_TYPES.ASSIGN)) init = this.parseExpression();
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after tee declaration");
    return node.varDecl(nameTok.value, init, kwToken.line);
  }

  parseInputStmt() {
    const kwToken = this.consume(TOKEN_TYPES.DRIVE);
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER, "Expected variable name after 'drive'");
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after drive statement");
    return node.inputStmt(nameTok.value, kwToken.line);
  }

  parseOutputStmt() {
    const kwToken = this.consume(TOKEN_TYPES.PUTT);
    const expr    = this.parseExpression();
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after putt statement");
    return node.outputStmt(expr, kwToken.line);
  }

  parseAssignStmt() {
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER);
    this.consume(TOKEN_TYPES.ASSIGN, `Expected '=' after variable name '${nameTok.value}'`);
    const expr = this.parseExpression();
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after assignment");
    return node.assignStmt(nameTok.value, expr, nameTok.line);
  }

  parseExpression() { return this.parseAddSub(); }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.check(TOKEN_TYPES.PLUS) || this.check(TOKEN_TYPES.MINUS)) {
      const opTok = this.advance();
      left = node.binaryExpr(opTok.value, left, this.parseMulDiv(), opTok.line);
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (this.check(TOKEN_TYPES.MULTIPLY) || this.check(TOKEN_TYPES.DIVIDE)) {
      const opTok = this.advance();
      left = node.binaryExpr(opTok.value, left, this.parseUnary(), opTok.line);
    }
    return left;
  }

  parseUnary() {
    if (this.check(TOKEN_TYPES.MINUS)) {
      const opTok = this.advance();
      return node.unaryExpr('-', this.parseUnary(), opTok.line);
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.check(TOKEN_TYPES.NUMBER)) {
      const tok = this.advance();
      return node.numberLit(tok.value, tok.line);
    }
    if (this.check(TOKEN_TYPES.IDENTIFIER)) {
      const tok = this.advance();
      return node.identifier(tok.value, tok.line);
    }
    if (this.check(TOKEN_TYPES.LPAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.consume(TOKEN_TYPES.RPAREN, "Expected ')' to close parenthesized expression");
      return expr;
    }
    throw new ParseError(
      `Expected a number, variable, or '(' but got '${this.peek().value ?? this.peek().type}'`,
      this.peek()
    );
  }
}
