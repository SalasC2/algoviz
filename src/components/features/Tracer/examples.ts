export type TracerExample = {
  label: string;
  code: string;
  entry: string;
  args: string; // JSON array, editable in the UI
};

export const TRACER_EXAMPLES: TracerExample[] = [
  {
    label: "Recursive Fibonacci",
    entry: "fib",
    args: "[5]",
    code: `function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}`,
  },
  {
    label: "Two Sum (hashmap)",
    entry: "twoSum",
    args: "[[2,7,11,15], 9]",
    code: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) {
      return [seen.get(complement), i];
    }
    seen.set(nums[i], i);
  }
  return [];
}`,
  },
  {
    label: "Grid DFS (island count)",
    entry: "countIslands",
    args: "[[[1,1,0],[0,1,0],[0,0,1]]]",
    code: `function countIslands(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set();
  let count = 0;

  function dfs(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const key = r + "," + c;
    if (visited.has(key)) return;
    if (grid[r][c] === 0) return;
    visited.add(key);
    dfs(r + 1, c);
    dfs(r - 1, c);
    dfs(r, c + 1);
    dfs(r, c - 1);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1 && !visited.has(r + "," + c)) {
        count++;
        dfs(r, c);
      }
    }
  }

  return count;
}`,
  },
];
