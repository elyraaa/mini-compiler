import { tokenize, LexerResult } from "./lexer";
import { parse, ParseResult, ProgramNode } from "./parser";
import { analyze, SemanticResult } from "./semantic";
import { interpret, InterpreterResult } from "./interpreter";
import { astToTree, TreeNode } from "./astPrinter";

export interface CompilerResult {
  lexer: LexerResult;
  parser: ParseResult;
  semantic: SemanticResult | null;
  interpreter: InterpreterResult | null;
  ast: TreeNode | null;
  hasErrors: boolean;
  phase: "lexer" | "parser" | "semantic" | "runtime" | "success";
}

export function compile(
  source: string,
  inputValues: number[] = []
): CompilerResult {
  // Lexical Analysis
  const lexerResult = tokenize(source);

  if (lexerResult.errors.length > 0) {
    return {
      lexer: lexerResult,
      parser: { ast: null, errors: [] },
      semantic: null,
      interpreter: null,
      ast: null,
      hasErrors: true,
      phase: "lexer",
    };
  }

  // Syntax Analysis
  const parseResult = parse(lexerResult.tokens);

  if (parseResult.errors.length > 0 || !parseResult.ast) {
    return {
      lexer: lexerResult,
      parser: parseResult,
      semantic: null,
      interpreter: null,
      ast: parseResult.ast ? astToTree(parseResult.ast) : null,
      hasErrors: true,
      phase: "parser",
    };
  }

  const ast = parseResult.ast as ProgramNode;
  const treeNode = astToTree(ast);

  // Semantic Analysis
  const semanticResult = analyze(ast);

  const semanticErrors = semanticResult.errors.filter(
    (e) => e.severity === "error"
  );
  if (semanticErrors.length > 0) {
    return {
      lexer: lexerResult,
      parser: parseResult,
      semantic: semanticResult,
      interpreter: null,
      ast: treeNode,
      hasErrors: true,
      phase: "semantic",
    };
  }

  // Interpretation
  const interpreterResult = interpret(ast, semanticResult.symbolTable, inputValues);

  const hasRuntimeErrors = interpreterResult.errors.length > 0;

  return {
    lexer: lexerResult,
    parser: parseResult,
    semantic: semanticResult,
    interpreter: interpreterResult,
    ast: treeNode,
    hasErrors: hasRuntimeErrors,
    phase: hasRuntimeErrors ? "runtime" : "success",
  };
}
