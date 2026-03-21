/**
 * PARSER (Syntax Analyzer)
 * 
 * Converts a flat stream of tokens into an Abstract Syntax Tree (AST).
 * Uses recursive descent parsing — one function per grammar rule.
 * 
 * Grammar (BNF):
 * 
 *   program     → statement* EOF
 *   statement   → var_decl | input_stmt | output_stmt | assign_stmt
 *   var_decl    → 'var' IDENTIFIER ( '=' expression )? ';'
 *   input_stmt  → 'input' IDENTIFIER ';'
 *   output_stmt → 'output' expression ';'
 *   assign_stmt → IDENTIFIER '=' expression ';'
 *   expression  → add_sub
 *   add_sub     → mul_div ( ( '+' | '-' ) mul_div )*
 *   mul_div     → unary ( ( '*' | '/' ) unary )*
 *   unary       → '-' unary | primary
 *   primary     → NUMBER | IDENTIFIER | '(' expression ')'
 * 
 * Theory: Recursive Descent is a top-down parsing strategy.
 * Error recovery uses the "synchronize on semicolon" technique (panic mode).
 * Reference: Crafting Interpreters - Robert Nystrom
 */

import { TOKEN_TYPES } from './lexer.js';

// ─────────────────────────────────────────────
//  PARSE ERROR CLASS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  AST NODE FACTORY HELPERS
//  (Plain objects for easy JSON serialization)
// ─────────────────────────────────────────────
const node = {
  program:     (body)                    => ({ type: 'Program',        body }),
  varDecl:     (name, init, line)        => ({ type: 'VarDecl',        name, init, line }),
  inputStmt:   (name, line)              => ({ type: 'InputStmt',      name, line }),
  outputStmt:  (expr, line)              => ({ type: 'OutputStmt',     expr, line }),
  assignStmt:  (name, expr, line)        => ({ type: 'AssignStmt',     name, expr, line }),
  binaryExpr:  (op, left, right, line)   => ({ type: 'BinaryExpr',     op, left, right, line }),
  unaryExpr:   (op, operand, line)       => ({ type: 'UnaryExpr',      op, operand, line }),
  identifier:  (name, line)              => ({ type: 'Identifier',     name, line }),
  numberLit:   (value, line)             => ({ type: 'NumberLiteral',  value, line }),
};

// ─────────────────────────────────────────────
//  PARSER CLASS
// ─────────────────────────────────────────────
export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
    this.errors = [];
  }

  // ── Cursor Helpers ──────────────────────────

  peek()    { return this.tokens[this.pos]; }
  previous(){ return this.tokens[this.pos - 1]; }
  isAtEnd() { return this.peek().type === TOKEN_TYPES.EOF; }

  check(type) {
    return this.peek().type === type;
  }

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

  /**
   * Consume a token of the expected type, or throw a ParseError.
   */
  consume(type, message) {
    if (this.check(type)) return this.advance();
    throw new ParseError(
      message ?? `Expected '${type}' but got '${this.peek().value ?? this.peek().type}'`,
      this.peek()
    );
  }

  // ── Error Recovery (Panic Mode) ─────────────

  /**
   * Synchronize after a parse error by skipping tokens until
   * we find a safe restart point (semicolon or keyword).
   */
  synchronize() {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === TOKEN_TYPES.SEMICOLON) return;
      switch (this.peek().type) {
        case TOKEN_TYPES.VAR:
        case TOKEN_TYPES.INPUT:
        case TOKEN_TYPES.OUTPUT:
          return;
      }
      this.advance();
    }
  }

  // ── Top-Level ───────────────────────────────

  /**
   * program → statement* EOF
   * @returns {{ ast: object, errors: ParseError[] }}
   */
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

  // ── Statement Rules ─────────────────────────

  parseStatement() {
    if (this.check(TOKEN_TYPES.VAR))    return this.parseVarDecl();
    if (this.check(TOKEN_TYPES.INPUT))  return this.parseInputStmt();
    if (this.check(TOKEN_TYPES.OUTPUT)) return this.parseOutputStmt();
    if (this.check(TOKEN_TYPES.IDENTIFIER)) return this.parseAssignStmt();

    throw new ParseError(
      `Unexpected token '${this.peek().value ?? this.peek().type}'. Expected a statement (var, input, output, or assignment).`,
      this.peek()
    );
  }

  /** var_decl → 'var' IDENTIFIER ( '=' expression )? ';' */
  parseVarDecl() {
    const kwToken = this.consume(TOKEN_TYPES.VAR);
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER, "Expected variable name after 'var'");

    let init = null;
    if (this.match(TOKEN_TYPES.ASSIGN)) {
      init = this.parseExpression();
    }

    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after variable declaration");
    return node.varDecl(nameTok.value, init, kwToken.line);
  }

  /** input_stmt → 'input' IDENTIFIER ';' */
  parseInputStmt() {
    const kwToken = this.consume(TOKEN_TYPES.INPUT);
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER, "Expected variable name after 'input'");
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after input statement");
    return node.inputStmt(nameTok.value, kwToken.line);
  }

  /** output_stmt → 'output' expression ';' */
  parseOutputStmt() {
    const kwToken = this.consume(TOKEN_TYPES.OUTPUT);
    const expr    = this.parseExpression();
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after output statement");
    return node.outputStmt(expr, kwToken.line);
  }

  /** assign_stmt → IDENTIFIER '=' expression ';' */
  parseAssignStmt() {
    const nameTok = this.consume(TOKEN_TYPES.IDENTIFIER);
    this.consume(TOKEN_TYPES.ASSIGN, `Expected '=' after variable name '${nameTok.value}'`);
    const expr = this.parseExpression();
    this.consume(TOKEN_TYPES.SEMICOLON, "Expected ';' after assignment");
    return node.assignStmt(nameTok.value, expr, nameTok.line);
  }

  // ── Expression Rules (Precedence Climbing) ──

  parseExpression() {
    return this.parseAddSub();
  }

  /** add_sub → mul_div ( ( '+' | '-' ) mul_div )* */
  parseAddSub() {
    let left = this.parseMulDiv();

    while (this.check(TOKEN_TYPES.PLUS) || this.check(TOKEN_TYPES.MINUS)) {
      const opTok = this.advance();
      const right = this.parseMulDiv();
      left = node.binaryExpr(opTok.value, left, right, opTok.line);
    }

    return left;
  }

  /** mul_div → unary ( ( '*' | '/' ) unary )* */
  parseMulDiv() {
    let left = this.parseUnary();

    while (this.check(TOKEN_TYPES.MULTIPLY) || this.check(TOKEN_TYPES.DIVIDE)) {
      const opTok = this.advance();
      const right = this.parseUnary();
      left = node.binaryExpr(opTok.value, left, right, opTok.line);
    }

    return left;
  }

  /** unary → '-' unary | primary */
  parseUnary() {
    if (this.check(TOKEN_TYPES.MINUS)) {
      const opTok  = this.advance();
      const operand = this.parseUnary();
      return node.unaryExpr('-', operand, opTok.line);
    }
    return this.parsePrimary();
  }

  /** primary → NUMBER | IDENTIFIER | '(' expression ')' */
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
      this.advance(); // consume '('
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
