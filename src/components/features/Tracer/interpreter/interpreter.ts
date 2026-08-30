import * as acorn from "acorn";
import type { Snapshot, SnapValue, TraceResult, FrameSnapshot } from "./types";
import { stripTypes } from "./transpile";

// A deliberately small, sandboxed subset-of-JS interpreter for the Execution
// Tracer proof of concept. It is NOT a general JS engine — see CLAUDE.md /
// the tracer implementation brief for the exact scope boundaries (no async,
// no classes, no try/catch, no import/require).
//
// Simplification: each function call gets exactly one Scope (no per-block
// scoping). This is intentionally loose vs. real JS block scoping — fine for
// displaying LeetCode-style solution functions, not a spec-compliant engine.

export class InterpreterError extends Error {}
class ReturnSignal {
  value: unknown;
  constructor(value: unknown) {
    this.value = value;
  }
}
class BreakSignal {}
class ContinueSignal {}

const GLOBALS: Record<string, unknown> = {
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Infinity,
  NaN,
  undefined,
};

class Scope {
  vars = new Map<string, unknown>();
  parent: Scope | null;
  constructor(parent: Scope | null) {
    this.parent = parent;
  }

  declare(name: string, value: unknown) {
    this.vars.set(name, value);
  }

  has(name: string): boolean {
    return scopeChainHas(this, name);
  }

  get(name: string): unknown {
    return scopeChainGet(this, name);
  }

  set(name: string, value: unknown) {
    scopeChainSet(this, name, value);
  }
}

function scopeChainHas(scope: Scope, name: string): boolean {
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.vars.has(name)) return true;
  }
  return name in GLOBALS;
}

function scopeChainGet(scope: Scope, name: string): unknown {
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.vars.has(name)) return s.vars.get(name);
  }
  if (name in GLOBALS) return GLOBALS[name];
  throw new InterpreterError(`${name} is not defined`);
}

function scopeChainSet(scope: Scope, name: string, value: unknown) {
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.vars.has(name)) {
      s.vars.set(name, value);
      return;
    }
  }
  throw new InterpreterError(`${name} is not defined`);
}

type TracedFunction = {
  name: string;
  params: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  isExpressionBody: boolean;
  startLine: number | null;
  endLine: number | null;
};

type Frame = {
  id: number;
  functionName: string;
  scope: Scope;
  line: number | null;
  returning: boolean;
};

type Ctx = {
  functions: Map<string, TracedFunction>;
  callStack: Frame[];
  snapshots: Snapshot[];
  stepsRemaining: number;
  nextFrameId: number;
  // Nested `function helper() {}` declarations close over the scope of the
  // function they're declared inside (the common LeetCode "solution fn with
  // an inner dfs/backtrack helper" pattern). Captured lazily, by reference,
  // the first time execution reaches the declaration statement.
  closureScopes: Map<string, Scope>;
};

// ---------- value snapshotting (deep copy by value, for the scrubber) ----------

function snapshotValue(value: unknown, seen: Set<unknown> = new Set()): SnapValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return { kind: "primitive", value };
  }
  if (typeof value === "function") {
    return { kind: "function", name: (value as { name?: string }).name || "anonymous" };
  }
  if (seen.has(value)) {
    return { kind: "primitive", value: "[Circular]" };
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return { kind: "array", items: value.map((v) => snapshotValue(v, seen)) };
  }
  if (value instanceof Map) {
    return {
      kind: "map",
      entries: Array.from(value.entries()).map(([k, v]) => [snapshotValue(k, seen), snapshotValue(v, seen)]),
    };
  }
  if (value instanceof Set) {
    return { kind: "set", items: Array.from(value.values()).map((v) => snapshotValue(v, seen)) };
  }
  if (typeof value === "object") {
    return {
      kind: "object",
      entries: Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, snapshotValue(v, seen)]),
    };
  }
  return { kind: "primitive", value: String(value) };
}

function buildSnapshot(
  ctx: Ctx,
  line: number | null,
  status: Snapshot["status"] = "running",
  returnValue?: unknown,
  error?: string
): Snapshot {
  const stack: FrameSnapshot[] = ctx.callStack.map((f) => ({
    id: f.id,
    functionName: f.functionName,
    line: f.line,
    returning: f.returning,
    vars: Array.from(f.scope.vars.entries()).map(([k, v]) => [k, snapshotValue(v)]),
  }));
  return {
    step: ctx.snapshots.length,
    line,
    stack,
    status,
    returnValue: returnValue !== undefined ? snapshotValue(returnValue) : undefined,
    error,
  };
}

function* stepYield(ctx: Ctx, line: number | null) {
  if (ctx.stepsRemaining-- <= 0) {
    throw new InterpreterError("Step limit exceeded — this looks like an infinite loop.");
  }
  ctx.snapshots.push(buildSnapshot(ctx, line));
  yield;
}

// ---------- member access / operators (real JS semantics, real JS values) ----------

function getMember(obj: unknown, prop: PropertyKey): unknown {
  if (obj === null || obj === undefined) {
    throw new InterpreterError(`Cannot read properties of ${obj} (reading '${String(prop)}')`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = (obj as any)[prop];
  if (typeof val === "function") return val.bind(obj);
  return val;
}

function setMember(obj: unknown, prop: PropertyKey, value: unknown) {
  if (obj === null || obj === undefined) {
    throw new InterpreterError(`Cannot set properties of ${obj} (setting '${String(prop)}')`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[prop] = value;
}

function applyBinary(op: string, l: any, r: any): unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return l / r;
    case "%":
      return l % r;
    case "**":
      return l ** r;
    case "==":
      return l == r;
    case "!=":
      return l != r;
    case "===":
      return l === r;
    case "!==":
      return l !== r;
    case "<":
      return l < r;
    case "<=":
      return l <= r;
    case ">":
      return l > r;
    case ">=":
      return l >= r;
    case "&":
      return l & r;
    case "|":
      return l | r;
    case "^":
      return l ^ r;
    case "<<":
      return l << r;
    case ">>":
      return l >> r;
    case ">>>":
      return l >>> r;
    default:
      throw new InterpreterError(`Unsupported operator: ${op}`);
  }
}

function applyUnary(op: string, v: unknown): unknown {
  switch (op) {
    case "!":
      return !v;
    case "-":
      return -(v as number);
    case "+":
      return +(v as number);
    case "~":
      return ~(v as number);
    case "typeof":
      return typeof v;
    default:
      throw new InterpreterError(`Unsupported unary operator: ${op}`);
  }
}

// ---------- pattern binding (params, destructuring, for-of targets) ----------

function bindPattern(pattern: any, value: unknown, scope: Scope, ctx: Ctx) { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (pattern.type) {
    case "Identifier":
      scope.declare(pattern.name, value);
      return;
    case "ArrayPattern": {
      const arr = (value ?? []) as unknown[];
      pattern.elements.forEach((el: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (el) bindPattern(el, arr[i], scope, ctx);
      });
      return;
    }
    case "ObjectPattern": {
      pattern.properties.forEach((p: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const key = p.key.name ?? p.key.value;
        bindPattern(p.value, (value as Record<string, unknown> | undefined)?.[key], scope, ctx);
      });
      return;
    }
    case "AssignmentPattern": {
      const v = value === undefined ? evalSync(pattern.right, scope, ctx) : value;
      bindPattern(pattern.left, v, scope, ctx);
      return;
    }
    case "RestElement":
      bindPattern(pattern.argument, value, scope, ctx);
      return;
    default:
      throw new InterpreterError(`Unsupported binding pattern: ${pattern.type}`);
  }
}

function bindArgsToParams(params: any[], args: unknown[], scope: Scope, ctx: Ctx) { // eslint-disable-line @typescript-eslint/no-explicit-any
  params.forEach((p, i) => {
    if (p.type === "RestElement") {
      bindPattern(p.argument, args.slice(i), scope, ctx);
    } else {
      bindPattern(p, args[i], scope, ctx);
    }
  });
}

function evalArgs(nodes: any[], evalOne: (n: any) => unknown): unknown[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: unknown[] = [];
  for (const n of nodes) {
    if (n.type === "SpreadElement") {
      out.push(...(evalOne(n.argument) as unknown[]));
    } else {
      out.push(evalOne(n));
    }
  }
  return out;
}

// ---------- synchronous (non-stepped) evaluator — used for native callbacks ----------
// e.g. arr.map(x => x * 2): the callback body isn't stepped through, it just runs.

function evalSync(node: any, scope: Scope, ctx: Ctx): unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (node.type) {
    case "Literal":
      return node.value;
    case "Identifier":
      return scope.get(node.name);
    case "ThisExpression":
      return undefined;
    case "ArrayExpression":
      return evalArgs(node.elements.filter((e: any) => e !== null), (n) => evalSync(n, scope, ctx)); // eslint-disable-line @typescript-eslint/no-explicit-any
    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const p of node.properties) {
        const key = p.computed ? (evalSync(p.key, scope, ctx) as string) : p.key.name ?? p.key.value;
        obj[key] = evalSync(p.value, scope, ctx);
      }
      return obj;
    }
    case "TemplateLiteral": {
      let out = "";
      node.quasis.forEach((q: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        out += q.value.cooked;
        if (i < node.expressions.length) out += String(evalSync(node.expressions[i], scope, ctx));
      });
      return out;
    }
    case "BinaryExpression":
      return applyBinary(node.operator, evalSync(node.left, scope, ctx), evalSync(node.right, scope, ctx));
    case "LogicalExpression": {
      const l = evalSync(node.left, scope, ctx);
      if (node.operator === "&&" && !l) return l;
      if (node.operator === "||" && l) return l;
      if (node.operator === "??" && l !== null && l !== undefined) return l;
      return evalSync(node.right, scope, ctx);
    }
    case "UnaryExpression":
      if (node.operator === "typeof" && node.argument.type === "Identifier" && !scope.has(node.argument.name)) {
        return "undefined";
      }
      return applyUnary(node.operator, evalSync(node.argument, scope, ctx));
    case "UpdateExpression": {
      const old = evalSync(node.argument, scope, ctx) as number;
      const next = node.operator === "++" ? old + 1 : old - 1;
      assignToSync(node.argument, next, scope, ctx);
      return node.prefix ? next : old;
    }
    case "AssignmentExpression": {
      let value = evalSync(node.right, scope, ctx);
      if (node.operator !== "=") {
        const current = evalSync(node.left, scope, ctx);
        value = applyBinary(node.operator.slice(0, -1), current, value);
      }
      assignToSync(node.left, value, scope, ctx);
      return value;
    }
    case "ConditionalExpression":
      return evalSync(node.test, scope, ctx)
        ? evalSync(node.consequent, scope, ctx)
        : evalSync(node.alternate, scope, ctx);
    case "MemberExpression": {
      const obj = evalSync(node.object, scope, ctx);
      const prop = node.computed ? (evalSync(node.property, scope, ctx) as PropertyKey) : node.property.name;
      return getMember(obj, prop);
    }
    case "CallExpression": {
      let thisVal: unknown;
      let fn: unknown;
      if (node.callee.type === "MemberExpression") {
        thisVal = evalSync(node.callee.object, scope, ctx);
        const prop = node.callee.computed
          ? (evalSync(node.callee.property, scope, ctx) as PropertyKey)
          : node.callee.property.name;
        fn = getMember(thisVal, prop);
      } else {
        fn = evalSync(node.callee, scope, ctx);
      }
      const args = evalArgs(node.arguments, (n) => evalSync(n, scope, ctx));
      if (typeof fn !== "function") throw new InterpreterError("Attempted to call a non-function value");
      return (fn as (...a: unknown[]) => unknown).apply(thisVal, args);
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return makeSyncClosure(node, scope, ctx);
    case "NewExpression":
      return evalNew(node, (n) => evalSync(n, scope, ctx));
    case "SequenceExpression": {
      let last: unknown;
      for (const e of node.expressions) last = evalSync(e, scope, ctx);
      return last;
    }
    default:
      throw new InterpreterError(`Unsupported expression: ${node.type}`);
  }
}

function assignToSync(target: any, value: unknown, scope: Scope, ctx: Ctx) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (target.type === "Identifier") {
    scope.set(target.name, value);
    return;
  }
  if (target.type === "MemberExpression") {
    const obj = evalSync(target.object, scope, ctx);
    const prop = target.computed ? (evalSync(target.property, scope, ctx) as PropertyKey) : target.property.name;
    setMember(obj, prop, value);
    return;
  }
  throw new InterpreterError("Unsupported assignment target");
}

function execStmtSync(node: any, scope: Scope, ctx: Ctx) { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (node.type) {
    case "BlockStatement":
      for (const s of node.body) execStmtSync(s, scope, ctx);
      return;
    case "VariableDeclaration":
      for (const d of node.declarations) {
        bindPattern(d.id, d.init ? evalSync(d.init, scope, ctx) : undefined, scope, ctx);
      }
      return;
    case "ExpressionStatement":
      evalSync(node.expression, scope, ctx);
      return;
    case "IfStatement":
      if (evalSync(node.test, scope, ctx)) execStmtSync(node.consequent, scope, ctx);
      else if (node.alternate) execStmtSync(node.alternate, scope, ctx);
      return;
    case "ReturnStatement":
      throw new ReturnSignal(node.argument ? evalSync(node.argument, scope, ctx) : undefined);
    case "ForStatement": {
      if (node.init) {
        if (node.init.type === "VariableDeclaration") execStmtSync(node.init, scope, ctx);
        else evalSync(node.init, scope, ctx);
      }
      while (node.test ? evalSync(node.test, scope, ctx) : true) {
        try {
          execStmtSync(node.body, scope, ctx);
        } catch (sig) {
          if (sig instanceof BreakSignal) break;
          if (!(sig instanceof ContinueSignal)) throw sig;
        }
        if (node.update) evalSync(node.update, scope, ctx);
      }
      return;
    }
    case "WhileStatement":
      while (evalSync(node.test, scope, ctx)) {
        try {
          execStmtSync(node.body, scope, ctx);
        } catch (sig) {
          if (sig instanceof BreakSignal) break;
          if (!(sig instanceof ContinueSignal)) throw sig;
        }
      }
      return;
    case "BreakStatement":
      throw new BreakSignal();
    case "ContinueStatement":
      throw new ContinueSignal();
    case "FunctionDeclaration":
      return;
    default:
      throw new InterpreterError(`Unsupported statement in callback: ${node.type}`);
  }
}

function makeSyncClosure(node: any, defScope: Scope, ctx: Ctx): (...args: unknown[]) => unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (...args: unknown[]) => {
    const local = new Scope(defScope);
    bindArgsToParams(node.params, args, local, ctx);
    if (node.type === "ArrowFunctionExpression" && node.expression) {
      return evalSync(node.body, local, ctx);
    }
    try {
      execStmtSync(node.body, local, ctx);
    } catch (sig) {
      if (sig instanceof ReturnSignal) return sig.value;
      throw sig;
    }
    return undefined;
  };
}

function evalNew(node: any, evalOne: (n: any) => unknown): unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  const name = node.callee.name;
  const args = evalArgs(node.arguments, evalOne);
  if (name === "Map") return new Map(args[0] as Iterable<[unknown, unknown]> | undefined);
  if (name === "Set") return new Set(args[0] as Iterable<unknown> | undefined);
  if (name === "Array") {
    if (args.length === 1 && typeof args[0] === "number") return new Array(args[0]).fill(undefined);
    return args;
  }
  throw new InterpreterError(`Unsupported constructor: new ${name}(...)`);
}

// ---------- stepped (generator) evaluator — used for the traced entry function ----------

function* evalExprGen(node: any, scope: Scope, ctx: Ctx, frame: Frame): Generator<unknown, unknown, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (node.type) {
    case "Literal":
      return node.value;
    case "Identifier":
      return scope.get(node.name);
    case "ThisExpression":
      return undefined;
    case "ArrayExpression": {
      const items: unknown[] = [];
      for (const el of node.elements) {
        if (el === null) continue;
        if (el.type === "SpreadElement") {
          items.push(...((yield* evalExprGen(el.argument, scope, ctx, frame)) as unknown[]));
        } else {
          items.push(yield* evalExprGen(el, scope, ctx, frame));
        }
      }
      return items;
    }
    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const p of node.properties) {
        const key = p.computed ? ((yield* evalExprGen(p.key, scope, ctx, frame)) as string) : p.key.name ?? p.key.value;
        obj[key] = yield* evalExprGen(p.value, scope, ctx, frame);
      }
      return obj;
    }
    case "TemplateLiteral": {
      let out = "";
      for (let i = 0; i < node.quasis.length; i++) {
        out += node.quasis[i].value.cooked;
        if (i < node.expressions.length) out += String(yield* evalExprGen(node.expressions[i], scope, ctx, frame));
      }
      return out;
    }
    case "BinaryExpression": {
      const l = yield* evalExprGen(node.left, scope, ctx, frame);
      const r = yield* evalExprGen(node.right, scope, ctx, frame);
      return applyBinary(node.operator, l, r);
    }
    case "LogicalExpression": {
      const l = yield* evalExprGen(node.left, scope, ctx, frame);
      if (node.operator === "&&" && !l) return l;
      if (node.operator === "||" && l) return l;
      if (node.operator === "??" && l !== null && l !== undefined) return l;
      return yield* evalExprGen(node.right, scope, ctx, frame);
    }
    case "UnaryExpression": {
      if (node.operator === "typeof" && node.argument.type === "Identifier" && !scope.has(node.argument.name)) {
        return "undefined";
      }
      const v = yield* evalExprGen(node.argument, scope, ctx, frame);
      return applyUnary(node.operator, v);
    }
    case "UpdateExpression": {
      const old = (yield* evalExprGen(node.argument, scope, ctx, frame)) as number;
      const next = node.operator === "++" ? old + 1 : old - 1;
      yield* assignToGen(node.argument, next, scope, ctx, frame);
      return node.prefix ? next : old;
    }
    case "AssignmentExpression": {
      let value = yield* evalExprGen(node.right, scope, ctx, frame);
      if (node.operator !== "=") {
        const current = yield* evalExprGen(node.left, scope, ctx, frame);
        value = applyBinary(node.operator.slice(0, -1), current, value);
      }
      yield* assignToGen(node.left, value, scope, ctx, frame);
      return value;
    }
    case "ConditionalExpression": {
      const test = yield* evalExprGen(node.test, scope, ctx, frame);
      return test
        ? yield* evalExprGen(node.consequent, scope, ctx, frame)
        : yield* evalExprGen(node.alternate, scope, ctx, frame);
    }
    case "MemberExpression": {
      const obj = yield* evalExprGen(node.object, scope, ctx, frame);
      const prop = node.computed
        ? ((yield* evalExprGen(node.property, scope, ctx, frame)) as PropertyKey)
        : node.property.name;
      return getMember(obj, prop);
    }
    case "CallExpression": {
      // Recursive/self calls into another top-level function defined in the
      // pasted snippet get stepped through with their own stack frame.
      if (node.callee.type === "Identifier" && ctx.functions.has(node.callee.name) && !scope.has(node.callee.name)) {
        const args: unknown[] = [];
        for (const a of node.arguments) {
          if (a.type === "SpreadElement") {
            args.push(...((yield* evalExprGen(a.argument, scope, ctx, frame)) as unknown[]));
          } else {
            args.push(yield* evalExprGen(a, scope, ctx, frame));
          }
        }
        return yield* callUserFunction(ctx.functions.get(node.callee.name)!, args, ctx);
      }
      // Everything else (built-ins, array/string/Map/Set methods, callbacks)
      // runs as a black box — not stepped into.
      let thisVal: unknown;
      let fn: unknown;
      if (node.callee.type === "MemberExpression") {
        thisVal = yield* evalExprGen(node.callee.object, scope, ctx, frame);
        const prop = node.callee.computed
          ? ((yield* evalExprGen(node.callee.property, scope, ctx, frame)) as PropertyKey)
          : node.callee.property.name;
        fn = getMember(thisVal, prop);
      } else {
        fn = yield* evalExprGen(node.callee, scope, ctx, frame);
      }
      const args: unknown[] = [];
      for (const a of node.arguments) {
        if (a.type === "SpreadElement") {
          args.push(...((yield* evalExprGen(a.argument, scope, ctx, frame)) as unknown[]));
        } else {
          args.push(yield* evalExprGen(a, scope, ctx, frame));
        }
      }
      if (typeof fn !== "function") throw new InterpreterError("Attempted to call a non-function value");
      return (fn as (...a: unknown[]) => unknown).apply(thisVal, args);
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return makeSyncClosure(node, scope, ctx);
    case "NewExpression":
      return evalNew(node, (n) => evalSync(n, scope, ctx));
    case "SequenceExpression": {
      let last: unknown;
      for (const e of node.expressions) last = yield* evalExprGen(e, scope, ctx, frame);
      return last;
    }
    default:
      throw new InterpreterError(`Unsupported expression: ${node.type}`);
  }
}

function* assignToGen(target: any, value: unknown, scope: Scope, ctx: Ctx, frame: Frame) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (target.type === "Identifier") {
    scope.set(target.name, value);
    return;
  }
  if (target.type === "MemberExpression") {
    const obj = yield* evalExprGen(target.object, scope, ctx, frame);
    const prop = target.computed
      ? ((yield* evalExprGen(target.property, scope, ctx, frame)) as PropertyKey)
      : target.property.name;
    setMember(obj, prop, value);
    return;
  }
  throw new InterpreterError("Unsupported assignment target");
}

function* execAsBlock(node: any, scope: Scope, ctx: Ctx, frame: Frame) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (node.type === "BlockStatement") {
    yield* execBlockGen(node, scope, ctx, frame);
  } else {
    yield* execStmtGen(node, scope, ctx, frame);
  }
}

function* execBlockGen(block: any, scope: Scope, ctx: Ctx, frame: Frame) { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const stmt of block.body) {
    yield* execStmtGen(stmt, scope, ctx, frame);
  }
}

function* execStmtGen(node: any, scope: Scope, ctx: Ctx, frame: Frame): Generator<unknown, void, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  frame.line = node.loc?.start.line ?? frame.line;

  switch (node.type) {
    case "VariableDeclaration": {
      yield* stepYield(ctx, frame.line);
      for (const d of node.declarations) {
        const val = d.init ? yield* evalExprGen(d.init, scope, ctx, frame) : undefined;
        bindPattern(d.id, val, scope, ctx);
      }
      return;
    }
    case "ExpressionStatement": {
      yield* stepYield(ctx, frame.line);
      yield* evalExprGen(node.expression, scope, ctx, frame);
      return;
    }
    case "IfStatement": {
      yield* stepYield(ctx, frame.line);
      const test = yield* evalExprGen(node.test, scope, ctx, frame);
      if (test) {
        yield* execAsBlock(node.consequent, scope, ctx, frame);
      } else if (node.alternate) {
        yield* execAsBlock(node.alternate, scope, ctx, frame);
      }
      return;
    }
    case "ReturnStatement": {
      yield* stepYield(ctx, frame.line);
      const val = node.argument ? yield* evalExprGen(node.argument, scope, ctx, frame) : undefined;
      throw new ReturnSignal(val);
    }
    case "BreakStatement":
      yield* stepYield(ctx, frame.line);
      throw new BreakSignal();
    case "ContinueStatement":
      yield* stepYield(ctx, frame.line);
      throw new ContinueSignal();
    case "ForStatement": {
      if (node.init) {
        yield* stepYield(ctx, frame.line);
        if (node.init.type === "VariableDeclaration") {
          for (const d of node.init.declarations) {
            bindPattern(d.id, d.init ? yield* evalExprGen(d.init, scope, ctx, frame) : undefined, scope, ctx);
          }
        } else {
          yield* evalExprGen(node.init, scope, ctx, frame);
        }
      }
      while (true) {
        frame.line = node.loc?.start.line ?? frame.line;
        yield* stepYield(ctx, frame.line);
        const test = node.test ? yield* evalExprGen(node.test, scope, ctx, frame) : true;
        if (!test) break;
        try {
          yield* execAsBlock(node.body, scope, ctx, frame);
        } catch (sig) {
          if (sig instanceof BreakSignal) break;
          if (!(sig instanceof ContinueSignal)) throw sig;
        }
        if (node.update) yield* evalExprGen(node.update, scope, ctx, frame);
      }
      return;
    }
    case "WhileStatement": {
      while (true) {
        frame.line = node.loc?.start.line ?? frame.line;
        yield* stepYield(ctx, frame.line);
        const test = yield* evalExprGen(node.test, scope, ctx, frame);
        if (!test) break;
        try {
          yield* execAsBlock(node.body, scope, ctx, frame);
        } catch (sig) {
          if (sig instanceof BreakSignal) break;
          if (!(sig instanceof ContinueSignal)) throw sig;
        }
      }
      return;
    }
    case "ForOfStatement": {
      yield* stepYield(ctx, frame.line);
      const iterable = (yield* evalExprGen(node.right, scope, ctx, frame)) as Iterable<unknown>;
      const declPattern = node.left.type === "VariableDeclaration" ? node.left.declarations[0].id : node.left;
      for (const item of iterable) {
        frame.line = node.loc?.start.line ?? frame.line;
        bindPattern(declPattern, item, scope, ctx);
        try {
          yield* execAsBlock(node.body, scope, ctx, frame);
        } catch (sig) {
          if (sig instanceof BreakSignal) break;
          if (!(sig instanceof ContinueSignal)) throw sig;
        }
      }
      return;
    }
    case "BlockStatement":
      yield* execBlockGen(node, scope, ctx, frame);
      return;
    case "FunctionDeclaration":
      // Hoisted nested helper (e.g. an inner `dfs`) — capture its closure
      // scope by reference; the definition itself was already extracted.
      if (node.id) ctx.closureScopes.set(node.id.name, scope);
      return;
    default:
      throw new InterpreterError(`Unsupported statement: ${node.type}`);
  }
}

function* callUserFunction(fn: TracedFunction, args: unknown[], ctx: Ctx): Generator<unknown, unknown, unknown> {
  if (ctx.callStack.length > 500) {
    throw new InterpreterError("Call stack too deep — possible infinite recursion.");
  }
  const parentScope = ctx.closureScopes.get(fn.name) ?? null;
  const scope = new Scope(parentScope);
  bindArgsToParams(fn.params, args, scope, ctx);
  const frame: Frame = {
    id: ctx.nextFrameId++,
    functionName: fn.name,
    scope,
    line: fn.startLine,
    returning: false,
  };
  ctx.callStack.push(frame);
  yield* stepYield(ctx, frame.line);

  let returnValue: unknown;
  try {
    if (fn.isExpressionBody) {
      returnValue = yield* evalExprGen(fn.body, scope, ctx, frame);
    } else {
      yield* execBlockGen(fn.body, scope, ctx, frame);
    }
  } catch (sig) {
    if (sig instanceof ReturnSignal) returnValue = sig.value;
    else throw sig;
  }

  frame.returning = true;
  frame.line = fn.endLine ?? frame.line;
  yield* stepYield(ctx, frame.line);
  ctx.callStack.pop();
  const callerLine = ctx.callStack.length ? ctx.callStack[ctx.callStack.length - 1].line : null;
  yield* stepYield(ctx, callerLine);
  return returnValue;
}

// ---------- parsing / entry points ----------

function toTracedFunction(name: string, node: any): TracedFunction { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    name,
    params: node.params,
    body: node.body,
    isExpressionBody: node.type === "ArrowFunctionExpression" && node.expression === true,
    startLine: node.loc?.start.line ?? null,
    endLine: node.loc?.end.line ?? null,
  };
}

// Walks the whole AST (not just top-level) so nested helper functions, e.g.
// an inner `function dfs() {}` inside a solution function, are discovered too.
function walkAst(node: any, visit: (n: any) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkAst(n, visit));
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range" || key === "start" || key === "end") continue;
    const val = node[key];
    if (val && typeof val === "object") walkAst(val, visit);
  }
}

function extractFunctions(program: any): Map<string, TracedFunction> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const map = new Map<string, TracedFunction>();
  walkAst(program, (node) => {
    if (node.type === "FunctionDeclaration" && node.id) {
      map.set(node.id.name, toTracedFunction(node.id.name, node));
    } else if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      node.init &&
      (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")
    ) {
      map.set(node.id.name, toTracedFunction(node.id.name, node.init));
    }
  });
  return map;
}

// Top-level function names are listed first — they're almost always the
// intended entry point ("solution function"); nested helpers (dfs, etc.)
// can't be traced directly since their closure scope only exists once the
// outer function is actually running.
export function listFunctionNames(code: string): { names: string[]; error?: string } {
  try {
    const jsSource = stripTypes(code);
    const ast: any = acorn.parse(jsSource, { ecmaVersion: 2020, locations: true, sourceType: "script" }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const functions = extractFunctions(ast);
    const topLevel = new Set<string>();
    for (const stmt of ast.body) {
      if (stmt.type === "FunctionDeclaration" && stmt.id) topLevel.add(stmt.id.name);
      if (stmt.type === "VariableDeclaration") {
        for (const d of stmt.declarations) {
          if (d.id?.type === "Identifier" && d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) {
            topLevel.add(d.id.name);
          }
        }
      }
    }
    const names = Array.from(functions.keys()).sort((a, b) => {
      const at = topLevel.has(a) ? 0 : 1;
      const bt = topLevel.has(b) ? 0 : 1;
      return at - bt;
    });
    return { names };
  } catch (e) {
    return { names: [], error: e instanceof Error ? e.message : String(e) };
  }
}

const MAX_STEPS = 20000;

export function runTrace(code: string, entryName: string, args: unknown[]): TraceResult {
  const jsSource = stripTypes(code);
  let ast;
  try {
    ast = acorn.parse(jsSource, { ecmaVersion: 2020, locations: true, sourceType: "script" });
  } catch (e) {
    return { snapshots: [], jsSource, error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const functions = extractFunctions(ast as any);
  const entry = functions.get(entryName);
  if (!entry) {
    return { snapshots: [], jsSource, error: `Function "${entryName}" not found in pasted code.` };
  }

  const ctx: Ctx = {
    functions,
    callStack: [],
    snapshots: [],
    stepsRemaining: MAX_STEPS,
    nextFrameId: 0,
    closureScopes: new Map(),
  };

  try {
    const gen = callUserFunction(entry, args, ctx);
    let res = gen.next();
    while (!res.done) res = gen.next();
    ctx.snapshots.push(buildSnapshot(ctx, null, "done", res.value));
    return { snapshots: ctx.snapshots, jsSource };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.snapshots.push(buildSnapshot(ctx, null, "error", undefined, msg));
    return { snapshots: ctx.snapshots, jsSource, error: msg };
  }
}
