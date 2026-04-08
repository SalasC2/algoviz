import { useEffect, useState } from 'react';
import './SidePanel.css';

import { DropdownSelect } from '../../ui/DropdownSelect/DropdownSelect';

import { CORE_PATTERNS, ADVANCED_PATTERNS } from '../../../constants/patterns';

type SidePanelProps = {
    problem: any | null;
    onClose: () => void;
    onUpdate: (updated: any) => void;
};

export const SidePanel = ({ problem, onClose, onUpdate }: SidePanelProps) => {
    const [visible, setVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedProblem, setEditedProblem] = useState<any>(null);
    const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

    const getDifficultyBadgeClass = (difficulty: string) => {
        if (difficulty === "Easy") return "problem-difficulty-green";
        if (difficulty === "Medium") return "problem-difficulty-yellow";
        if (difficulty === "Hard") return "problem-difficulty-red";
        return "";
    }

    useEffect(() => {
        if (problem) {
            setVisible(true);
            setEditedProblem({ ...problem });
            setIsEditing(false);
            setDirtyFields(new Set()); // reset dirty on new problem
        } else {
            setVisible(false);
        }
    }, [problem]);

    const handleSave = () => {
        onUpdate(editedProblem);
        setIsEditing(false);
        setDirtyFields(new Set());
    }


    const field = (key: string, long = false) => {
        if (!isEditing) return null;
        const isDirty = dirtyFields.has(key);
        const onChange = (e: any) => {
            setEditedProblem({ ...editedProblem, [key]: e.target.value });
            setDirtyFields(prev => new Set(prev).add(key));
        }

        if (key === "difficulty") {
            return (
                <select
                    value={editedProblem?.difficulty ?? ""}
                    onChange={(e) => {
                        setEditedProblem({ ...editedProblem, difficulty: e.target.value });
                        setDirtyFields(prev => new Set(prev).add(key));
                    }}
                    className={`edit-field ${isDirty ? 'edit-field-dirty' : ''}`}
                >
                    <DropdownSelect
                        options={["Easy", "Medium", "Hard"]}
                        value={editedProblem.difficulty}
                        onChange={(difficulty) => {
                            setEditedProblem({...editedProblem, difficulty})
                            setDirtyFields(prev => new Set(prev).add('difficulty'))
                        }}
                    />
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                </select>
            )
        }

        if (key === "patterns") {
            return (
                <DropdownSelect
                    options={CORE_PATTERNS}
                    value={editedProblem?.patterns ?? []}
                    onChange={(patterns) => {
                        setEditedProblem({ ...editedProblem, patterns });
                        setDirtyFields(prev => new Set(prev).add('patterns'));
                    }}
                    multiple={true}
                    placeholder="Select patterns"
                />
            )
        }

        return long ? (
            <textarea
                value={editedProblem?.[key] ?? ""}
                onChange={onChange}
                className={`edit-field ${isDirty ? 'edit-field-dirty' : ''}`}
            />
        ) : (
            <input
                value={editedProblem?.[key] ?? ""}
                onChange={onChange}
                className={`edit-field ${isDirty ? 'edit-field-dirty' : ''}`}
            />
        )
    }
    if (!problem) return null;

    return (
        <>
            <div className={`side-panel-backdrop ${visible ? 'visible' : ''}`} onClick={onClose} />
            <div className={`side-panel ${visible ? 'visible' : ''}`}>
                <div className="side-panel-header">
                    <div className="problem-header">
                        <span>
                            {!isEditing && problem.problem}
                            {field('problem')}
                        </span>
                        <span className={!isEditing ? `problem-difficulty ${getDifficultyBadgeClass(problem.difficulty)}` : ''}>
                            {!isEditing && problem.difficulty}
                            {field("difficulty")}
                        </span>
                    </div>
                    <button className="close-btn" onClick={onClose}>✖</button>
                </div>

                <section>
                    <h4>Pattern</h4>
                    {!isEditing && (
                        <div className="patterns-list">
                            {problem.patterns?.map((p: string) => (
                                <span key={p} className="pattern-tag">{p}</span>
                            ))}
                        </div>
                    )}
                    {field("patterns")}
                </section>

                <section>
                    <h4>Explanation</h4>
                    {!isEditing && <p>{problem.explanation}</p>}
                    {field("explanation", true)}
                </section>

                <section>
                    <h4>Tripped Up</h4>
                    {!isEditing && <p>{problem.trippedUp || "No notes yet"}</p>}
                    {field("trippedUp", true)}
                </section>

                <section>
                    <h4>Time Complexity</h4>
                    {!isEditing && <p>{problem.timeComplexity || "—"}</p>}
                    {field("timeComplexity")}
                </section>

                <section>
                    <h4>Space Complexity</h4>
                    {!isEditing && <p>{problem.spaceComplexity || "—"}</p>}
                    {field("spaceComplexity")}
                </section>

                <div className="side-panel-actions">
                    {!isEditing ? (
                        <button className="edit-btn" onClick={() => setIsEditing(true)}>Edit</button>
                    ) : (
                        <>
                            <button className="save-btn" onClick={handleSave}>Save</button>
                            <button className="cancel-btn" onClick={() => {
                                setEditedProblem({ ...problem });
                                setIsEditing(false);
                                setDirtyFields(new Set());
                            }}>Cancel</button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};