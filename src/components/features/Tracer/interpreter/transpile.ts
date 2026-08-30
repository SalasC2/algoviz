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

export type ParamHint = { name: string; type: string | null };

// Reads a function's parameter names — and, if the pasted code is
// TypeScript, its declared types — straight from the code as typed. Works
// for any function in any pasted problem, not a fixed list: it just parses
// whatever's currently in the box and finds the one named `entryName`.
export function getFunctionParamHints(code: string, entryName: string): ParamHint[] {
  try {
    const sourceFile = ts.createSourceFile("tracer-input.tsx", code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
    let params: ts.NodeArray<ts.ParameterDeclaration> | null = null;

    const declaredName = (node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction): string | undefined => {
      if ("name" in node && node.name) return node.name.text;
      const parent = node.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      return undefined;
    };

    const visit = (node: ts.Node) => {
      if (params) return;
      if (
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
        declaredName(node) === entryName
      ) {
        params = node.parameters;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (!params) return [];
    return (params as ts.NodeArray<ts.ParameterDeclaration>).map((p) => ({
      name: p.name.getText(sourceFile),
      type: p.type ? p.type.getText(sourceFile) : null,
    }));
  } catch {
    return [];
  }
}
