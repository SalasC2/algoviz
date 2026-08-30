import { useEffect, useMemo, useState } from "react";
import "./Tracer.css";

import { Button } from "../../ui/Button";
import { ValueView } from "./ValueView";
import { runTrace, listFunctionNames, getFunctionParamNames, snapValueToPlain, deepEqual } from "./interpreter/interpreter";
import type { ConsoleLine, Snapshot } from "./interpreter/types";
import { TRACER_EXAMPLES } from "./examples";
import { ComponentRenderer } from "./ComponentRenderer";

const PLAY_INTERVAL_MS = 500;

type CheckResult =
  | { kind: "pass" }
  | { kind: "fail"; expected: unknown; actual: unknown }
  | { kind: "invalid-json" }
  | { kind: "no-return-value" };

type TracerProps = {
  // Code handed off from a Journal problem's "Trace this" action. Consumed
  // once (on mount) so it doesn't keep overwriting the user's own edits if
  // they navigate back to this tab later without a fresh handoff.
  initialCode?: string | null;
  onConsumeInitialCode?: () => void;
};

export const Tracer = ({ initialCode, onConsumeInitialCode }: TracerProps = {}) => {
  const [mode, setMode] = useState<"function" | "component">("function");

  return (
    <div>
      <div className="tracer-mode-toggle">
        <button
          className={`tracer-mode-btn ${mode === "function" ? "tracer-mode-btn-active" : ""}`}
          onClick={() => setMode("function")}
        >
          Function
        </button>
        <button
          className={`tracer-mode-btn ${mode === "component" ? "tracer-mode-btn-active" : ""}`}
          onClick={() => setMode("component")}
        >
          Component
        </button>
      </div>
      {mode === "function" ? (
        <FunctionTracer initialCode={initialCode} onConsumeInitialCode={onConsumeInitialCode} />
      ) : (
        <ComponentRenderer />
      )}
    </div>
  );
};

const FunctionTracer = ({ initialCode, onConsumeInitialCode }: TracerProps = {}) => {
  const [code, setCode] = useState(initialCode || TRACER_EXAMPLES[0].code);
  const [entryName, setEntryName] = useState(TRACER_EXAMPLES[0].entry);
  const [argsText, setArgsText] = useState(TRACER_EXAMPLES[0].args);
  const [expectedText, setExpectedText] = useState(TRACER_EXAMPLES[0].expected ?? "");
  const [availableFns, setAvailableFns] = useState<string[]>([TRACER_EXAMPLES[0].entry]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (!initialCode) return;
    setCode(initialCode);
    setArgsText("[]");
    setExpectedText("");
    setCheckResult(null);
    setSnapshots([]);
    setTracedSource(null);
    setConsoleLines([]);
    setStepIndex(0);
    setRunError(null);
    setIsPlaying(false);
    const { names } = listFunctionNames(initialCode);
    if (names.length > 0) {
      setAvailableFns(names);
      setEntryName(names[0]);
    }
    onConsumeInitialCode?.();
    // Only ever runs off a fresh handoff, not on every keystroke in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // The plain-JS source actually executed (TS types stripped) — line numbers
  // in every snapshot refer to this, not the raw `code` state, so this is
  // what the Source panel must display once a run has happened.
  const [tracedSource, setTracedSource] = useState<string | null>(null);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);

  useEffect(() => {
    const { names } = listFunctionNames(code);
    if (names.length > 0) {
      setAvailableFns(names);
      if (!names.includes(entryName)) setEntryName(names[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= snapshots.length - 1) {
      setIsPlaying(false);
      return;
    }
    const id = setTimeout(() => setStepIndex((i) => Math.min(i + 1, snapshots.length - 1)), PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [isPlaying, stepIndex, snapshots.length]);

  const handleLoadExample = (index: number) => {
    const ex = TRACER_EXAMPLES[index];
    setCode(ex.code);
    setEntryName(ex.entry);
    setArgsText(ex.args);
    setExpectedText(ex.expected ?? "");
    setCheckResult(null);
    setSnapshots([]);
    setTracedSource(null);
    setConsoleLines([]);
    setStepIndex(0);
    setRunError(null);
    setIsPlaying(false);
  };

  const handleRun = () => {
    setIsPlaying(false);
    setCheckResult(null);
    let args: unknown[];
    try {
      const parsed = JSON.parse(argsText || "[]");
      args = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      setSnapshots([]);
      setRunError('Arguments must be valid JSON, e.g. [5] or [[1,2,3], "abc"]');
      return;
    }

    const result = runTrace(code, entryName, args);
    setSnapshots(result.snapshots);
    setTracedSource(result.jsSource);
    setConsoleLines(result.consoleLines);
    setStepIndex(0);
    setRunError(result.error ?? null);

    if (expectedText.trim()) {
      const last = result.snapshots[result.snapshots.length - 1];
      if (last?.status !== "done" || last.returnValue === undefined) {
        setCheckResult({ kind: "no-return-value" });
      } else {
        try {
          const expected = JSON.parse(expectedText);
          const actual = snapValueToPlain(last.returnValue);
          setCheckResult(deepEqual(actual, expected) ? { kind: "pass" } : { kind: "fail", expected, actual });
        } catch {
          setCheckResult({ kind: "invalid-json" });
        }
      }
    }
  };

  const current = snapshots[stepIndex];
  const lines = useMemo(() => (tracedSource ?? code).split("\n"), [tracedSource, code]);
  const topFrame = current?.stack[current.stack.length - 1];
  const paramNames = useMemo(() => getFunctionParamNames(code, entryName), [code, entryName]);

  const canStepBack = stepIndex > 0;
  const canStepForward = stepIndex < snapshots.length - 1;

  return (
    <div className="tracer">
      <div className="tracer-intro">
        <h2>Execution Tracer</h2>
        <p>
          Paste a JS or TS function — loops, recursion, timers, Promises, async/await (no classes or try/catch) —
          and step through it line by line. <strong>Proof of concept</strong>, separate from your journal; nothing
          here is saved.
        </p>
      </div>

      <div className="tracer-examples">
        <span>Load example:</span>
        {TRACER_EXAMPLES.map((ex, i) => (
          <button key={ex.label} className="tracer-example-btn" onClick={() => handleLoadExample(i)}>
            {ex.label}
          </button>
        ))}
      </div>

      <div className="tracer-setup">
        <textarea
          className="tracer-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={12}
        />

        <div className="tracer-run-row">
          <label className="tracer-field">
            <span>Function to run</span>
            <select value={entryName} onChange={(e) => setEntryName(e.target.value)}>
              {availableFns.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="tracer-field tracer-field-args">
            <span>
              Arguments (JSON array)
              {paramNames.length > 0 && <span className="tracer-param-hint"> — expects: {paramNames.join(", ")}</span>}
            </span>
            <input value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder="[5]" />
          </label>

          <label className="tracer-field tracer-field-args">
            <span>Expected output (optional)</span>
            <input value={expectedText} onChange={(e) => setExpectedText(e.target.value)} placeholder="[0, 1]" />
          </label>

          <Button onClick={handleRun}>Run</Button>
        </div>

        {runError && <div className="tracer-error">{runError}</div>}

        {checkResult?.kind === "pass" && <div className="tracer-check tracer-check-pass">✓ Pass — matches expected output</div>}
        {checkResult?.kind === "fail" && (
          <div className="tracer-check tracer-check-fail">
            ✗ Fail — expected <code>{JSON.stringify(checkResult.expected)}</code>, got{" "}
            <code>{JSON.stringify(checkResult.actual)}</code>
          </div>
        )}
        {checkResult?.kind === "invalid-json" && (
          <div className="tracer-check tracer-check-fail">
            Expected output isn't valid JSON — e.g. <code>[0, 1]</code> or <code>"done"</code>.
          </div>
        )}
        {checkResult?.kind === "no-return-value" && (
          <div className="tracer-check tracer-check-fail">Can't check expected output — the run didn't finish with a return value.</div>
        )}
      </div>

      {snapshots.length > 0 && (
        <>
          <div className="tracer-controls">
            <Button variant="primary" onClick={() => setStepIndex(0)} disabled={!canStepBack}>
              ⏮ Reset
            </Button>
            <Button onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={!canStepBack}>
              ◀ Step back
            </Button>
            <Button onClick={() => setIsPlaying((p) => !p)} disabled={!canStepForward && !isPlaying}>
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </Button>
            <Button onClick={() => setStepIndex((i) => Math.min(snapshots.length - 1, i + 1))} disabled={!canStepForward}>
              Step forward ▶
            </Button>
            <input
              className="tracer-scrubber"
              type="range"
              min={0}
              max={snapshots.length - 1}
              value={stepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setStepIndex(Number(e.target.value));
              }}
            />
            <span className="tracer-step-count">
              Step {stepIndex + 1} / {snapshots.length}
            </span>
          </div>

          <div className="tracer-view">
            <div className="tracer-panel tracer-source-panel">
              <h3>
                Source
                {tracedSource !== null && tracedSource !== code && (
                  <span className="tracer-source-note"> — TS types stripped for execution</span>
                )}
              </h3>
              <pre className="tracer-source">
                {lines.map((line, i) => (
                  <div key={i} className={`tracer-source-line ${current?.line === i + 1 ? "tracer-line-active" : ""}`}>
                    <span className="tracer-line-no">{i + 1}</span>
                    <span>{line || " "}</span>
                  </div>
                ))}
              </pre>
            </div>

            <div className="tracer-panel tracer-state-panel">
              <h3>Variables {topFrame ? `— ${topFrame.functionName}()` : ""}</h3>
              {current?.status === "error" && <div className="tracer-error">{current.error}</div>}
              {current?.status === "done" && current.returnValue && (
                <div className="tracer-return">
                  <span className="val-kv-key">return value</span>
                  <ValueView value={current.returnValue} />
                </div>
              )}
              {topFrame && topFrame.vars.length === 0 && <span className="val-empty">no local variables yet</span>}
              {topFrame &&
                topFrame.vars.map(([name, value]) => (
                  <div className="val-kv-row tracer-var-row" key={name}>
                    <span className="val-kv-key">{name}</span>
                    <ValueView value={value} />
                  </div>
                ))}
            </div>

            <div className="tracer-panel tracer-stack-panel">
              <h3>Call stack ({current?.stack.length ?? 0})</h3>
              <div className="tracer-stack-list">
                {current?.stack
                  .slice()
                  .reverse()
                  .map((frame) => (
                    <div key={frame.id} className={`tracer-stack-frame ${frame === topFrame ? "tracer-stack-frame-active" : ""}`}>
                      <span className="tracer-stack-frame-name">{frame.functionName}()</span>
                      <span className="tracer-stack-frame-line">
                        {frame.returning ? "returning" : `line ${frame.line ?? "?"}`}
                      </span>
                    </div>
                  ))}
                {(!current || current.stack.length === 0) && <span className="val-empty">call stack empty</span>}
              </div>
            </div>
          </div>

          {consoleLines.length > 0 && (
            <div className="tracer-panel tracer-console-panel">
              <h3>Console</h3>
              <div className="tracer-console-lines">
                {consoleLines
                  .filter((line) => line.step <= stepIndex)
                  .map((line, i) => (
                    <div key={i} className={`tracer-console-line tracer-console-${line.level}`}>
                      {line.message}
                    </div>
                  ))}
                {consoleLines.filter((line) => line.step <= stepIndex).length === 0 && (
                  <span className="val-empty">nothing logged yet</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
