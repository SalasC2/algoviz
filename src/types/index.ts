// FormType and other shared types live here

export type FormType = {
    id?: string;
    problem: string,
    patterns: string[],
    solved: boolean,
    solveStatus?: "Solved Cold" | "Solved with Guidance" | "Not Solved"
    date: string,
    problemNumber?: string,
    difficulty?: "Easy" | "Medium" | "Hard",
    timeComplexity?: string,
    spaceComplexity?: string,
    trippedUp: string,
    explanation: string,
    code?: string,
}