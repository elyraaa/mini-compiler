import { useState, useCallback, useRef, useEffect } from 'react';
import Head from 'next/head';
import { Lexer, TOKEN_TYPES } from '../lib/lexer.js';
import { Parser } from '../lib/parser.js';
import { SemanticAnalyzer } from '../lib/semantic.js';
import { Interpreter, getInputVariableNames } from '../lib/interpreter.js';

// ─────────────────────────────────────────────
//  SAMPLE PROGRAMS
// ─────────────────────────────────────────────
const SAMPLES = {
  'Hello Golfer': `/* My first program: compute sum of two numbers */
tee a;
tee b;
tee result;

drive a;
drive b;

result = a + b;
putt result;`,

  'Quadratic Terms': `/* Compute ax^2 + bx + c */
tee a;
tee b;
tee c;
tee x;
tee term1;
tee term2;
tee answer;

drive a;
drive b;
drive c;
drive x;

term1 = a * x * x;
term2 = b * x;
answer = term1 + term2 + c;

putt answer;`,

  'Integer Division': `/* Show integer division and remainder */
tee dividend;
tee divisor;
tee quotient;
tee remainder;

drive dividend;
drive divisor;

quotient  = dividend / divisor;
remainder = dividend - (quotient * divisor);

putt quotient;
putt remainder;`,

  'Celsius to Fahrenheit': `/* Temperature converter: C to F
   Formula: F = (C * 9 / 5) + 32  */
tee celsius;
tee fahrenheit;

drive celsius;

fahrenheit = (celsius * 9 / 5) + 32;

putt fahrenheit;`,

  'Error Example': `/* This program has intentional errors */
tee x;
tee y;

drive x;
putt z;       /* z is not declared! */
tee x;        /* x declared twice! */
y = x + w;   /* w is not declared! */`,
};

// ─────────────────────────────────────────────
//  SYNTAX HIGHLIGHT
// ─────────────────────────────────────────────
function syntaxHighlight(code) {
  const keywords    = /\b(tee|drive|putt)\b/g;
  const numbers     = /\b(\d+)\b/g;
  const operators   = /([+\-*/=;()])/g;
  const comments    = /(\/\*[\s\S]*?\*\/)/g;
  const identifiers = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  return code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(comments,    m => `<span class="t-cmt">${m}</span>`)
    .replace(keywords,    m => `<span class="t-kw">${m}</span>`)
    .replace(numbers,     m => `<span class="t-num">${m}</span>`)
    .replace(operators,   m => `<span class="t-op">${m}</span>`)
    .replace(identifiers, m => /\b(tee|drive|putt)\b/.test(m) ? m : `<span class="t-id">${m}</span>`);
}

// ─────────────────────────────────────────────
//  AST NODE VISUALIZER
// ─────────────────────────────────────────────
function AstNode({ node, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 3);
  if (!node || typeof node !== 'object') return <span style={{ color: 'var(--gold-light)' }}>{JSON.stringify(node)}</span>;

  const typeColors = {
    Program: 'var(--light-green)', VarDecl: 'var(--sky-blue)',
    InputStmt: 'var(--light-green)', OutputStmt: 'var(--gold-light)',
    AssignStmt: 'var(--sand-light)', BinaryExpr: 'var(--sand-trap)',
    UnaryExpr: 'var(--sand-trap)', Identifier: 'var(--light-green)',
    NumberLiteral: 'var(--gold-light)',
  };
  const color = typeColors[node.type] || 'var(--cream)';
  const hasChildren = node.body || node.init || node.expr || node.left || node.right || node.operand;

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, position: 'relative' }}>
      {depth > 0 && <div style={{ position: 'absolute', left: -16, top: 10, width: 12, height: 1, background: 'var(--stroke)' }} />}
      <div
        onClick={() => hasChildren && setCollapsed(!collapsed)}
        onMouseEnter={e => { if (hasChildren) e.currentTarget.style.background = 'rgba(46,125,79,0.2)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = depth === 0 ? 'rgba(13,38,21,0.8)' : 'transparent'; }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', borderRadius: 3,
          cursor: hasChildren ? 'pointer' : 'default',
          background: depth === 0 ? 'rgba(13,38,21,0.8)' : 'transparent',
          border: depth === 0 ? '1px solid var(--stroke)' : 'none',
          userSelect: 'none', transition: 'background 0.1s',
        }}
      >
        {hasChildren && <span style={{ color: 'var(--sand-trap)', fontSize: 10, width: 8 }}>{collapsed ? '▶' : '▼'}</span>}
        <span style={{ color, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>{node.type}</span>
        {node.name !== undefined && <span style={{ color: 'var(--sand-trap)' }}>name=<span style={{ color: 'var(--light-green)' }}>"{node.name}"</span></span>}
        {node.value !== undefined && <span style={{ color: 'var(--sand-trap)' }}>value=<span style={{ color: 'var(--gold-light)' }}>{node.value}</span></span>}
        {node.op && <span style={{ color: 'var(--sand-trap)' }}>op=<span style={{ color: 'var(--sand-trap)' }}>"{node.op}"</span></span>}
        {node.line && <span style={{ color: 'rgba(201,169,110,0.5)', fontSize: 10 }}>L{node.line}</span>}
      </div>
      {!collapsed && (
        <div style={{ marginLeft: 16, borderLeft: '1px solid var(--stroke)', paddingLeft: 4, marginTop: 2 }}>
          {node.body    && node.body.map((c, i) => <AstNode key={i} node={c} depth={depth + 1} />)}
          {node.init    && <div><span style={{ color: 'rgba(201,169,110,0.4)', fontSize: 11, paddingLeft: 8 }}>init:</span><AstNode node={node.init} depth={depth + 1} /></div>}
          {node.expr    && <div><span style={{ color: 'rgba(201,169,110,0.4)', fontSize: 11, paddingLeft: 8 }}>expr:</span><AstNode node={node.expr} depth={depth + 1} /></div>}
          {node.left    && <div><span style={{ color: 'rgba(201,169,110,0.4)', fontSize: 11, paddingLeft: 8 }}>left:</span><AstNode node={node.left} depth={depth + 1} /></div>}
          {node.right   && <div><span style={{ color: 'rgba(201,169,110,0.4)', fontSize: 11, paddingLeft: 8 }}>right:</span><AstNode node={node.right} depth={depth + 1} /></div>}
          {node.operand && <div><span style={{ color: 'rgba(201,169,110,0.4)', fontSize: 11, paddingLeft: 8 }}>operand:</span><AstNode node={node.operand} depth={depth + 1} /></div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  TOKEN COLORS (golf palette)
// ─────────────────────────────────────────────
const TOKEN_COLORS = {
  TEE: 'var(--sky-blue)', DRIVE: 'var(--light-green)', PUTT: 'var(--gold-light)',
  NUMBER: 'var(--gold)', IDENTIFIER: 'var(--cream)',
  PLUS: 'var(--sand-light)', MINUS: 'var(--sand-light)', MULTIPLY: 'var(--sand-light)', DIVIDE: 'var(--sand-light)',
  ASSIGN: 'var(--sand-trap)', LPAREN: 'var(--sand-trap)', RPAREN: 'var(--sand-trap)',
  SEMICOLON: 'rgba(201,169,110,0.4)', EOF: 'rgba(201,169,110,0.2)',
};

// ─────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────
export default function CompilerPage() {
  const [code,        setCode]        = useState(SAMPLES['Hello Golfer']);
  const [inputValues, setInputValues] = useState('10\n20');
  const [activeTab,   setActiveTab]   = useState('tokens');
  const [result,      setResult]      = useState(null);
  const [running,     setRunning]     = useState(false);
  const [cursorPos,   setCursorPos]   = useState({ line: 1, col: 1 });
  const textareaRef = useRef(null);
  const lineNumsRef = useRef(null);

  const compile = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const lexer       = new Lexer(code);
        const lexResult   = lexer.tokenize();
        const parser      = new Parser(lexResult.tokens);
        const parseResult = parser.parse();
        let semanticResult = { errors: [], warnings: [], symbolTable: new Map() };
        if (parseResult.ast) {
          const analyzer = new SemanticAnalyzer(parseResult.ast);
          semanticResult = analyzer.analyze();
        }
        let execResult = null;
        const allErrors = [...lexResult.errors, ...parseResult.errors, ...semanticResult.errors];
        if (allErrors.length === 0 && parseResult.ast) {
          const inputs = inputValues.split('\n').map(s => s.trim()).filter(Boolean);
          const interp = new Interpreter(parseResult.ast, inputs);
          execResult   = interp.run();
        }
        setResult({
          tokens: lexResult.tokens, lexErrors: lexResult.errors,
          ast: parseResult.ast, parseErrors: parseResult.errors,
          semanticErrors: semanticResult.errors, semanticWarnings: semanticResult.warnings,
          symbolTable: semanticResult.symbolTable, exec: execResult,
        });
      } catch (err) {
        setResult({ fatalError: err.message });
      }
      setRunning(false);
    }, 10);
  }, [code, inputValues]);

  useEffect(() => { compile(); }, []);

  const allErrors   = result ? [...(result.lexErrors||[]), ...(result.parseErrors||[]), ...(result.semanticErrors||[])] : [];
  const hasErrors   = allErrors.length > 0;
  const tokenCount  = result?.tokens ? result.tokens.length - 1 : 0;
  const warnCount   = result?.semanticWarnings?.length || 0;
  const lineCount   = code.split('\n').length;
  const lineNums    = Array.from({ length: Math.max(lineCount, 20) }, (_, i) => i + 1);

  const handleScroll = () => {
    if (lineNumsRef.current && textareaRef.current) lineNumsRef.current.scrollTop = textareaRef.current.scrollTop;
  };
  const trackCursor = (e) => {
    const text = e.target.value.substr(0, e.target.selectionStart);
    const arr  = text.split('\n');
    setCursorPos({ line: arr.length, col: arr[arr.length - 1].length + 1 });
  };

  const tabs = [
    { id: 'tokens',   label: 'Tokens',   count: tokenCount,                        err: false },
    { id: 'ast',      label: 'AST',      count: result?.ast?.body?.length || 0,    err: false },
    { id: 'semantic', label: 'Semantic', count: allErrors.length + warnCount,      err: hasErrors },
    { id: 'output',   label: 'Output',   count: result?.exec?.output?.length || 0, err: false },
  ];

  const golfScore = () => {
    if (!result || result.fatalError || hasErrors) return { label: 'OB', cls: 'bad' };
    const o = result.exec?.output?.length || 0;
    if (lineCount <= 5)  return { label: 'Hole-in-One', cls: 'good' };
    if (lineCount <= 10) return { label: 'Eagle', cls: 'good' };
    if (lineCount <= 18) return { label: 'Birdie', cls: 'good' };
    if (lineCount <= 30) return { label: 'Par', cls: '' };
    return { label: 'Bogey', cls: 'warn' };
  };
  const score = result ? golfScore() : { label: '—', cls: '' };

  return (
    <>
      <Head>
        <title>GolfScript — Code on the Green</title>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=JetBrains+Mono:wght@300;400;500;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        :root {
          --fairway:#1a4a28; --rough:#254f30; --deep-rough:#0d2615;
          --putting-green:#2e7d4f; --light-green:#4aab6d;
          --sand-trap:#c9a96e; --sand-light:#e8d5ab; --cream:#f2ead8;
          --clubhouse:#091a0e; --flag-red:#c0392b; --sky-blue:#7ab8d4;
          --gold:#b5892a; --gold-light:#d4a83e; --white-ball:#f8f6f2;
          --stroke:#3a5c42;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;background:var(--clubhouse);color:var(--cream);font-family:'EB Garamond',Georgia,serif;overflow:hidden;}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
          background:radial-gradient(ellipse 80% 50% at 70% 20%,rgba(42,107,65,.18) 0%,transparent 60%),
                     radial-gradient(ellipse 60% 40% at 20% 80%,rgba(26,74,40,.25) 0%,transparent 55%);}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:var(--stroke);border-radius:3px;}
        .t-kw{color:#7ab8d4;} .t-num{color:#d4a83e;} .t-op{color:#b8d4c8;}
        .t-cmt{color:#3d6648;font-style:italic;} .t-id{color:var(--cream);}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(.85);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:translateX(0);}}

        /* ── TOPBAR ── */
        .topbar{position:relative;z-index:10;display:flex;align-items:center;justify-content:space-between;
          height:52px;padding:0 20px;
          background:linear-gradient(180deg,var(--deep-rough) 0%,var(--fairway) 100%);
          border-bottom:1px solid var(--stroke);box-shadow:0 2px 16px rgba(0,0,0,.5);
          animation:fadeUp .3s ease both;}
        .logo-area{display:flex;align-items:center;gap:12px;}
        .logo-badge{width:34px;height:34px;border-radius:50%;flex-shrink:0;
          background:radial-gradient(circle at 35% 35%,#fff 0%,#e8e4dc 40%,#c8c0b4 100%);
          box-shadow:inset -2px -2px 5px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.4);position:relative;}
        .logo-badge::before{content:'';position:absolute;inset:3px;border-radius:50%;
          background-image:
            radial-gradient(circle 2px at 35% 30%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle 2px at 60% 25%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle 2px at 25% 55%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle 2px at 55% 55%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle 2px at 70% 50%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle 2px at 40% 72%,rgba(160,155,148,.7) 100%,transparent),
            radial-gradient(circle at 30% 30%,rgba(255,255,255,.9),rgba(200,196,190,.6));}
        .logo-text{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;letter-spacing:.04em;color:var(--cream);}
        .logo-text span{color:var(--gold-light);}
        .logo-sub{font-family:'EB Garamond',serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--sand-trap);margin-top:-2px;}
        .club-area{display:flex;align-items:center;gap:6px;}
        .club-label{font-family:'EB Garamond',serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--sand-trap);}
        .club-select{appearance:none;background:var(--deep-rough);border:1px solid var(--stroke);color:var(--cream);
          font-family:'JetBrains Mono',monospace;font-size:12px;padding:5px 28px 5px 10px;border-radius:4px;cursor:pointer;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%234aab6d' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 8px center;transition:border-color .2s;}
        .club-select:focus{outline:none;border-color:var(--light-green);}
        .nav-actions{display:flex;align-items:center;gap:8px;}
        .nav-btn{font-family:'EB Garamond',serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;
          background:transparent;border:1px solid var(--stroke);color:var(--sand-light);
          padding:5px 14px;border-radius:3px;cursor:pointer;transition:all .2s;}
        .nav-btn:hover{border-color:var(--sand-trap);background:rgba(201,169,110,.08);color:var(--cream);}

        /* ── TOOLBAR ── */
        .toolbar{position:relative;z-index:9;display:flex;align-items:center;height:38px;
          background:var(--rough);border-bottom:1px solid rgba(74,171,109,.2);
          padding:0 12px;overflow-x:auto;animation:fadeUp .35s ease both .05s;}
        .tab-item{display:flex;align-items:center;gap:7px;padding:0 16px;height:100%;
          font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--sand-trap);
          cursor:pointer;border-right:1px solid rgba(74,171,109,.12);transition:all .2s;white-space:nowrap;position:relative;}
        .tab-item:first-child{border-left:1px solid rgba(74,171,109,.12);}
        .tab-item.active{color:var(--cream);background:rgba(46,125,79,.25);}
        .tab-item.active::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--light-green);}
        .tab-dot{width:7px;height:7px;border-radius:50%;background:var(--gold);opacity:.6;}
        .tab-item.active .tab-dot{opacity:1;background:var(--light-green);}
        .tab-item.has-err .tab-dot{background:var(--flag-red);opacity:1;}
        .tab-count{display:inline-flex;align-items:center;justify-content:center;
          min-width:16px;height:16px;border-radius:8px;font-size:9px;font-weight:700;padding:0 4px;
          background:rgba(74,171,109,.15);color:var(--sand-trap);border:1px solid rgba(74,171,109,.2);}
        .tab-count.err{background:rgba(192,57,43,.15);color:var(--flag-red);border-color:rgba(192,57,43,.3);}
        .toolbar-spc{flex:1;}
        .par-info{font-family:'EB Garamond',serif;font-size:12px;letter-spacing:.08em;color:var(--sand-trap);padding-right:4px;}
        .par-info strong{color:var(--light-green);font-weight:500;}

        /* ── WORKSPACE ── */
        .workspace{position:relative;z-index:5;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr auto;
          height:calc(100vh - 52px - 38px - 44px - 30px);animation:fadeUp .4s ease both .1s;}

        /* ── EDITOR PANE ── */
        .editor-pane{display:flex;flex-direction:column;border-right:1px solid var(--stroke);overflow:hidden;}
        .pane-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;
          background:rgba(13,38,21,.6);border-bottom:1px solid rgba(74,171,109,.15);flex-shrink:0;}
        .pane-title{font-family:'EB Garamond',serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--light-green);}
        .pane-badge{font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border-radius:2px;
          background:rgba(74,171,109,.12);border:1px solid rgba(74,171,109,.25);color:var(--sand-trap);letter-spacing:.06em;}
        .editor-wrap{display:flex;flex:1;overflow:hidden;}
        .line-nums{width:46px;flex-shrink:0;background:rgba(9,26,14,.8);border-right:1px solid rgba(74,171,109,.1);
          padding:14px 0;overflow:hidden;user-select:none;}
        .ln{display:block;height:21px;line-height:21px;text-align:right;padding-right:10px;
          font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(74,171,109,.3);}
        .ln.cur{color:var(--gold);}
        .code-ta{flex:1;background:var(--clubhouse);border:none;resize:none;outline:none;color:var(--cream);
          font-family:'JetBrains Mono',monospace;font-size:13px;line-height:21px;padding:14px 16px;
          caret-color:var(--light-green);}
        .code-ta::selection{background:rgba(74,171,109,.2);}
        .console-area{border-top:1px solid rgba(74,171,109,.15);background:rgba(13,38,21,.5);padding:10px 14px;flex-shrink:0;}
        .console-lbl{font-family:'EB Garamond',serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
          color:var(--sand-trap);margin-bottom:6px;display:block;}
        .console-ta{width:100%;height:56px;background:rgba(9,26,14,.8);border:1px solid rgba(74,171,109,.2);
          border-radius:3px;color:var(--light-green);font-family:'JetBrains Mono',monospace;font-size:12px;
          padding:6px 10px;resize:none;outline:none;line-height:1.6;}
        .console-ta:focus{border-color:rgba(74,171,109,.4);}

        /* ── OUTPUT PANE ── */
        .output-pane{display:flex;flex-direction:column;overflow:hidden;background:rgba(9,26,14,.4);}
        .sc-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;
          background:rgba(13,38,21,.7);border-bottom:1px solid rgba(74,171,109,.15);flex-shrink:0;}
        .sc-meta{display:flex;align-items:center;gap:16px;}
        .sc-stat{display:flex;align-items:center;gap:6px;font-family:'EB Garamond',serif;font-size:12px;letter-spacing:.08em;}
        .sc-stat .lbl{color:var(--sand-trap);} .sc-stat .val{color:var(--cream);font-weight:500;}
        .sc-status{display:flex;align-items:center;gap:5px;font-family:'JetBrains Mono',monospace;font-size:10px;}
        .dot{width:6px;height:6px;border-radius:50%;background:var(--light-green);animation:pulse 2s infinite;}
        .dot.idle{background:var(--sand-trap);animation:none;}
        .dot.err{background:var(--flag-red);animation:none;}
        .dot.ok{background:var(--light-green);animation:none;}
        .output-body{flex:1;overflow-y:auto;padding:14px;font-family:'JetBrains Mono',monospace;font-size:12px;}
        .phase-hdr{font-family:'EB Garamond',serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
          color:var(--sand-trap);padding:8px 0 10px;border-bottom:1px solid rgba(74,171,109,.15);margin-bottom:10px;}
        .token-row{display:grid;grid-template-columns:36px 130px 1fr 56px 56px;padding:4px 8px;
          border-bottom:1px solid rgba(58,92,66,.3);font-size:11px;border-radius:2px;transition:background .1s;}
        .token-row:hover{background:rgba(46,125,79,.1);}
        .sym-row{display:grid;grid-template-columns:1fr 80px 80px 60px 60px;padding:6px 10px;
          border-bottom:1px solid rgba(58,92,66,.3);font-size:11px;border-radius:2px;}
        .sym-row:hover{background:rgba(46,125,79,.1);}
        .err-item{padding:8px 12px;border-radius:3px;border-left:2px solid var(--flag-red);
          background:rgba(192,57,43,.08);margin-bottom:6px;font-size:12px;animation:slideIn .2s ease both;}
        .warn-item{padding:8px 12px;border-radius:3px;border-left:2px solid var(--gold-light);
          background:rgba(212,168,62,.08);margin-bottom:6px;font-size:12px;animation:slideIn .2s ease both;}
        .ok-item{padding:8px 12px;border-radius:3px;border-left:2px solid var(--light-green);
          background:rgba(74,171,109,.08);font-size:12px;}
        .out-line{padding:5px 10px;border-radius:3px;background:rgba(13,38,21,.6);
          border-left:2px solid var(--light-green);font-size:13px;color:var(--light-green);
          margin-bottom:5px;animation:slideIn .2s ease both;}
        .trace-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:3px;
          border-bottom:1px solid rgba(58,92,66,.3);font-size:11px;}
        .trace-row:hover{background:rgba(46,125,79,.1);}
        .op-pill{display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;min-width:58px;text-align:center;}
        .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;opacity:.35;}
        .flag-wrap{position:relative;width:40px;height:56px;}
        .flag-pole{position:absolute;left:12px;bottom:0;width:2px;height:50px;
          background:linear-gradient(180deg,var(--sand-light),var(--sand-trap));border-radius:1px;}
        .flag-pennant{position:absolute;left:14px;top:6px;width:0;height:0;
          border-top:8px solid var(--flag-red);border-bottom:8px solid transparent;border-left:20px solid var(--flag-red);}
        .flag-base{position:absolute;bottom:0;left:4px;width:18px;height:5px;background:var(--putting-green);border-radius:50%;}
        .empty-hint{font-family:'EB Garamond',serif;font-size:14px;letter-spacing:.06em;color:var(--sand-trap);}

        /* ── SCORECARD STRIP ── */
        .sc-strip{grid-column:1/-1;display:flex;align-items:center;
          background:linear-gradient(180deg,var(--deep-rough),rgba(9,26,14,.95));
          border-top:1px solid rgba(181,137,42,.3);padding:0 20px;height:44px;overflow-x:auto;}
        .sc-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-width:60px;height:100%;border-right:1px solid rgba(74,171,109,.12);padding:0 10px;}
        .sc-cell:first-child{border-left:1px solid rgba(74,171,109,.12);}
        .sc-ch{font-family:'EB Garamond',serif;font-size:9px;letter-spacing:.12em;color:var(--sand-trap);text-transform:uppercase;}
        .sc-cv{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--cream);font-weight:500;}
        .sc-cv.good{color:var(--light-green);} .sc-cv.warn{color:var(--gold-light);} .sc-cv.bad{color:var(--flag-red);}
        .sc-spc{flex:1;}
        .teeoff-btn{display:flex;align-items:center;gap:10px;padding:0 24px;height:32px;
          background:linear-gradient(135deg,var(--putting-green) 0%,var(--fairway) 100%);
          border:1px solid var(--light-green);border-radius:3px;color:var(--white-ball);
          font-family:'Playfair Display',serif;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
          cursor:pointer;transition:all .25s;box-shadow:0 2px 12px rgba(74,171,109,.2);flex-shrink:0;}
        .teeoff-btn:hover{background:linear-gradient(135deg,#3a9461 0%,#2a6040 100%);
          box-shadow:0 3px 18px rgba(74,171,109,.4);transform:translateY(-1px);}
        .teeoff-btn:active{transform:translateY(0);}
        .teeoff-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
        .ball-icon{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#d0ccc4);
          box-shadow:inset -1px -1px 2px rgba(0,0,0,.3);flex-shrink:0;}

        /* ── STATUS BAR ── */
        .status-bar{position:relative;z-index:10;display:flex;align-items:center;justify-content:space-between;
          height:30px;padding:0 16px;background:var(--fairway);border-top:1px solid rgba(74,171,109,.2);
          font-family:'JetBrains Mono',monospace;font-size:10.5px;color:rgba(242,234,216,.5);
          animation:fadeUp .4s ease both .15s;}
        .sb-l,.sb-r{display:flex;align-items:center;gap:16px;}
        .sb-item{display:flex;align-items:center;gap:5px;}
        .si{color:var(--light-green);opacity:.7;}
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ══ TOPBAR ══ */}
        <header className="topbar">
          <div className="logo-area">
            <div className="logo-badge" />
            <div>
              <div className="logo-text">Golf<span>Script</span></div>
              <div className="logo-sub">Code on the Green</div>
            </div>
          </div>

          <div className="club-area">
            <span className="club-label">Samples</span>
            <select className="club-select" onChange={e => { setCode(SAMPLES[e.target.value]); setTimeout(compile, 20); }}>
              {Object.keys(SAMPLES).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="nav-actions">
            <button className="nav-btn" onClick={() => { setCode(''); setResult(null); }}>New Round</button>
            <button className="nav-btn" onClick={() => setActiveTab('semantic')}>Caddie</button>
            <button className="nav-btn" onClick={() => setActiveTab('output')}>Scoreboard</button>
          </div>
        </header>

        {/* ══ TOOLBAR ══ */}
        <div className="toolbar">
          {tabs.map(t => (
            <div key={t.id} className={`tab-item${activeTab === t.id ? ' active' : ''}${t.err ? ' has-err' : ''}`} onClick={() => setActiveTab(t.id)}>
              <span className="tab-dot" />
              <span>{t.label}</span>
              {t.count > 0 && <span className={`tab-count${t.err ? ' err' : ''}`}>{t.count}</span>}
            </div>
          ))}
          <div className="toolbar-spc" />
          <div className="par-info">Hole <strong>1</strong> &nbsp;·&nbsp; Par <strong>4</strong> &nbsp;·&nbsp; tee → drive → putt</div>
        </div>

        {/* ══ WORKSPACE ══ */}
        <div className="workspace">

          {/* ── EDITOR PANE ── */}
          <div className="editor-pane">
            <div className="pane-header">
              <span className="pane-title">Fairway Editor</span>
              <span className="pane-badge">{lineCount} lines · {code.length} chars</span>
            </div>
            <div className="editor-wrap">
              <div className="line-nums" ref={lineNumsRef}>
                {lineNums.map(n => <span key={n} className={`ln${n === cursorPos.line ? ' cur' : ''}`}>{n}</span>)}
              </div>
              <textarea
                ref={textareaRef}
                className="code-ta"
                value={code}
                onChange={e => setCode(e.target.value)}
                onScroll={handleScroll}
                onKeyUp={trackCursor}
                onClick={trackCursor}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const s = e.target.selectionStart, end = e.target.selectionEnd;
                    const v = code.substring(0, s) + '  ' + code.substring(end);
                    setCode(v);
                    setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0);
                  }
                }}
                spellCheck={false}
                placeholder="// Write your GolfScript program here..."
              />
            </div>
            <div className="console-area">
              <span className="console-lbl">Console Input — one value per line</span>
              <textarea className="console-ta" value={inputValues} onChange={e => setInputValues(e.target.value)} placeholder="10&#10;20" spellCheck={false} />
            </div>
          </div>

          {/* ── OUTPUT / SCORECARD PANE ── */}
          <div className="output-pane">
            <div className="sc-header">
              <span className="pane-title">Scorecard</span>
              <div className="sc-meta">
                <div className="sc-stat"><span className="lbl">Tokens</span><span className="val">{tokenCount || '—'}</span></div>
                <div className="sc-stat"><span className="lbl">Lines</span><span className="val">{lineCount}</span></div>
              </div>
              <div className="sc-status">
                {running  && <><div className="dot" /><span style={{ color: 'var(--sand-trap)' }}>Running…</span></>}
                {!running && !result && <><div className="dot idle" /><span style={{ color: 'var(--sand-trap)' }}>Ready</span></>}
                {!running && result && hasErrors && <><div className="dot err" /><span style={{ color: 'var(--flag-red)' }}>{allErrors.length} error{allErrors.length !== 1 ? 's' : ''}</span></>}
                {!running && result && !hasErrors && <><div className="dot ok" /><span style={{ color: 'var(--light-green)' }}>✓ Clean</span></>}
              </div>
            </div>

            <div className="output-body">
              {result?.fatalError && <div className="err-item">💥 Fatal: {result.fatalError}</div>}

              {!result && (
                <div className="empty-state">
                  <div className="flag-wrap">
                    <div className="flag-pole" /><div className="flag-pennant" /><div className="flag-base" />
                  </div>
                  <div className="empty-hint">Tee off to compile your code</div>
                </div>
              )}

              {result && !result.fatalError && (
                <>
                  {/* TOKENS TAB */}
                  {activeTab === 'tokens' && (
                    <div>
                      <div className="phase-hdr">Lexical Analysis · {tokenCount} tokens</div>
                      {result.lexErrors.map((e, i) => <div key={i} className="err-item">✗ L{e.line} C{e.column}: {e.message}</div>)}
                      <div className="token-row" style={{ background: 'rgba(13,38,21,.8)', fontWeight: 700, color: 'var(--sand-trap)', marginBottom: 4 }}>
                        <span>#</span><span>Type</span><span>Value</span><span>Line</span><span>Col</span>
                      </div>
                      {result.tokens.filter(t => t.type !== TOKEN_TYPES.EOF).map((tok, i) => (
                        <div key={i} className="token-row">
                          <span style={{ color: 'rgba(201,169,110,.4)' }}>{i + 1}</span>
                          <span style={{ color: TOKEN_COLORS[tok.type] || 'var(--cream)', fontWeight: 600 }}>{tok.type}</span>
                          <span style={{ color: 'var(--cream)' }}>{tok.value !== null ? String(tok.value) : '—'}</span>
                          <span style={{ color: 'var(--sand-trap)' }}>{tok.line}</span>
                          <span style={{ color: 'var(--sand-trap)' }}>{tok.column}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AST TAB */}
                  {activeTab === 'ast' && (
                    <div>
                      <div className="phase-hdr">Abstract Syntax Tree · {result.ast?.body?.length || 0} top-level nodes</div>
                      {result.parseErrors.map((e, i) => <div key={i} className="err-item">✗ L{e.line} C{e.column}: {e.message}</div>)}
                      {result.ast ? <AstNode node={result.ast} depth={0} /> : <span style={{ color: 'var(--sand-trap)' }}>No AST — parse failed</span>}
                    </div>
                  )}

                  {/* SEMANTIC TAB */}
                  {activeTab === 'semantic' && (
                    <div>
                      <div className="phase-hdr">Semantic Analysis · Type &amp; Scope Checking</div>
                      {result.semanticErrors.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 9, color: 'var(--flag-red)', letterSpacing: 2, marginBottom: 6, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>Errors</div>
                          {result.semanticErrors.map((e, i) => <div key={i} className="err-item">✗ Line {e.line}: {e.message}</div>)}
                        </div>
                      )}
                      {result.semanticWarnings.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 9, color: 'var(--gold-light)', letterSpacing: 2, marginBottom: 6, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>Warnings</div>
                          {result.semanticWarnings.map((w, i) => <div key={i} className="warn-item">⚠ Line {w.line}: {w.message}</div>)}
                        </div>
                      )}
                      {result.semanticErrors.length === 0 && result.semanticWarnings.length === 0 && (
                        <div className="ok-item">✓ No semantic errors or warnings</div>
                      )}
                      {result.symbolTable.size > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 9, color: 'var(--light-green)', letterSpacing: 2, marginBottom: 6, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>
                            Symbol Table ({result.symbolTable.size} variable{result.symbolTable.size !== 1 ? 's' : ''})
                          </div>
                          <div className="sym-row" style={{ background: 'rgba(13,38,21,.8)', color: 'var(--sand-trap)', fontWeight: 700, fontSize: 10 }}>
                            <span>NAME</span><span>DECL LINE</span><span>INIT</span><span>READS</span><span>WRITES</span>
                          </div>
                          {[...result.symbolTable.entries()].map(([name, sym]) => (
                            <div key={name} className="sym-row">
                              <span style={{ color: 'var(--light-green)', fontWeight: 600 }}>{name}</span>
                              <span style={{ color: 'var(--sand-trap)' }}>{sym.declaredLine}</span>
                              <span style={{ color: sym.initialized ? 'var(--light-green)' : 'var(--flag-red)' }}>{sym.initialized ? '✓' : '✗'}</span>
                              <span>{sym.useCount}</span>
                              <span>{sym.assignCount}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* OUTPUT TAB */}
                  {activeTab === 'output' && (
                    <div>
                      <div className="phase-hdr">Execution Output</div>
                      {result.exec?.error && <div className="err-item">💥 Runtime L{result.exec.error.line}: {result.exec.error.message}</div>}
                      {hasErrors && <div className="err-item">✗ Execution halted — fix errors in Semantic tab first</div>}
                      {!hasErrors && result.exec && (
                        <>
                          {result.exec.output.length > 0 ? (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 9, color: 'var(--light-green)', letterSpacing: 2, marginBottom: 8, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>Console Output</div>
                              {result.exec.output.map((v, i) => (
                                <div key={i} className="out-line" style={{ animationDelay: `${i * 50}ms` }}>
                                  <span style={{ color: 'rgba(74,171,109,.4)', marginRight: 8 }}>[{i + 1}]</span>{v}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="ok-item">Program ran successfully — no putt statements</div>
                          )}
                          {Object.keys(result.exec.env).length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 9, color: 'var(--sand-trap)', letterSpacing: 2, marginBottom: 6, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>Final Variable State</div>
                              {Object.entries(result.exec.env).map(([n, v]) => (
                                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid rgba(58,92,66,.3)', fontSize: 12 }}>
                                  <span style={{ color: 'var(--light-green)' }}>{n}</span>
                                  <span style={{ color: 'var(--gold-light)' }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {result.exec.trace.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 9, color: 'var(--sand-trap)', letterSpacing: 2, marginBottom: 6, fontFamily: "'EB Garamond',serif", textTransform: 'uppercase' }}>Execution Trace</div>
                              {result.exec.trace.map((step, i) => {
                                const opColor = { DECLARE: 'var(--sky-blue)', INPUT: 'var(--light-green)', OUTPUT: 'var(--gold-light)', ASSIGN: 'var(--sand-light)' }[step.op] || 'var(--sand-trap)';
                                return (
                                  <div key={i} className="trace-row">
                                    <span style={{ color: 'rgba(201,169,110,.35)', minWidth: 20 }}>{i + 1}</span>
                                    <span className="op-pill" style={{ background: `${opColor}22`, color: opColor, border: `1px solid ${opColor}44` }}>{step.op}</span>
                                    <span style={{ color: 'var(--sand-trap)' }}>L{step.line}</span>
                                    <span style={{ color: 'var(--cream)' }}>{step.desc}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── SCORECARD STRIP ── */}
          <div className="sc-strip">
            {[
              { ch: 'Hole',     cv: '1',                                     cls: '' },
              { ch: 'Par',      cv: '4',                                     cls: '' },
              { ch: 'Tokens',   cv: tokenCount || '—',                       cls: '' },
              { ch: 'Score',    cv: score.label,                             cls: score.cls },
              { ch: 'Errors',   cv: allErrors.length,                        cls: allErrors.length > 0 ? 'bad' : '' },
              { ch: 'Warnings', cv: warnCount,                               cls: warnCount > 0 ? 'warn' : '' },
            ].map((c, i) => (
              <div key={i} className="sc-cell">
                <span className="sc-ch">{c.ch}</span>
                <span className={`sc-cv${c.cls ? ' ' + c.cls : ''}`}>{c.cv}</span>
              </div>
            ))}
            <div className="sc-spc" />
            <button className="nav-btn" style={{ marginRight: 10, height: 32 }} onClick={() => { setResult(null); }}>Clear</button>
            <button className="teeoff-btn" onClick={compile} disabled={running}>
              <div className="ball-icon" />
              {running ? 'Playing…' : 'Tee Off'}
            </button>
          </div>
        </div>

        {/* ══ STATUS BAR ══ */}
        <footer className="status-bar">
          <div className="sb-l">
            <div className="sb-item"><span className="si">⬤</span><span>GolfScript v1.0</span></div>
            <div className="sb-item"><span className="si">⌀</span><span>GolfLang</span></div>
            <div className="sb-item"><span className="si">⏎</span><span>LF · UTF-8</span></div>
          </div>
          <div className="sb-r">
            <div className="sb-item"><span>Ln {cursorPos.line}, Col {cursorPos.col}</span></div>
            <div className="sb-item"><span className="si">✦</span><span>Augusta National Edition</span></div>
          </div>
        </footer>
      </div>
    </>
  );
}
