import { useState, useCallback, useRef, useEffect } from 'react';
import { Lexer, TOKEN_TYPES } from '../lib/lexer.js';
import { Parser } from '../lib/parser.js';
import { SemanticAnalyzer } from '../lib/semantic.js';
import { Interpreter, getInputVariableNames } from '../lib/interpreter.js';

// ─────────────────────────────────────────────
//  SAMPLE PROGRAMS
// ─────────────────────────────────────────────
const SAMPLES = {
  'Hello Compiler': `/* My first program: compute sum of two numbers */
var a;
var b;
var result;

input a;
input b;

result = a + b;
output result;`,

  'Quadratic Terms': `/* Compute ax^2 + bx + c */
var a;
var b;
var c;
var x;
var term1;
var term2;
var answer;

input a;
input b;
input c;
input x;

term1 = a * x * x;
term2 = b * x;
answer = term1 + term2 + c;

output answer;`,

  'Integer Division': `/* Show integer division and remainder */
var dividend;
var divisor;
var quotient;
var remainder;

input dividend;
input divisor;

quotient  = dividend / divisor;
remainder = dividend - (quotient * divisor);

output quotient;
output remainder;`,

  'Celsius to Fahrenheit': `/* Temperature converter: C to F
   Formula: F = (C * 9 / 5) + 32  */
var celsius;
var fahrenheit;

input celsius;

fahrenheit = (celsius * 9 / 5) + 32;

output fahrenheit;`,

  'Error Example': `/* This program has intentional errors for demonstration */
var x;
var y;

input x;
output z;       /* z is not declared! */
var x;          /* x declared twice! */
y = x + w;      /* w is not declared! */`,
};

// ─────────────────────────────────────────────
//  SYNTAX HIGHLIGHT HELPER
// ─────────────────────────────────────────────
function syntaxHighlight(code) {
  const keywords   = /\b(var|input|output)\b/g;
  const numbers    = /\b(\d+)\b/g;
  const operators  = /([+\-*/=;()])/g;
  const comments   = /(\/\*[\s\S]*?\*\/)/g;
  const identifiers = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(comments,   m => `<span class="hl-comment">${m}</span>`)
    .replace(keywords,   m => `<span class="hl-keyword">${m}</span>`)
    .replace(numbers,    m => `<span class="hl-number">${m}</span>`)
    .replace(operators,  m => `<span class="hl-operator">${m}</span>`)
    .replace(identifiers, m =>
      /\b(var|input|output)\b/.test(m) ? m : `<span class="hl-ident">${m}</span>`
    );
}

// ─────────────────────────────────────────────
//  AST TREE VISUALIZER
// ─────────────────────────────────────────────
function AstNode({ node, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 3);
  if (!node || typeof node !== 'object') {
    return <span style={{ color: 'var(--yellow)' }}>{JSON.stringify(node)}</span>;
  }

  const typeColors = {
    Program:       'var(--accent)',
    VarDecl:       'var(--pink)',
    InputStmt:     'var(--green)',
    OutputStmt:    'var(--orange)',
    AssignStmt:    'var(--yellow)',
    BinaryExpr:    'var(--purple)',
    UnaryExpr:     'var(--purple)',
    Identifier:    'var(--accent)',
    NumberLiteral: 'var(--yellow)',
  };

  const color = typeColors[node.type] || 'var(--text-primary)';
  const hasChildren = node.body || node.init || node.expr || node.left || node.right || node.operand;

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, position: 'relative' }}>
      {depth > 0 && (
        <div style={{
          position: 'absolute', left: -16, top: 10,
          width: 12, height: 1, background: 'var(--border-bright)'
        }} />
      )}
      <div
        onClick={() => hasChildren && setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', borderRadius: 4,
          cursor: hasChildren ? 'pointer' : 'default',
          background: depth === 0 ? 'var(--bg-raised)' : 'transparent',
          border: depth === 0 ? '1px solid var(--border-bright)' : 'none',
          userSelect: 'none',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if(hasChildren) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = depth === 0 ? 'var(--bg-raised)' : 'transparent'; }}
      >
        {hasChildren && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 8 }}>
            {collapsed ? '▶' : '▼'}
          </span>
        )}
        <span style={{ color, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {node.type}
        </span>
        {node.name  && <span style={{ color: 'var(--text-muted)' }}>name=<span style={{ color: 'var(--accent)' }}>"{node.name}"</span></span>}
        {node.value !== undefined && <span style={{ color: 'var(--text-muted)' }}>value=<span style={{ color: 'var(--yellow)' }}>{node.value}</span></span>}
        {node.op    && <span style={{ color: 'var(--text-muted)' }}>op=<span style={{ color: 'var(--purple)' }}>"{node.op}"</span></span>}
        {node.line  && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>L{node.line}</span>}
      </div>

      {!collapsed && (
        <div style={{
          marginLeft: 16,
          borderLeft: '1px solid var(--border)',
          paddingLeft: 4,
          marginTop: 2,
        }}>
          {node.body      && node.body.map((child, i) => <AstNode key={i} node={child} depth={depth+1} />)}
          {node.init      && <div><span style={{ color: 'var(--text-dim)', fontSize:11, paddingLeft:8 }}>init:</span><AstNode node={node.init}  depth={depth+1} /></div>}
          {node.expr      && <div><span style={{ color: 'var(--text-dim)', fontSize:11, paddingLeft:8 }}>expr:</span><AstNode node={node.expr}  depth={depth+1} /></div>}
          {node.left      && <div><span style={{ color: 'var(--text-dim)', fontSize:11, paddingLeft:8 }}>left:</span><AstNode node={node.left}  depth={depth+1} /></div>}
          {node.right     && <div><span style={{ color: 'var(--text-dim)', fontSize:11, paddingLeft:8 }}>right:</span><AstNode node={node.right} depth={depth+1} /></div>}
          {node.operand   && <div><span style={{ color: 'var(--text-dim)', fontSize:11, paddingLeft:8 }}>operand:</span><AstNode node={node.operand} depth={depth+1} /></div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  TOKEN TYPE COLOR MAP
// ─────────────────────────────────────────────
const TOKEN_COLORS = {
  VAR: 'var(--pink)', INPUT: 'var(--green)', OUTPUT: 'var(--orange)',
  NUMBER: 'var(--yellow)', IDENTIFIER: 'var(--accent)',
  PLUS: 'var(--purple)', MINUS: 'var(--purple)', MULTIPLY: 'var(--purple)', DIVIDE: 'var(--purple)',
  ASSIGN: 'var(--text-primary)', LPAREN: 'var(--text-muted)', RPAREN: 'var(--text-muted)',
  SEMICOLON: 'var(--text-dim)', EOF: 'var(--text-dim)',
};

// ─────────────────────────────────────────────
//  MAIN PAGE COMPONENT
// ─────────────────────────────────────────────
export default function CompilerPage() {
  const [code,        setCode]        = useState(SAMPLES['Hello Compiler']);
  const [inputValues, setInputValues] = useState('10\n20');
  const [activeTab,   setActiveTab]   = useState('tokens');
  const [result,      setResult]      = useState(null);
  const [running,     setRunning]     = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  const compile = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        // ── Phase 1: Lexical Analysis ──────────
        const lexer     = new Lexer(code);
        const lexResult = lexer.tokenize();

        // ── Phase 2: Syntax Analysis ───────────
        const parser    = new Parser(lexResult.tokens);
        const parseResult = parser.parse();

        // ── Phase 3: Semantic Analysis ─────────
        let semanticResult = { errors: [], warnings: [], symbolTable: new Map() };
        if (parseResult.ast) {
          const analyzer = new SemanticAnalyzer(parseResult.ast);
          semanticResult = analyzer.analyze();
        }

        // ── Phase 4: Interpretation ────────────
        let execResult = null;
        const allErrors = [
          ...lexResult.errors,
          ...parseResult.errors,
          ...semanticResult.errors,
        ];

        if (allErrors.length === 0 && parseResult.ast) {
          const inputs = inputValues
            .split('\n')
            .map(s => s.trim())
            .filter(s => s !== '');
          const interp = new Interpreter(parseResult.ast, inputs);
          execResult   = interp.run();
        }

        setResult({
          tokens:   lexResult.tokens,
          lexErrors:    lexResult.errors,
          ast:      parseResult.ast,
          parseErrors:  parseResult.errors,
          semanticErrors:   semanticResult.errors,
          semanticWarnings: semanticResult.warnings,
          symbolTable: semanticResult.symbolTable,
          exec: execResult,
        });
      } catch (err) {
        setResult({ fatalError: err.message });
      }
      setRunning(false);
    }, 10);
  }, [code, inputValues]);

  // Auto-compile on mount
  useEffect(() => { compile(); }, []);

  const allErrors = result ? [
    ...(result.lexErrors || []),
    ...(result.parseErrors || []),
    ...(result.semanticErrors || []),
  ] : [];

  const hasErrors = allErrors.length > 0;

  const tabs = [
    { id: 'tokens',   label: 'Tokens',   badge: result?.tokens?.length - 1 || 0 },
    { id: 'ast',      label: 'AST',      badge: null },
    { id: 'semantic', label: 'Semantic', badge: allErrors.length || null, badgeType: hasErrors ? 'error' : 'ok' },
    { id: 'output',   label: 'Output',   badge: result?.exec?.output?.length || 0 },
  ];

  return (
    <>
      <style>{`
        .hl-keyword  { color: var(--pink);    font-weight: 700; }
        .hl-number   { color: var(--yellow);  }
        .hl-operator { color: var(--purple);  }
        .hl-comment  { color: var(--text-dim); font-style: italic; }
        .hl-ident    { color: var(--accent);  }
        .tab-btn { 
          background: transparent; border: none; cursor: pointer;
          padding: 8px 16px; font-family: 'Syne', sans-serif;
          font-size: 13px; color: var(--text-muted);
          border-bottom: 2px solid transparent;
          transition: all 0.15s; white-space: nowrap;
        }
        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .btn-run {
          background: var(--accent); color: #000; border: none; cursor: pointer;
          padding: 8px 24px; font-family: 'Orbitron', monospace;
          font-size: 12px; font-weight: 700; letter-spacing: 1px;
          border-radius: 4px; transition: all 0.15s;
          text-transform: uppercase;
        }
        .btn-run:hover { background: #33eeff; transform: translateY(-1px); }
        .btn-run:active { transform: translateY(0); }
        .btn-run:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 9px;
          font-size: 10px; font-weight: 700; padding: 0 5px;
          margin-left: 5px; font-family: 'JetBrains Mono', monospace;
        }
        .badge-error { background: var(--error-bg); color: var(--error); border: 1px solid var(--error); }
        .badge-ok    { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
        .badge-neutral { background: var(--bg-raised); color: var(--text-muted); }
        .sample-btn {
          background: var(--bg-raised); border: 1px solid var(--border);
          color: var(--text-primary); cursor: pointer; padding: 8px 14px;
          font-family: 'JetBrains Mono', monospace; font-size: 12px;
          border-radius: 4px; text-align: left; transition: all 0.1s;
          width: 100%;
        }
        .sample-btn:hover { background: var(--bg-hover); border-color: var(--accent-dim); color: var(--accent); }
        .error-item {
          padding: 8px 12px; border-radius: 4px;
          border-left: 3px solid var(--error);
          background: var(--error-bg);
          margin-bottom: 6px; font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          animation: slide-in 0.2s ease both;
        }
        .warning-item {
          padding: 8px 12px; border-radius: 4px;
          border-left: 3px solid var(--warning);
          background: var(--warning-bg);
          margin-bottom: 6px; font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          animation: slide-in 0.2s ease both;
        }
        .success-item {
          padding: 8px 12px; border-radius: 4px;
          border-left: 3px solid var(--success);
          background: var(--success-bg);
          font-size: 12px; font-family: 'JetBrains Mono', monospace;
        }
        .trace-item {
          display: flex; align-items: center; gap: 10px;
          padding: 5px 8px; border-radius: 4px;
          border-bottom: 1px solid var(--border);
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          transition: background 0.1s;
        }
        .trace-item:hover { background: var(--bg-raised); }
        .op-badge {
          display: inline-block; padding: 1px 6px; border-radius: 3px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
          min-width: 60px; text-align: center;
        }
        .code-editor {
          width: 100%; height: 100%; background: transparent;
          border: none; outline: none; resize: none;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px; line-height: 1.8;
          padding: 16px; caret-color: var(--accent);
        }
        .code-editor::placeholder { color: var(--text-dim); }
        .sym-row {
          display: grid;
          grid-template-columns: 1fr 80px 80px 70px 70px;
          padding: 6px 10px; font-family: 'JetBrains Mono', monospace;
          font-size: 11px; border-bottom: 1px solid var(--border);
          align-items: center;
        }
        .sym-row:hover { background: var(--bg-raised); }
        .output-line {
          padding: 6px 12px; border-radius: 4px;
          background: var(--bg-raised);
          border-left: 3px solid var(--green);
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px; color: var(--green);
          margin-bottom: 6px;
          animation: slide-in 0.2s ease both;
        }
        .token-row {
          display: grid; grid-template-columns: 40px 140px 1fr 60px 60px;
          padding: 4px 8px; align-items: center;
          border-bottom: 1px solid rgba(30,45,74,0.5);
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          transition: background 0.1s;
        }
        .token-row:hover { background: var(--bg-raised); }
        .phase-header {
          font-family: 'Orbitron', monospace;
          font-size: 10px; letter-spacing: 2px;
          color: var(--text-dim); text-transform: uppercase;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
        }
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        overflow: 'hidden', background: 'var(--bg-primary)'
      }}>

        {/* ── HEADER ───────────────────────────────── */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', height: 52,
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 10px var(--accent)',
              animation: 'pulse-glow 2s infinite',
            }} />
            <span style={{
              fontFamily: 'Orbitron, monospace', fontWeight: 900,
              fontSize: 15, letterSpacing: 3,
              background: 'linear-gradient(90deg, var(--accent), var(--green))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              MINI COMPILER
            </span>
            <span style={{
              color: 'var(--text-dim)', fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: 1, paddingLeft: 4
            }}>
              v1.0 · Lexer → Parser → Semantic → Exec
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSamples(!showSamples)}
                style={{
                  background: 'var(--bg-raised)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  padding: '6px 14px', fontFamily: 'Syne, sans-serif',
                  fontSize: 12, borderRadius: 4, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-bright)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                Samples ▾
              </button>

              {showSamples && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 100,
                  background: 'var(--bg-panel)', border: '1px solid var(--border-bright)',
                  borderRadius: 6, padding: 8, minWidth: 220,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  {Object.keys(SAMPLES).map(name => (
                    <button key={name} className="sample-btn"
                      onClick={() => {
                        setCode(SAMPLES[name]);
                        setShowSamples(false);
                        setTimeout(compile, 20);
                      }}
                    >{name}</button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="btn-run"
              onClick={compile}
              disabled={running}
            >
              {running ? '···' : '▶ Run'}
            </button>
          </div>
        </header>

        {/* ── MAIN CONTENT ─────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT: EDITOR PANEL ─────────────────── */}
          <div style={{
            width: '50%', display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}>
            {/* Editor label */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: 9,
                letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase'
              }}>Source Editor</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                color: 'var(--text-dim)'
              }}>
                {code.split('\n').length} lines · {code.length} chars
              </span>
            </div>

            {/* Code textarea */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <textarea
                className="code-editor"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const s = e.target.selectionStart, end = e.target.selectionEnd;
                    const v = code.substring(0,s) + '  ' + code.substring(end);
                    setCode(v);
                    setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0);
                  }
                }}
                spellCheck={false}
                placeholder="// Write your program here..."
              />
            </div>

            {/* Input Section */}
            <div style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              padding: '10px 16px',
              flexShrink: 0,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8
              }}>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: 9,
                  letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase'
                }}>Console Input</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  one value per line
                </span>
              </div>
              <textarea
                value={inputValues}
                onChange={e => setInputValues(e.target.value)}
                style={{
                  width: '100%', height: 64, background: 'var(--bg-raised)',
                  border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12, padding: '8px 10px', resize: 'none', outline: 'none',
                  lineHeight: 1.6,
                }}
                placeholder="10&#10;20"
                spellCheck={false}
              />
            </div>
          </div>

          {/* ── RIGHT: ANALYSIS PANEL ─────────────── */}
          <div style={{
            width: '50%', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-panel)',
          }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              padding: '0 8px', flexShrink: 0, overflowX: 'auto',
              background: 'var(--bg-secondary)',
            }}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                  {t.badge !== null && t.badge > 0 && (
                    <span className={`badge ${t.badgeType === 'error' ? 'badge-error' : t.badgeType === 'ok' ? 'badge-ok' : 'badge-neutral'}`}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}

              <div style={{ flex: 1 }} />
              {result && !hasErrors && (
                <span style={{
                  color: 'var(--green)', fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '0 12px'
                }}>✓ OK</span>
              )}
              {hasErrors && (
                <span style={{
                  color: 'var(--error)', fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '0 12px'
                }}>{allErrors.length} error{allErrors.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
              {!result && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: 'var(--text-dim)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 13
                }}>
                  Click ▶ Run to compile
                </div>
              )}

              {result?.fatalError && (
                <div style={{ padding: 16 }}>
                  <div className="error-item">💥 Fatal: {result.fatalError}</div>
                </div>
              )}

              {result && !result.fatalError && (
                <>
                  {/* ─── TOKENS TAB ────────────────── */}
                  {activeTab === 'tokens' && (
                    <div>
                      <div className="phase-header">
                        Lexical Analysis · {result.tokens.length - 1} tokens
                      </div>

                      {result.lexErrors.length > 0 && (
                        <div style={{ padding: '8px 12px' }}>
                          {result.lexErrors.map((e, i) => (
                            <div key={i} className="error-item">
                              ✗ Line {e.line}, Col {e.column}: {e.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Header row */}
                      <div className="token-row" style={{
                        background: 'var(--bg-raised)', fontWeight: 700,
                        color: 'var(--text-muted)', borderBottom: '1px solid var(--border-bright)'
                      }}>
                        <span>#</span>
                        <span>Type</span>
                        <span>Value</span>
                        <span>Line</span>
                        <span>Col</span>
                      </div>

                      {result.tokens
                        .filter(t => t.type !== TOKEN_TYPES.EOF)
                        .map((tok, i) => (
                          <div key={i} className="token-row">
                            <span style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
                            <span style={{
                              color: TOKEN_COLORS[tok.type] || 'var(--text-primary)',
                              fontWeight: 600,
                            }}>{tok.type}</span>
                            <span style={{ color: 'var(--text-primary)' }}>
                              {tok.value !== null ? String(tok.value) : '—'}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{tok.line}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{tok.column}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* ─── AST TAB ────────────────────── */}
                  {activeTab === 'ast' && (
                    <div>
                      <div className="phase-header">
                        Abstract Syntax Tree · {result.ast?.body?.length || 0} top-level nodes
                      </div>

                      {result.parseErrors.length > 0 && (
                        <div style={{ padding: '8px 12px' }}>
                          {result.parseErrors.map((e, i) => (
                            <div key={i} className="error-item">
                              ✗ Line {e.line}, Col {e.column}: {e.message}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ padding: 12 }}>
                        {result.ast
                          ? <AstNode node={result.ast} depth={0} />
                          : <span style={{ color: 'var(--text-dim)' }}>No AST (parse failed)</span>
                        }
                      </div>
                    </div>
                  )}

                  {/* ─── SEMANTIC TAB ───────────────── */}
                  {activeTab === 'semantic' && (
                    <div>
                      <div className="phase-header">
                        Semantic Analysis · Type & Scope Checking
                      </div>

                      {/* Errors */}
                      {result.semanticErrors.length > 0 && (
                        <div style={{ padding: '8px 12px' }}>
                          <div style={{ fontSize: 10, color: 'var(--error)', fontFamily: 'Orbitron, monospace', letterSpacing: 1, marginBottom: 6 }}>ERRORS</div>
                          {result.semanticErrors.map((e, i) => (
                            <div key={i} className="error-item">
                              ✗ Line {e.line}: {e.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warnings */}
                      {result.semanticWarnings.length > 0 && (
                        <div style={{ padding: '8px 12px' }}>
                          <div style={{ fontSize: 10, color: 'var(--warning)', fontFamily: 'Orbitron, monospace', letterSpacing: 1, marginBottom: 6 }}>WARNINGS</div>
                          {result.semanticWarnings.map((w, i) => (
                            <div key={i} className="warning-item">
                              ⚠ Line {w.line}: {w.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {result.semanticErrors.length === 0 && result.semanticWarnings.length === 0 && (
                        <div style={{ padding: '8px 12px' }}>
                          <div className="success-item">✓ No semantic errors or warnings</div>
                        </div>
                      )}

                      {/* Symbol Table */}
                      {result.symbolTable.size > 0 && (
                        <div>
                          <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--accent)', fontFamily: 'Orbitron, monospace', letterSpacing: 1 }}>
                            SYMBOL TABLE ({result.symbolTable.size} variable{result.symbolTable.size !== 1 ? 's' : ''})
                          </div>
                          <div className="sym-row" style={{
                            background: 'var(--bg-raised)', color: 'var(--text-muted)',
                            fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
                          }}>
                            <span>NAME</span>
                            <span>DECL LINE</span>
                            <span>INIT</span>
                            <span>READS</span>
                            <span>WRITES</span>
                          </div>
                          {[...result.symbolTable.entries()].map(([name, sym]) => (
                            <div key={name} className="sym-row">
                              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{name}</span>
                              <span style={{ color: 'var(--text-muted)' }}>{sym.declaredLine}</span>
                              <span style={{ color: sym.initialized ? 'var(--green)' : 'var(--error)' }}>
                                {sym.initialized ? '✓ yes' : '✗ no'}
                              </span>
                              <span style={{ color: 'var(--text-primary)' }}>{sym.useCount}</span>
                              <span style={{ color: 'var(--text-primary)' }}>{sym.assignCount}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── OUTPUT TAB ─────────────────── */}
                  {activeTab === 'output' && (
                    <div>
                      <div className="phase-header">
                        Execution Output
                      </div>

                      {result.exec?.error && (
                        <div style={{ padding: '8px 12px' }}>
                          <div className="error-item">
                            💥 Runtime Error (Line {result.exec.error.line}): {result.exec.error.message}
                          </div>
                        </div>
                      )}

                      {!hasErrors && result.exec && (
                        <>
                          {/* Output values */}
                          {result.exec.output.length > 0 ? (
                            <div style={{ padding: '12px 12px 0' }}>
                              <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'Orbitron, monospace', letterSpacing: 1, marginBottom: 8 }}>CONSOLE OUTPUT</div>
                              {result.exec.output.map((v, i) => (
                                <div key={i} className="output-line" style={{ animationDelay: `${i * 50}ms` }}>
                                  <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>[{i+1}]</span>
                                  {v}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '12px 12px 0' }}>
                              <div className="success-item">Program ran successfully — no output statements</div>
                            </div>
                          )}

                          {/* Final environment */}
                          {Object.keys(result.exec.env).length > 0 && (
                            <div style={{ padding: '12px 12px 0' }}>
                              <div style={{ fontSize: 10, color: 'var(--purple)', fontFamily: 'Orbitron, monospace', letterSpacing: 1, marginBottom: 8 }}>FINAL VARIABLE STATE</div>
                              {Object.entries(result.exec.env).map(([name, val]) => (
                                <div key={name} style={{
                                  display: 'flex', justifyContent: 'space-between',
                                  padding: '4px 10px', borderRadius: 3,
                                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                                  borderBottom: '1px solid var(--border)',
                                }}>
                                  <span style={{ color: 'var(--accent)' }}>{name}</span>
                                  <span style={{ color: 'var(--yellow)' }}>{val}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Execution trace */}
                          {result.exec.trace.length > 0 && (
                            <div style={{ padding: '12px 12px 0' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'Orbitron, monospace', letterSpacing: 1, marginBottom: 8 }}>EXECUTION TRACE</div>
                              {result.exec.trace.map((step, i) => {
                                const opColors = {
                                  DECLARE: 'var(--pink)', INPUT: 'var(--green)',
                                  OUTPUT: 'var(--orange)', ASSIGN: 'var(--yellow)',
                                };
                                return (
                                  <div key={i} className="trace-item">
                                    <span style={{ color: 'var(--text-dim)', minWidth: 20 }}>{i+1}</span>
                                    <span className="op-badge" style={{
                                      background: `${opColors[step.op] ?? 'var(--text-muted)'}22`,
                                      color: opColors[step.op] ?? 'var(--text-muted)',
                                      border: `1px solid ${opColors[step.op] ?? 'var(--border)'}44`,
                                    }}>{step.op}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>L{step.line}</span>
                                    <span style={{ color: 'var(--text-primary)' }}>{step.desc}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {hasErrors && (
                        <div style={{ padding: '12px 12px' }}>
                          <div style={{
                            padding: '12px 14px', background: 'var(--error-bg)',
                            border: '1px solid var(--error)', borderRadius: 4,
                            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                            color: 'var(--error)'
                          }}>
                            ✗ Execution halted — fix errors in the Semantic tab first
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────── */}
        <footer style={{
          height: 28, background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 20, flexShrink: 0,
        }}>
          {[
            ['Lexer', result?.tokens?.length ? `${result.tokens.length - 1} tokens` : '—', result?.lexErrors?.length > 0 ? 'var(--error)' : 'var(--green)'],
            ['Parser', result?.ast ? `${result.ast.body.length} stmts` : '—', result?.parseErrors?.length > 0 ? 'var(--error)' : 'var(--green)'],
            ['Semantic', result?.symbolTable ? `${result.symbolTable.size} syms` : '—', result?.semanticErrors?.length > 0 ? 'var(--error)' : result?.semanticWarnings?.length > 0 ? 'var(--warning)' : 'var(--green)'],
            ['Exec', result?.exec?.output ? `${result.exec.output.length} out` : '—', result?.exec?.error ? 'var(--error)' : result?.exec ? 'var(--green)' : 'var(--text-dim)'],
          ].map(([label, val, color]) => (
            <span key={label} style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              color: 'var(--text-dim)'
            }}>
              {label}: <span style={{ color }}>{val}</span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-dim)' }}>
            Mini Compiler · Lexer → Parser → Semantic Analyzer → Tree-Walking Interpreter
          </span>
        </footer>
      </div>
    </>
  );
}
