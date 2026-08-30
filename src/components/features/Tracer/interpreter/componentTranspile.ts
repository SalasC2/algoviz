import ts from "typescript";

export type ComponentTranspileResult = { ok: true; js: string } | { ok: false; error: string };

// Strips lines that would be syntax errors in a plain (non-module) script —
// we don't support real module resolution, same as Function mode. Pasted
// component code almost always starts with `import ... from 'react'` and/or
// `export default function App() {}`; both are silently dropped, same
// treatment as Phase 1's TS-type stripping.
function stripModuleSyntax(code: string): string {
  return code
    .replace(/^\s*import\s[^;]*;?\s*$/gm, "")
    .replace(/^(\s*)export\s+default\s+/gm, "$1")
    .replace(/^(\s*)export\s+/gm, "$1");
}

// Transpiles pasted JSX/TSX into plain JS calling React.createElement(...)
// (the "classic" JSX runtime — simplest, since we pass a real `React` value
// into scope at execution time rather than needing the automatic runtime's
// implicit jsx-runtime import).
export function transpileComponent(code: string): ComponentTranspileResult {
  const stripped = stripModuleSyntax(code);
  try {
    const result = ts.transpileModule(stripped, {
      fileName: "component.tsx",
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const errors = (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      const first = errors[0];
      const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
      return { ok: false, error: `Syntax error: ${message}` };
    }
    return { ok: true, js: result.outputText };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
