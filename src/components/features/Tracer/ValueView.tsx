import type { SnapValue } from "./interpreter/types";

function primitiveLabel(value: string | number | boolean | null | undefined): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

export const ValueView = ({ value, depth = 0 }: { value: SnapValue; depth?: number }) => {
  if (value.kind === "primitive") {
    return <span className={`val-primitive val-type-${typeof value.value}`}>{primitiveLabel(value.value)}</span>;
  }

  if (value.kind === "function") {
    return <span className="val-primitive val-type-function">ƒ {value.name}</span>;
  }

  if (value.kind === "array") {
    if (value.items.length === 0) return <span className="val-empty">[ ]</span>;
    return (
      <div className="val-array">
        {value.items.map((item, i) => (
          <div className="val-array-cell" key={i}>
            <div className="val-array-index">{i}</div>
            <div className="val-array-value">
              <ValueView value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (value.kind === "set") {
    if (value.items.length === 0) return <span className="val-empty">Set(0)</span>;
    return (
      <div className="val-array">
        {value.items.map((item, i) => (
          <div className="val-array-cell" key={i}>
            <div className="val-array-value">
              <ValueView value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const entries = value.kind === "object" ? value.entries : value.entries;
  if (entries.length === 0) return <span className="val-empty">{value.kind === "map" ? "Map(0)" : "{ }"}</span>;

  return (
    <div className="val-kv">
      {value.kind === "object"
        ? (value.entries as [string, SnapValue][]).map(([k, v]) => (
            <div className="val-kv-row" key={k}>
              <span className="val-kv-key">{k}</span>
              <ValueView value={v} depth={depth + 1} />
            </div>
          ))
        : (value.entries as [SnapValue, SnapValue][]).map(([k, v], i) => (
            <div className="val-kv-row" key={i}>
              <span className="val-kv-key">
                <ValueView value={k} depth={depth + 1} />
              </span>
              <ValueView value={v} depth={depth + 1} />
            </div>
          ))}
    </div>
  );
};
