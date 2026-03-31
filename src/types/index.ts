// FormType and other shared types live here

export type FormType = {
    problem: string,
    pattern: string,
    solved: boolean,
    date: string,
    problemNumber?: number,
    difficulty?: "Easy" | "Medium" | "Hard",
    timeComplexity?: string,
    spaceComplexity?: string,
    trippedUp: string,
    explanation: string,
}