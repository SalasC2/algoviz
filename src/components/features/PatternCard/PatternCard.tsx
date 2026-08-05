import { useState } from 'react';
import { IconButton } from "../../ui/IconButton";
import './PatternCard.css';
import type { FormType } from '../../../types';
import { getSolveStatusShort } from '../../../constants/patterns';

type Props = {
    pattern: string,
    problems: FormType[],
    handleDelete: (id: string) => void;
    onSelectProblem?: (problem: FormType) => void; // for side panel
}

export const PatternCard = ({ pattern, problems, handleDelete, onSelectProblem }: Props) => {
    const [expanded, setExpanded] = useState(false);
    const MAX_DISPLAY = 3;
    const visible = expanded ? problems : problems.slice(0, MAX_DISPLAY);
    const remaining = problems.length - MAX_DISPLAY;

    const getBadgeClass = (count: number): string => {
        if (count === 0) return 'pattern-length-gray';
        if (count <= 3) return 'pattern-length-yellow';
        if (count <= 7) return 'pattern-length-blue';
        return 'pattern-length-green'
    }

    const getDifficultyBadgeClass = (difficulty: string) => {
        if (difficulty === "Easy") return "pattern-difficulty-green";
        if (difficulty === "Medium") return "pattern-difficulty-yellow";
        if (difficulty === "Hard") return "pattern-difficulty-red";
        return "";
    }

    const getSolveStatusBadgeClass = (status?: string) => {
        if (status === "Solved Cold") return "solve-status-green";
        if (status === "Solved with Guidance") return "solve-status-yellow";
        if (status === "Not Solved") return "solve-status-red";
        return "";
    }

    return (
        <div className="pattern-card" id={`pattern-card-${pattern.replace(/\s+/g, '-').toLowerCase()}`}>
            <div className="pattern-card-header">
                <h3>{pattern}</h3>
                <span className={`pattern-length ${getBadgeClass(problems.length)}`}>
                    {problems.length}
                </span>
            </div>
            <div className={`pattern-card-content ${expanded ? "expanded" : ""}`}>
                {problems.length > 0 ? (
                    <>
                        <ul>
                            {visible.map((problemObj: FormType) => (
                                <li key={problemObj.problem} className={`pattern-problem ${expanded ? 'problem-expanded' : ''}`}>
                                    <div className="problem-row">
                                        <span
                                            className="problem-name"
                                            onClick={() => onSelectProblem?.(problemObj)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {problemObj.problem}
                                        </span>
                                        <span className={`pattern-difficulty ${getDifficultyBadgeClass(problemObj?.difficulty ?? "")}`}>
                                            {problemObj.difficulty}
                                        </span>
                                        {problemObj.solveStatus && (
                                            <span className={`solve-status-badge ${getSolveStatusBadgeClass(problemObj.solveStatus)}`}>
                                                {getSolveStatusShort(problemObj.solveStatus)}
                                            </span>
                                        )}
                                        <span className="delete-btn">
                                            <IconButton onConfirm={() => handleDelete(problemObj.id ?? "")} />
                                        </span>
                                    </div>

                                    {expanded && (
                                        <div className="problem-explanation">
                                            <p>{problemObj.explanation}</p>
                                            {/* <p>⚠️ {problemObj.trippedUp || "No notes yet"}</p> */}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {remaining > 0 && !expanded && (
                            <p className="more-problems" onClick={() => setExpanded(true)}>
                                +{remaining} more
                            </p>
                        )}

                        {expanded && problems.length > MAX_DISPLAY && (
                            <p className="more-problems" onClick={() => setExpanded(false)}>
                                Show less
                            </p>
                        )}
                    </>
                ) : (
                    <p>No problems yet</p>
                )}
            </div>
        </div>
    )
}