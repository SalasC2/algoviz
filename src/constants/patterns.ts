export const CORE_PATTERNS = [
  "Hash Map",
  "Two Pointers",
  "Sliding Window",
  "Binary Search",
  "Stack",
  "Queue",
  "Linked List",
  "Tree",
  "Graph DFS",
  "Graph BFS",
  "Heap"
]

export const ADVANCED_PATTERNS = [
  "Dynamic Programming",
  "Backtracking",
  "Greedy",
  "Union-Find",
  "Topological Sort"

]

export const SOLVE_STATUSES = [
  "Solved Cold", 
  "Solved with Guidance", 
  "Not Solved"
];

export const getSolveStatusShort = (status?: string) => {
    if (status === "Solved Cold") return "Cold";
    if (status === "Solved with Guidance") return "Guided";
    if (status === "Not Solved") return "Unsolved";
    return "";
}