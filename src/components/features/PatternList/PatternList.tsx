import './PatternList.css'
import { PatternCard } from "../PatternCard/PatternCard"
import { CORE_PATTERNS, ADVANCED_PATTERNS } from "../../../constants/patterns";

type Props = {
    grouped: Record<string, []>,
    handleDelete: (id: string) => void;
    onSelectProblem?: (problem: any) => void; // for side panel
}

export const PatternList = ({ grouped, handleDelete, onSelectProblem }: Props) => {
    const hasAdvanced = ADVANCED_PATTERNS.some((p) => grouped[p]?.length > 0);
    const sorted = [...CORE_PATTERNS].sort((a, b) => 
        (grouped[b]?.length ?? 0) - (grouped[a]?.length ?? 0));

    return (
        <div className="pattern-list">
            {sorted.map((pattern) => (
                <PatternCard
                    key={pattern}
                    pattern={pattern}
                    problems={grouped[pattern] || []}
                    handleDelete={handleDelete}
                    onSelectProblem={onSelectProblem} // pass down
                />
            ))}

            {hasAdvanced && (
                <div className="advanced-patterns">
                    {ADVANCED_PATTERNS.map((pattern) => (
                        <PatternCard
                            key={pattern}
                            pattern={pattern}
                            problems={grouped[pattern] || []}
                            handleDelete={handleDelete}
                            onSelectProblem={onSelectProblem} // pass down
                        />
                    ))}
                </div>
            )}
        </div>
    )
}