export const TOKEN_TYPES = {
  // Keywords
  VAR:        'VAR',
  INPUT:      'INPUT',
  OUTPUT:     'OUTPUT',

  // Literals
  NUMBER:     'NUMBER',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Arithmetic Operators
  PLUS:       'PLUS',
  MINUS:      'MINUS',
  MULTIPLY:   'MULTIPLY',
  DIVIDE:     'DIVIDE',

  // Assignment
  ASSIGN:     'ASSIGN',

  // Punctuation
  LPAREN:     'LPAREN',
  RPAREN:     'RPAREN',
  SEMICOLON:  'SEMICOLON',

  // Special
  EOF:        'EOF',
};

// Reserved keywords map
const KEYWORDS = {
  'var':    TOKEN_TYPES.VAR,
  'input':  TOKEN_TYPES.INPUT,
  'output': TOKEN_TYPES.OUTPUT,
};

export class Token {
  constructor(type, value, line, column) {
    this.type   = type;
    this.value  = value;
    this.line   = line;
    this.column = column;
  }
}

export class LexerError {
  constructor(message, line, column) {
    this.message = message;
    this.line    = line;
    this.column  = column;
    this.phase   = 'Lexical Analysis';
  }

  toString() {
    return `[Lexer] Line ${this.line}, Col ${this.column}: ${this.message}`;
  }
}

// Helper predicate
const isDigit      = ch => ch >= '0' && ch <= '9';
const isLetter     = ch => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
const isAlphaNum   = ch => isLetter(ch) || isDigit(ch) || ch === '_';
const isIdentStart = ch => isLetter(ch) || ch === '_';
const isWhitespace = ch => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';

export class Lexer {
  constructor(source) {
    this.source  = source;
    this.pos     = 0;
    this.line    = 1;
    this.column  = 1;
    this.tokens  = [];
    this.errors  = [];
  }

  // Cursor Helpers
  peek(offset = 0) {
    return this.source[this.pos + offset];
  }
  
  advance() {
    const ch = this.source[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  isAtEnd() {
    return this.pos >= this.source.length;
  }

  //  Skipping Helpers

  // Skip all whitespace characters
  skipWhitespace() {
    while (!this.isAtEnd() && isWhitespace(this.peek())) {
      this.advance();
    }
  }

  // Skips block comments
  skipComment() {
    const startLine = this.line;
    const startCol  = this.column;

    this.advance();
    this.advance();

    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }

    // If program reaches this, the comment was never closed
    this.errors.push(new LexerError(
      'Unterminated block comment (missing */)',
      startLine,
      startCol
    ));
  }

  // Token Readers
  readNumber(line, col) {
    let raw = '';
    while (!this.isAtEnd() && isDigit(this.peek())) {
      raw += this.advance();
    }
    return new Token(TOKEN_TYPES.NUMBER, parseInt(raw, 10), line, col);
  }

  // Read identifiers or keyword
  readIdentifierOrKeyword(line, col) {
    let name = '';
    while (!this.isAtEnd() && isAlphaNum(this.peek())) {
      name += this.advance();
    }
    const type = KEYWORDS[name] ?? TOKEN_TYPES.IDENTIFIER;
    return new Token(type, name, line, col);
  }

  // Main Tokenize Method
  tokenize() {
    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      // Check for block comment
      if (this.peek() === '/' && this.peek(1) === '*') {
        this.skipComment();
        continue;
      }

      const line = this.line;
      const col  = this.column;
      const ch   = this.peek();

      // Numeric Literal
      if (isDigit(ch)) {
        this.tokens.push(this.readNumber(line, col));
        continue;
      }

      // Identifier / Keyword
      if (isIdentStart(ch)) {
        this.tokens.push(this.readIdentifierOrKeyword(line, col));
        continue;
      }

      // Handle Single-Character Tokens
      this.advance();
      switch (ch) {
        case '+': this.tokens.push(new Token(TOKEN_TYPES.PLUS,      '+', line, col)); break;
        case '-': this.tokens.push(new Token(TOKEN_TYPES.MINUS,     '-', line, col)); break;
        case '*': this.tokens.push(new Token(TOKEN_TYPES.MULTIPLY,  '*', line, col)); break;
        case '/': this.tokens.push(new Token(TOKEN_TYPES.DIVIDE,    '/', line, col)); break;
        case '=': this.tokens.push(new Token(TOKEN_TYPES.ASSIGN,    '=', line, col)); break;
        case '(': this.tokens.push(new Token(TOKEN_TYPES.LPAREN,    '(', line, col)); break;
        case ')': this.tokens.push(new Token(TOKEN_TYPES.RPAREN,    ')', line, col)); break;
        case ';': this.tokens.push(new Token(TOKEN_TYPES.SEMICOLON, ';', line, col)); break;
        default:
          this.errors.push(new LexerError(
            `Unexpected character '${ch}' (ASCII ${ch.charCodeAt(0)})`,
            line,
            col
          ));
      }
    }

    // Program always terminates with EOF token
    this.tokens.push(new Token(TOKEN_TYPES.EOF, null, this.line, this.column));

    return { tokens: this.tokens, errors: this.errors };
  }
}
