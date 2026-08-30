import { useRef, useState } from "react";
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";

import { Button } from "../../ui/Button";
import { transpileComponent } from "./interpreter/componentTranspile";

const DEFAULT_CODE = `function App() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}`;

const IFRAME_HTML =
  '<!doctype html><html><head><style>body{margin:0;padding:16px;font:14px/1.4 system-ui,sans-serif;color:#111;}</style></head><body><div id="root"></div></body></html>';

// Executes pasted component code directly (via `new Function`), unlike the
// AST-walking interpreter used for Function mode. That's a deliberate,
// larger trust surface — acceptable here because this is a single-user
// client-side tool: you're only ever pasting your own code, the same trust
// level as typing into any other textarea in this app. Real step-by-step
// tracing doesn't apply to React anyway (render/commit/effects don't map to
// line-by-line stepping) — this mode renders for real and shows the result.
function runComponent(js: string, container: HTMLElement, root: { current: ReactDOMClient.Root | null }) {
  const factory = new Function(
    "React",
    "useState",
    "useEffect",
    "useRef",
    "useMemo",
    "useCallback",
    "useReducer",
    "useContext",
    `${js}\nreturn typeof App !== "undefined" ? App : undefined;`
  );
  const App = factory(React, React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback, React.useReducer, React.useContext);
  if (typeof App !== "function") {
    throw new Error('Define a component named "App" — that\'s the entry point this mode looks for.');
  }
  root.current?.unmount();
  root.current = ReactDOMClient.createRoot(container);
  root.current.render(React.createElement(App));
}

export const ComponentRenderer = () => {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [error, setError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<{ current: ReactDOMClient.Root | null }>({ current: null });

  const pendingJsRef = useRef<string | null>(null);

  const handleRender = () => {
    setError(null);
    const result = transpileComponent(code);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Force a fresh iframe (and thus a fresh document/root) per render, so a
    // previous run's React root/state never leaks into the next one.
    setRenderKey((k) => k + 1);
    // The actual mount happens in onIframeLoad, once the fresh iframe's
    // document is ready — stash the compiled JS for it to use.
    pendingJsRef.current = result.js;
  };

  const handleIframeLoad = () => {
    const js = pendingJsRef.current;
    const iframeDoc = iframeRef.current?.contentDocument;
    const container = iframeDoc?.getElementById("root");
    if (!js || !container) return;
    try {
      runComponent(js, container, rootRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="tracer">
      <div className="tracer-intro">
        <h2>Component Renderer</h2>
        <p>
          Paste a React component (JSX/TSX, hooks fine) named <code>App</code> and it renders for real, fully
          interactive. <strong>Not a step tracer</strong> — React doesn't map to line-by-line stepping.
        </p>
      </div>

      <div className="tracer-setup">
        <textarea
          className="tracer-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={14}
        />
        <div className="tracer-run-row">
          <Button onClick={handleRender}>Render</Button>
        </div>
        {error && <div className="tracer-error">{error}</div>}
      </div>

      <div className="tracer-panel tracer-component-preview">
        <h3>Preview</h3>
        <iframe
          key={renderKey}
          ref={iframeRef}
          title="Component preview"
          className="tracer-component-frame"
          srcDoc={IFRAME_HTML}
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
};
