import "./ProgressCard.css";
import { CORE_PATTERNS } from "../../../constants/patterns";

type ProgressBarProps = { 
    grouped: Record<string, []>,
}
export const ProgressBar = ({ grouped }: ProgressBarProps) => {
    const CONFIDENT_TARGET = 10;

    const getBadgeColor = (percent: number): string => {
        console.log(percent);
        if (percent === 0) return "progress-fill-gray";
        if (percent <= 30) return "progress-fill-yellow";
        if (percent <= 70) return "progress-fill-blue";
        return "progress-fill-green";
    }

    const calc = (pattern: string): number => {
        return grouped[pattern]?.length ?? 0;
    }

    const percentage = (pattern: string): number => {
        return Math.min((calc(pattern) / CONFIDENT_TARGET) * 100, 100);
    }

    const sorted = [...CORE_PATTERNS].sort((a, b) => calc(b) - calc(a));

    return (
        <div className="progress-bar">
            <div className="pattern-coverage"> Pattern Coverage </div>
            {sorted.map((pattern) => (
                <div key={pattern} className="pattern">
                    <span className="pattern-label"> {pattern} </span>
                    <div className="progress-track">
                        <div className={`progress-fill ${getBadgeColor(percentage(pattern))}`} style={{ width: `${percentage(pattern)}%` }} />
                    </div>
                    <span className="progress-count"> {calc(pattern)} </span>
                </div>
            ))}
        </div>
    )
}