# Execution Tracer — stress test notes (2026-08-30)

Ran the interpreter directly (not just the two original examples) via a throwaway
node/tsx harness, then spot-checked the trickiest ones in the browser.

## Confirmed working

- **Hashmap as core state** (the one requirement from the brief not yet confirmed):
  Two Sum — `Map` correctly shows as `key → value` rows in the Variables panel,
  updates step-by-step as `.set()` is called, `.has()`/`.get()` work. Added as a
  permanent third example (`examples.ts`) since it's a good demo case anyway.
  Also ran Group Anagrams (Map<string, array>, `.push` onto a value inside the
  map, `Array.from(map.values())`) — correct grouping, correct final output.
- **Purely iterative, no recursion**: sliding window (max subarray sum) and
  two-pointer (palindrome check) both traced correctly — confirms the stepper
  doesn't secretly depend on recursion-specific code paths.
- **Nested loops + early return**: matrix search returns the right cell and
  stops immediately (didn't keep scanning after the match).
- **Backtracking**: subsets(`[1,2,3]`) — nested closure (`backtrack` inside
  `subsets`) correctly mutates and un-mutates a shared `current` array across
  recursive calls; spot-checked the array's value at every step (not just the
  final result) and confirmed each snapshot is a true point-in-time copy, not a
  reference to the live (mutating) array. This was the biggest risk in the
  by-value-snapshot design and it holds up.

## Failure-mode testing (does it fail safely, not silently or by hanging?)

All four out-of-scope constructs fail with a clear, specific error surfaced in
the UI's red error banner — none hang, none silently produce a wrong answer:

| Input | Result |
|---|---|
| `async function` + `await` | `Unsupported expression: AwaitExpression` |
| `class` + `new` | `Unsupported constructor: new Solution(...)` |
| `try`/`catch` | `Unsupported statement: TryStatement` |
| `while (true) { i++ }` (infinite loop) | Hits the 20,000-step cap, reports "Step limit exceeded — this looks like an infinite loop." Returns in well under a second — does not hang the tab. |

This matches the brief's "fails safely" bar for v1.

## Still untested / known gaps (for whoever picks this up next)

- **Only the entry function's own top-level scope is shown per frame.** A
  nested helper (`dfs`) that closes over the outer function's variables (e.g.
  `grid`, `visited`) actually *has* access to them (closures work — confirmed
  in the original grid-DFS test), but the Variables panel only lists the
  frame's *own* locals, not inherited closure variables. So while stepping
  through `dfs()`, you won't see `visited`/`count` in that frame's panel even
  though the code is using them correctly. Not a correctness bug, just an
  incompleteness in the display — worth fixing before this goes past POC.
- **Callbacks (`.map`, `.filter`, `.sort`, etc.) are not stepped into** — by
  design (documented in the code as a black-box simplification), but not yet
  stress-tested with a problem that leans on this pattern heavily (e.g. a
  one-liner-heavy functional-style solution). Worth one pass if a user pastes
  something like that and gets confused why the callback body doesn't appear
  in the step timeline.
- **No test yet with object literals as primary state** (as opposed to
  Map/Set) — e.g. a frequency-counter pattern using `{}` instead of `Map`.
  Should work (plain objects are supported) but wasn't explicitly exercised.
- **UI polish not assessed**: haven't tried very long traces (hundreds of
  steps) for scrubber usability, or extremely wide arrays/objects for panel
  overflow/wrapping.
