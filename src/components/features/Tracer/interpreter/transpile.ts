import ts from "typescript";

// Strips TS type annotations (interfaces, typed params, generics, etc.) so
// the interpreter — which only ever parses plain JS — can run TS input
// unchanged otherwise. This is a syntax-only transform: it does not
// type-check, so type errors in the pasted code are silently ignored (the
// interpreter will still catch real runtime errors).
export function stripTypes(code: string): string {
  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
        removeComments: false,
      },
    });
    return result.outputText;
  } catch {
    return code;
  }
}
