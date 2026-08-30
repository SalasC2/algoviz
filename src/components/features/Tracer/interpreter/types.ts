// Snapshotted (JSON-friendly) representation of a runtime value at a given step.
// We snapshot by value (deep copy) so later mutations don't retroactively change
// earlier steps in the scrubbable timeline.
export type SnapValue =
  | { kind: "primitive"; value: string | number | boolean | null | undefined }
  | { kind: "array"; items: SnapValue[] }
  | { kind: "object"; entries: [string, SnapValue][] }
  | { kind: "map"; entries: [SnapValue, SnapValue][] }
  | { kind: "set"; items: SnapValue[] }
  | { kind: "function"; name: string };

export type FrameSnapshot = {
  id: number;
  functionName: string;
  vars: [string, SnapValue][];
  line: number | null;
  returning: boolean;
};

export type Snapshot = {
  step: number;
  line: number | null;
  stack: FrameSnapshot[];
  status: "running" | "done" | "error";
  returnValue?: SnapValue;
  error?: string;
};

export type TraceResult = {
  snapshots: Snapshot[];
  error?: string;
  // The plain-JS source actually parsed/executed (post TS-type-stripping).
  // Line numbers in every Snapshot refer to this string, not the original
  // pasted input — display this, not the raw input, when highlighting lines.
  jsSource: string;
};
