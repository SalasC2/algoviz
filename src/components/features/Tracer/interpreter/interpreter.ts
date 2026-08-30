import * as acorn from "acorn";
import type { ConsoleLine, Snapshot, SnapValue, TraceResult, FrameSnapshot } from "./types";
import { stripTypes } from "./transpile";

// A deliberately small, sandboxed subset-of-JS interpreter for the Execution
// Tracer proof of concept. It is NOT a general JS engine — see CLAUDE.md /
// the tracer implementation brief for the exact scope boundaries (no classes,
// no try/catch, no import/require).
//
// Simplification: each function call gets exactly one Scope (no per-block
// scoping). This is intentionally loose vs. real JS block scoping — fine for
// displaying LeetCode-style solution functions, not a spec-compliant engine.
//
// Async model (Phase 2): setTimeout/setInterval and Promises are simulated,
// not real. There is no wall-clock timing — setTimeout just records a
// (callback, delay) pair on a virtual macrotask queue, keyed by delay for
// ordering only. Promise reactions go on a virtual microtask queue. After the
// main script "completes," we drain microtasks fully, then take the single
// earliest-queued macrotask, then drain microtasks again, repeating until
// both queues are empty — mirroring the real event-loop ordering rule
// (all microtasks before the next macrotask) without any real timing. The
// point is to make *execution order* watchable step-by-step, not to be a
// faithful timer implementation.

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
  // Per-trace-run globals (setTimeout, Promise, ...) that need access to the
  // current run's ctx. Set explicitly at each call's root scope; inherited
  // down through child/closure scopes so any scope can resolve them.
  ctx: Ctx | null;
  constructor(parent: Scope | null, ctx: Ctx | null = null) {
    this.parent = parent;
    this.ctx = ctx ?? parent?.ctx ?? null;
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
  if (scope.ctx && name in scope.ctx.runtimeGlobals) return true;
  return name in GLOBALS;
}

function scopeChainGet(scope: Scope, name: string): unknown {
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.vars.has(name)) return s.vars.get(name);
  }
  if (scope.ctx && name in scope.ctx.runtimeGlobals) return scope.ctx.runtimeGlobals[name];
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

// Shape shared by named traced functions and ad hoc function-literal
// callbacks (setTimeout/.then arguments) — anything callable through the
// stepped interpreter.
type CallableDescriptor = {
  name: string;
  params: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  isExpressionBody: boolean;
  startLine: number | null;
  endLine: number | null;
};

type TracedFunction = CallableDescriptor & {
  isAsync: boolean;
};

// A function-literal argument to setTimeout/setInterval/.then/.catch,
// captured as raw AST + closure scope (instead of being pre-evaluated to a
// black-box closure) so its body can be stepped through when it eventually
// fires. See evalSchedulingCall.
type SteppableCallback = {
  __steppableCallback: true;
  node: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  scope: Scope;
};

type Frame = {
  id: number;
  functionName: string;
  scope: Scope;
  line: number | null;
  returning: boolean;
};

type Macrotask = {
  id: number;
  time: number;
  seq: number;
  run: () => Generator<unknown, unknown, unknown>;
};

type Microtask = {
  seq: number;
  run: () => Generator<unknown, unknown, unknown>;
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
  // Simulated event loop (Phase 2) — see the file-level comment above.
  macrotasks: Macrotask[];
  microtasks: Microtask[];
  nextTaskSeq: number;
  virtualTime: number;
  nextTimerId: number;
  clearedTimers: Set<number>;
  runtimeGlobals: Record<string, unknown>;
  consoleLines: ConsoleLine[];
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
  if (value instanceof Error) {
    // Error's `message`/`stack` are non-enumerable, so the generic object
    // branch below would otherwise render it as an empty object.
    return {
      kind: "object",
      entries: [
        ["name", snapshotValue(value.name, seen)],
        ["message", snapshotValue(value.message, seen)],
      ],
    };
  }
  if (value instanceof VirtualPromise) {
    // Never fall through to the generic object branch below — a
    // VirtualPromise holds a reference to the whole run's ctx (functions
    // map, call stack, etc.), which would otherwise get walked here.
    return {
      kind: "object",
      entries: [
        ["[[PromiseState]]", snapshotValue(value.state, seen)],
        ["[[PromiseValue]]", value.state === "pending" ? snapshotValue(undefined, seen) : snapshotValue(value.value, seen)],
      ],
    };
  }
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

// ---------- simulated Promises (Phase 2) ----------
// A from-scratch minimal Promise/A+-ish implementation over the virtual
// microtask queue, NOT the real Promise — real Promises resolve on real
// microtasks with real timing, which would break the "run everything ahead
// of time into a snapshot array" model this whole interpreter relies on.

type Reaction = () => Generator<unknown, void, unknown>;

class VirtualPromise {
  ctx: Ctx;
  state: "pending" | "fulfilled" | "rejected" = "pending";
  value: unknown;
  private reactions: Reaction[] = [];

  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }

  static resolvedWith(ctx: Ctx, value: unknown): VirtualPromise {
    const p = new VirtualPromise(ctx);
    p._settle("fulfilled", value);
    return p;
  }

  static rejectedWith(ctx: Ctx, err: unknown): VirtualPromise {
    const p = new VirtualPromise(ctx);
    p._settle("rejected", err);
    return p;
  }

  _settle(state: "fulfilled" | "rejected", value: unknown) {
    if (this.state !== "pending") return;
    if (state === "fulfilled" && value instanceof VirtualPromise) {
      // Adopt the inner promise's eventual outcome (thenable chaining).
      value._addReaction(
        (v) => this._settle("fulfilled", v),
        (e) => this._settle("rejected", e)
      );
      return;
    }
    this.state = state;
    this.value = value;
    const pending = this.reactions;
    this.reactions = [];
    for (const reaction of pending) {
      this.ctx.microtasks.push({ seq: this.ctx.nextTaskSeq++, run: reaction });
    }
  }

  _pushPendingReaction(reaction: Reaction) {
    this.reactions.push(reaction);
  }

  // Internal plumbing (await resumption, Promise.all bookkeeping) — plain
  // callbacks, not user code, so they never need stepping themselves.
  _addReaction(onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) {
    addInternalReaction(this, onFulfilled, onRejected);
  }

  then(onFulfilled?: unknown, onRejected?: unknown): VirtualPromise {
    return addThenReaction(this, onFulfilled, onRejected);
  }

  catch(onRejected?: unknown): VirtualPromise {
    return this.then(undefined, onRejected);
  }
}

function addInternalReaction(promise: VirtualPromise, onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) {
  const reaction: Reaction = function* () {
    if (promise.state === "fulfilled") onFulfilled(promise.value);
    else onRejected(promise.value);
    // eslint-disable-next-line no-constant-condition
    if (false) yield; // keep this a generator (see Reaction/Microtask.run) without ever actually yielding
  };
  addReactionToPromise(promise, reaction);
}

function addThenReaction(promise: VirtualPromise, onFulfilled: unknown, onRejected: unknown): VirtualPromise {
  const next = new VirtualPromise(promise.ctx);
  const reaction: Reaction = function* () {
    try {
      if (promise.state === "fulfilled") {
        if (onFulfilled === undefined) {
          next._settle("fulfilled", promise.value);
          return;
        }
        const result = yield* invokeCallback(onFulfilled, [promise.value], promise.ctx);
        next._settle("fulfilled", result);
      } else {
        if (onRejected === undefined) {
          next._settle("rejected", promise.value);
          return;
        }
        const result = yield* invokeCallback(onRejected, [promise.value], promise.ctx);
        next._settle("fulfilled", result);
      }
    } catch (e) {
      next._settle("rejected", e);
    }
  };
  addReactionToPromise(promise, reaction);
  return next;
}

function addReactionToPromise(promise: VirtualPromise, reaction: Reaction) {
  if (promise.state === "pending") {
    promise._pushPendingReaction(reaction);
  } else {
    promise.ctx.microtasks.push({ seq: promise.ctx.nextTaskSeq++, run: reaction });
  }
}

function promiseAll(ctx: Ctx, iterable: unknown): VirtualPromise {
  const items = Array.from((iterable as Iterable<unknown>) ?? []);
  const result = new VirtualPromise(ctx);
  if (items.length === 0) {
    result._settle("fulfilled", []);
    return result;
  }
  const values = new Array(items.length);
  let remaining = items.length;
  items.forEach((item, i) => {
    const p = item instanceof VirtualPromise ? item : VirtualPromise.resolvedWith(ctx, item);
    p._addReaction(
      (v) => {
        values[i] = v;
        remaining--;
        if (remaining === 0) result._settle("fulfilled", values);
      },
      (e) => result._settle("rejected", e)
    );
  });
  return result;
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof VirtualPromise) return `Promise {${value.state}}`;
  if (typeof value === "function") return `ƒ ${(value as { name?: string }).name || "anonymous"}`;
  try {
    const json = JSON.stringify(value, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v instanceof Set ? Array.from(v.values()) : v));
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function makeConsole(ctx: Ctx, level: "log" | "warn" | "error") {
  return (...args: unknown[]) => {
    ctx.consoleLines.push({ step: ctx.snapshots.length, level, message: args.map(formatConsoleArg).join(" ") });
  };
}

function makeRuntimeGlobals(ctx: Ctx): Record<string, unknown> {
  const scheduleTimer = (isInterval: boolean) => (callbackValue: unknown, delayValue: unknown, ...extra: unknown[]) => {
    const id = ctx.nextTimerId++;
    const delay = typeof delayValue === "number" && Number.isFinite(delayValue) ? delayValue : 0;
    const enqueue = (fireTime: number) => {
      ctx.macrotasks.push({
        id,
        time: fireTime,
        seq: ctx.nextTaskSeq++,
        run: function* () {
          if (ctx.clearedTimers.has(id)) return;
          yield* invokeCallback(callbackValue, extra, ctx);
          if (isInterval && !ctx.clearedTimers.has(id)) enqueue(ctx.virtualTime + delay);
        },
      });
    };
    enqueue(ctx.virtualTime + delay);
    return id;
  };

  const clearTimer = (id: unknown) => {
    if (typeof id === "number") ctx.clearedTimers.add(id);
  };

  return {
    setTimeout: scheduleTimer(false),
    setInterval: scheduleTimer(true),
    clearTimeout: clearTimer,
    clearInterval: clearTimer,
    Promise: {
      resolve: (v: unknown) => (v instanceof VirtualPromise ? v : VirtualPromise.resolvedWith(ctx, v)),
      reject: (e: unknown) => VirtualPromise.rejectedWith(ctx, e),
      all: (iterable: unknown) => promiseAll(ctx, iterable),
    },
    console: {
      log: makeConsole(ctx, "log"),
      warn: makeConsole(ctx, "warn"),
      error: makeConsole(ctx, "error"),
    },
  };
}

// Runs macrotasks/microtasks to a fixed point: drain all microtasks, then
// fire the single earliest-queued macrotask (by virtual delay, then
// insertion order for ties), then drain microtasks again, repeating until
// both queues are empty. This is what actually produces the "watch the real
// execution order play out" behavior.
function driveEventLoopToCompletion(ctx: Ctx) {
  while (true) {
    while (ctx.microtasks.length > 0) {
      const task = ctx.microtasks.shift()!;
      driveGeneratorToCompletion(task.run());
    }
    if (ctx.macrotasks.length === 0) break;
    ctx.macrotasks.sort((a, b) => a.time - b.time || a.seq - b.seq);
    const next = ctx.macrotasks.shift()!;
    ctx.virtualTime = next.time;
    driveGeneratorToCompletion(next.run());
  }
}

function driveGeneratorToCompletion(gen: Generator<unknown, unknown, unknown>) {
  let res = gen.next();
  while (!res.done) res = gen.next();
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
      return evalNew(node, (n) => evalSync(n, scope, ctx), ctx);
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

function evalNew(node: any, evalOne: (n: any) => unknown, ctx: Ctx): unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  const name = node.callee.name;
  if (name === "Promise") {
    // Black-box path (reached from evalSync, e.g. `new Promise(...)` inside
    // a .map() callback) — the executor just runs synchronously, not
    // stepped. The main stepped path intercepts `new Promise` earlier, in
    // evalExprGen, so its executor CAN be stepped — see evalNewPromiseStepped.
    const promise = new VirtualPromise(ctx);
    const resolve = (v: unknown) => promise._settle("fulfilled", v);
    const reject = (e: unknown) => promise._settle("rejected", e);
    try {
      const executor = evalOne(node.arguments[0]) as (...a: unknown[]) => unknown;
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
    return promise;
  }
  const args = evalArgs(node.arguments, evalOne);
  if (name === "Map") return new Map(args[0] as Iterable<[unknown, unknown]> | undefined);
  if (name === "Set") return new Set(args[0] as Iterable<unknown> | undefined);
  if (name === "Array") {
    if (args.length === 1 && typeof args[0] === "number") return new Array(args[0]).fill(undefined);
    return args;
  }
  if (name === "Error" || name === "TypeError" || name === "RangeError") {
    const ErrorCtor = name === "TypeError" ? TypeError : name === "RangeError" ? RangeError : Error;
    return new ErrorCtor(typeof args[0] === "string" ? args[0] : undefined);
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
      // setTimeout/setInterval/.then/.catch get their function-literal
      // arguments captured as steppable descriptors instead of black-box
      // closures, so callbacks fired later can still be watched step by step.
      const schedulingKind = detectSchedulingCall(node);
      if (schedulingKind) {
        return yield* evalSchedulingCall(node, schedulingKind, scope, ctx, frame);
      }
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
        const fnDescriptor = ctx.functions.get(node.callee.name)!;
        const callResult = callUserFunction(fnDescriptor, args, ctx);
        if (fnDescriptor.isAsync) return callResult as VirtualPromise;
        return yield* (callResult as Generator<unknown, unknown, unknown>);
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
      if (node.callee.name === "Promise") {
        return yield* evalNewPromiseStepped(node, scope, ctx, frame);
      }
      return evalNew(node, (n) => evalSync(n, scope, ctx), ctx);
    case "SequenceExpression": {
      let last: unknown;
      for (const e of node.expressions) last = yield* evalExprGen(e, scope, ctx, frame);
      return last;
    }
    case "AwaitExpression": {
      const awaited = yield* evalExprGen(node.argument, scope, ctx, frame);
      // Suspends the enclosing async function (see stepAsyncGen) until the
      // awaited value settles; resumes with whatever value/error it's
      // called back with next.
      const resumeValue = yield { __await: awaited };
      return resumeValue;
    }
    default:
      throw new InterpreterError(`Unsupported expression: ${node.type}`);
  }
}

// `new Promise(executor)` reached through the stepped path — the executor
// runs stepped (with its own frame) if it's a literal function/arrow, same
// treatment as setTimeout/.then callbacks.
function* evalNewPromiseStepped(node: any, scope: Scope, ctx: Ctx, frame: Frame): Generator<unknown, unknown, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const promise = new VirtualPromise(ctx);
  const resolve = (v: unknown) => promise._settle("fulfilled", v);
  const reject = (e: unknown) => promise._settle("rejected", e);
  const executorNode = node.arguments[0];
  try {
    if (executorNode && (executorNode.type === "ArrowFunctionExpression" || executorNode.type === "FunctionExpression")) {
      const descriptor: CallableDescriptor = {
        name: "(promise executor)",
        params: executorNode.params,
        body: executorNode.body,
        isExpressionBody: executorNode.type === "ArrowFunctionExpression" && executorNode.expression === true,
        startLine: executorNode.loc?.start.line ?? null,
        endLine: executorNode.loc?.end.line ?? null,
      };
      const execFrame = setupCall(descriptor, scope, [resolve, reject], ctx);
      yield* fullCallGen(descriptor, execFrame, ctx);
    } else {
      const fn = (yield* evalExprGen(executorNode, scope, ctx, frame)) as (...a: unknown[]) => unknown;
      fn(resolve, reject);
    }
  } catch (e) {
    reject(e);
  }
  return promise;
}

// Detects setTimeout/setInterval/.then/.catch call sites so their literal
// function-argument(s) can be captured as steppable descriptors instead of
// pre-evaluated to black-box closures.
function detectSchedulingCall(node: any): "setTimeout" | "setInterval" | "then" | "catch" | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (node.callee.type === "Identifier" && (node.callee.name === "setTimeout" || node.callee.name === "setInterval")) {
    return node.callee.name;
  }
  if (node.callee.type === "MemberExpression" && !node.callee.computed) {
    const prop = node.callee.property.name;
    if (prop === "then" || prop === "catch") return prop;
  }
  return null;
}

function* evalSchedulingCall(
  node: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  kind: "setTimeout" | "setInterval" | "then" | "catch",
  scope: Scope,
  ctx: Ctx,
  frame: Frame
): Generator<unknown, unknown, unknown> {
  function* captureArg(argNode: any): Generator<unknown, unknown, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!argNode) return undefined;
    if (argNode.type === "ArrowFunctionExpression" || argNode.type === "FunctionExpression") {
      const cb: SteppableCallback = { __steppableCallback: true, node: argNode, scope };
      return cb;
    }
    return yield* evalExprGen(argNode, scope, ctx, frame);
  }

  if (kind === "setTimeout" || kind === "setInterval") {
    const callbackArg = yield* captureArg(node.arguments[0]);
    const delayArg = node.arguments[1] ? yield* evalExprGen(node.arguments[1], scope, ctx, frame) : 0;
    const extraArgs: unknown[] = [];
    for (let i = 2; i < node.arguments.length; i++) {
      extraArgs.push(yield* evalExprGen(node.arguments[i], scope, ctx, frame));
    }
    const scheduler = ctx.runtimeGlobals[kind] as (...a: unknown[]) => unknown;
    return scheduler(callbackArg, delayArg, ...extraArgs);
  }

  // kind === "then" | "catch"
  const receiver = yield* evalExprGen(node.callee.object, scope, ctx, frame);
  if (!(receiver instanceof VirtualPromise)) {
    // Not actually one of our promises (e.g. an unrelated object that
    // happens to have a `.then`-named method) — fall back to a plain call
    // so a clear error surfaces if it's not really callable.
    const fn = getMember(receiver, kind);
    const args: unknown[] = [];
    for (const a of node.arguments) args.push(yield* captureArg(a));
    if (typeof fn !== "function") throw new InterpreterError(`${kind} is not a function`);
    return (fn as (...a: unknown[]) => unknown).apply(receiver, args);
  }
  if (kind === "catch") {
    const onRejected = yield* captureArg(node.arguments[0]);
    return receiver.catch(onRejected);
  }
  const onFulfilled = yield* captureArg(node.arguments[0]);
  const onRejected = yield* captureArg(node.arguments[1]);
  return receiver.then(onFulfilled, onRejected);
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

// Sets up a call's scope/frame and pushes it onto the call stack. Shared by
// named traced functions and ad hoc callback descriptors alike.
function setupCall(descriptor: CallableDescriptor, parentScope: Scope | null, args: unknown[], ctx: Ctx): Frame {
  if (ctx.callStack.length > 500) {
    throw new InterpreterError("Call stack too deep — possible infinite recursion.");
  }
  const scope = new Scope(parentScope, ctx);
  bindArgsToParams(descriptor.params, args, scope, ctx);
  const frame: Frame = {
    id: ctx.nextFrameId++,
    functionName: descriptor.name,
    scope,
    line: descriptor.startLine,
    returning: false,
  };
  ctx.callStack.push(frame);
  return frame;
}

// The actual stepped execution of a call, from entry to pop. Used both by
// the ordinary (yield*-driven) sync path and, for async functions, driven
// manually step-by-step by stepAsyncGen so it can suspend at `await`.
function* fullCallGen(
  descriptor: CallableDescriptor,
  frame: Frame,
  ctx: Ctx
): Generator<unknown, unknown, unknown> {
  const scope = frame.scope;
  yield* stepYield(ctx, frame.line);

  let returnValue: unknown;
  try {
    if (descriptor.isExpressionBody) {
      returnValue = yield* evalExprGen(descriptor.body, scope, ctx, frame);
    } else {
      yield* execBlockGen(descriptor.body, scope, ctx, frame);
    }
  } catch (sig) {
    if (sig instanceof ReturnSignal) returnValue = sig.value;
    else throw sig;
  }

  frame.returning = true;
  frame.line = descriptor.endLine ?? frame.line;
  yield* stepYield(ctx, frame.line);
  ctx.callStack.pop();
  const callerLine = ctx.callStack.length ? ctx.callStack[ctx.callStack.length - 1].line : null;
  yield* stepYield(ctx, callerLine);
  return returnValue;
}

// Manually drives an async function/callback's body generator, suspending
// at each `await` (see the AwaitExpression case in evalExprGen, which yields
// a { __await } sentinel distinct from stepYield's plain yields) by
// registering the rest of the function as a promise reaction, instead of
// blocking the caller. This is what makes `callUserFunction`/`invokeCallback`
// return a (possibly still-pending) promise immediately for async functions,
// matching real async-function call semantics.
function stepAsyncGen(
  bodyGen: Generator<unknown, unknown, unknown>,
  ctx: Ctx,
  resultPromise: VirtualPromise,
  resume?: { type: "next"; value: unknown } | { type: "throw"; error: unknown }
) {
  let res: IteratorResult<unknown, unknown>;
  try {
    res = resume?.type === "throw" ? bodyGen.throw(resume.error) : bodyGen.next(resume?.value);
  } catch (e) {
    resultPromise._settle("rejected", e);
    return;
  }
  while (true) {
    if (res.done) {
      resultPromise._settle("fulfilled", res.value);
      return;
    }
    const y = res.value as { __await?: unknown } | undefined;
    if (y && typeof y === "object" && "__await" in y) {
      const awaitedRaw = y.__await;
      const awaitedPromise = awaitedRaw instanceof VirtualPromise ? awaitedRaw : VirtualPromise.resolvedWith(ctx, awaitedRaw);
      awaitedPromise._addReaction(
        (v) => stepAsyncGen(bodyGen, ctx, resultPromise, { type: "next", value: v }),
        (e) => stepAsyncGen(bodyGen, ctx, resultPromise, { type: "throw", error: e })
      );
      return;
    }
    try {
      res = bodyGen.next();
    } catch (e) {
      resultPromise._settle("rejected", e);
      return;
    }
  }
}

function callUserFunction(fn: TracedFunction, args: unknown[], ctx: Ctx): Generator<unknown, unknown, unknown> | VirtualPromise {
  const parentScope = ctx.closureScopes.get(fn.name) ?? null;
  const frame = setupCall(fn, parentScope, args, ctx);
  const bodyGen = fullCallGen(fn, frame, ctx);
  if (fn.isAsync) {
    const promise = new VirtualPromise(ctx);
    stepAsyncGen(bodyGen, ctx, promise);
    return promise;
  }
  return bodyGen;
}

function describeAnonymousFunction(node: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return node.id?.name ? node.id.name : "(anonymous)";
}

// Calls a callback that may be either a real JS function (native callbacks,
// or a reference to a previously-defined function — run as a black box) or a
// SteppableCallback descriptor (a function-literal argument to
// setTimeout/.then/etc. — run through the stepped interpreter instead, with
// its own stack frame).
function* invokeCallback(callbackValue: unknown, args: unknown[], ctx: Ctx): Generator<unknown, unknown, unknown> {
  if (callbackValue === undefined || callbackValue === null) return undefined;
  if (typeof callbackValue === "object" && (callbackValue as SteppableCallback).__steppableCallback) {
    const { node, scope: closureScope } = callbackValue as SteppableCallback;
    const descriptor: CallableDescriptor = {
      name: describeAnonymousFunction(node),
      params: node.params,
      body: node.body,
      isExpressionBody: node.type === "ArrowFunctionExpression" && node.expression === true,
      startLine: node.loc?.start.line ?? null,
      endLine: node.loc?.end.line ?? null,
    };
    const frame = setupCall(descriptor, closureScope, args, ctx);
    const bodyGen = fullCallGen(descriptor, frame, ctx);
    if (node.async) {
      const promise = new VirtualPromise(ctx);
      stepAsyncGen(bodyGen, ctx, promise);
      return promise;
    }
    return yield* bodyGen;
  }
  if (typeof callbackValue === "function") {
    return (callbackValue as (...a: unknown[]) => unknown)(...args);
  }
  throw new InterpreterError("Attempted to call a non-function value");
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
    isAsync: Boolean(node.async),
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
    return { snapshots: [], jsSource, consoleLines: [], error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const functions = extractFunctions(ast as any);
  const entry = functions.get(entryName);
  if (!entry) {
    return { snapshots: [], jsSource, consoleLines: [], error: `Function "${entryName}" not found in pasted code.` };
  }

  const ctx: Ctx = {
    functions,
    callStack: [],
    snapshots: [],
    stepsRemaining: MAX_STEPS,
    nextFrameId: 0,
    closureScopes: new Map(),
    macrotasks: [],
    microtasks: [],
    nextTaskSeq: 0,
    virtualTime: 0,
    nextTimerId: 1,
    clearedTimers: new Set(),
    runtimeGlobals: {},
    consoleLines: [],
  };
  ctx.runtimeGlobals = makeRuntimeGlobals(ctx);

  try {
    const callResult = callUserFunction(entry, args, ctx);
    let finalValue: unknown;
    if (entry.isAsync) {
      const promise = callResult as VirtualPromise;
      driveEventLoopToCompletion(ctx);
      if (promise.state === "rejected") {
        throw promise.value;
      }
      if (promise.state === "pending") {
        ctx.snapshots.push(
          buildSnapshot(
            ctx,
            null,
            "error",
            undefined,
            "The traced async function never resolved — it's still awaiting something that never settled."
          )
        );
        return { snapshots: ctx.snapshots, jsSource, consoleLines: ctx.consoleLines, error: "Async function never resolved." };
      }
      finalValue = promise.value;
    } else {
      const gen = callResult as Generator<unknown, unknown, unknown>;
      let res = gen.next();
      while (!res.done) res = gen.next();
      driveEventLoopToCompletion(ctx);
      finalValue = res.value;
    }
    ctx.snapshots.push(buildSnapshot(ctx, null, "done", finalValue));
    return { snapshots: ctx.snapshots, jsSource, consoleLines: ctx.consoleLines };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.snapshots.push(buildSnapshot(ctx, null, "error", undefined, msg));
    return { snapshots: ctx.snapshots, jsSource, consoleLines: ctx.consoleLines, error: msg };
  }
}
