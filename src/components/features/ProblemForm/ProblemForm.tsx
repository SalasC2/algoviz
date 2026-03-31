import { useState } from 'react';

import { Button } from "../../ui/Button"

import type { FormType } from "../../../types";
import { CORE_PATTERNS } from "../../../constants/patterns";

import './ProblemForm.css';

type Props = {
    handleSave: (form: FormType) => void,
}
export const ProblemForm = ({ handleSave }: Props) => {

    let [form, setForm] = useState<FormType>({
        "problem": "",
        "pattern": "",
        "solved": false,
        "date": "",
        "problemNumber": undefined,
        "difficulty": undefined,
        "timeComplexity": undefined,
        "spaceComplexity": undefined,
        "trippedUp": "",
        "explanation": ""
    });

    const handleSubmit = () => {
        const formWithDate = { ...form, date: Date.now().toString() };
        handleSave(formWithDate);
        setForm({
            problem: "",
            pattern: "",
            solved: false,
            date: "",
            problemNumber: undefined,
            difficulty: undefined,
            timeComplexity: undefined,
            spaceComplexity: undefined,
            trippedUp: "",
            explanation: "",
        });
    }

    return (
        <>
            <div className="form-card">
                <div className="form-row  ">
                    <input
                        value={form.problem}
                        onChange={(e) => setForm({ ...form, problem: e.target.value })}
                        placeholder="Problem Name"
                    />
                    <input
                        value={form.problemNumber}
                        onChange={(e) => setForm({ ...form, problemNumber: Number(e.target.value) })}
                        placeholder="Problem Number"
                    />
                    <select
                        value={form.difficulty}
                        onChange={(e) => setForm({ ...form, difficulty: e.target.value as "Easy" | "Medium" | "Hard" })}>
                        <option value=""> Select Difficulty </option>
                        <option key={"Easy"} value={"Easy"}> Easy </option>
                        <option key={"Medium"} value={"Medium"}> Medium </option>
                        <option key={"Hard"} value={"Hard"}> Hard </option>
                    </select>
                    <select
                        value={form.pattern}
                        onChange={(e) => setForm({ ...form, pattern: e.target.value })}>
                        <option value=""> Select pattern </option>
                        {CORE_PATTERNS.map((pattern) => (
                            <option key={pattern} value={pattern}> {pattern} </option>
                        ))}
                    </select>
                </div>
                <div className="form-row">
                    <input
                        value={form.timeComplexity}
                        onChange={(e) => setForm({ ...form, timeComplexity: e.target.value })}
                        placeholder={"Time Complexity"}
                    />
                    <input
                        value={form.spaceComplexity}
                        onChange={(e) => setForm({ ...form, spaceComplexity: e.target.value })}
                        placeholder={"Space Complexity"}
                    />
                </div>
                <div className="form-row-full">
                    <textarea
                        value={form.trippedUp}
                        onChange={(e) => setForm({ ...form, trippedUp: e.target.value })}
                        placeholder="What tripped you"
                    />
                </div>
                <div className="form-row-full">
                    <textarea
                        value={form.explanation}
                        onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                        placeholder="Explain it simply"
                    />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button onClick={handleSubmit}> save </Button>
                </div>

            </div>
        </>
    )
}