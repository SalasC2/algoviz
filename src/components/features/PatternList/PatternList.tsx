import './PatternList.css'
import { PatternCard } from "../PatternCard/PatternCard"
import { CORE_PATTERNS, ADVANCED_PATTERNS } from "../../../constants/patterns";

type Props = {
    grouped: Record<string, []>,
    handleDelete: (id: string) => void;
    onSelectProblem?: (problem: any) => void;
}

export const PatternList = ({ grouped, handleDelete, onSelectProblem }: Props) => {
    const ALL_PATTERNS = [...CORE_PATTERNS, ...ADVANCED_PATTERNS];
    const sorted = [...ALL_PATTERNS].sort((a, b) => 
        (grouped[b]?.length ?? 0) - (grouped[a]?.length ?? 0));

    return (
        <div className="pattern-list">
            {sorted.map((pattern) => (
                <PatternCard
                    key={pattern}
                    pattern={pattern}
                    problems={grouped[pattern] || []}
                    handleDelete={handleDelete}
                    onSelectProblem={onSelectProblem}
                />
            ))}
        </div>
    )
}