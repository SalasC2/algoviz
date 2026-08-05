import "./ProgressBar.css";
import { CORE_PATTERNS } from "../../../constants/patterns";
import { Tooltip } from "../../ui/Tooltip";

type ProgressBarProps = {
    grouped: Record<string, []>,
}
export const ProgressBar = ({ grouped }: ProgressBarProps) => {
    const CONFIDENT_TARGET = 10;

    const getBadgeColor = (percent: number): string => {
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

    const getSolveBreakdown = (pattern: string) => {
        const problems = (grouped[pattern] ?? []) as any[];
        let cold = 0, guided = 0, notSolved = 0, untagged = 0;
        problems.forEach((p) => {
            if (p.solveStatus === "Solved Cold") cold++;
            else if (p.solveStatus === "Solved with Guidance") guided++;
            else if (p.solveStatus === "Not Solved") notSolved++;
            else untagged++;
        });
        return { cold, guided, notSolved, untagged };
    }

    const renderBreakdown = (pattern: string) => {
        const { cold, guided, notSolved, untagged } = getSolveBreakdown(pattern);
        return (
            <>
                {cold > 0 && <span className="breakdown-cold"> &middot; {cold} cold</span>}
                {guided > 0 && <span className="breakdown-guided"> &middot; {guided} guided</span>}
                {notSolved > 0 && <span className="breakdown-notsolved"> &middot; {notSolved} unsolved</span>}
                {untagged > 0 && <span className="breakdown-untagged"> &middot; {untagged} untagged</span>}
            </>
        )
    }

    const scrollToPattern = (pattern: string) => {
        const id = `pattern-card-${pattern.replace(/\s+/g, '-').toLowerCase()}`;
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('pattern-card-highlight');
        setTimeout(() => el.classList.remove('pattern-card-highlight'), 1200);
    }

    const sorted = [...CORE_PATTERNS].sort((a, b) => calc(b) - calc(a));

    return (
        <div className="progress-bar">
            <div className="pattern-coverage">
                Pattern Coverage
                <Tooltip content={
                    <>
                        Breakdown shows how each problem was solved &mdash; <strong>cold</strong>: solved
                        independently, <strong>guided</strong>: solved with help, <strong>unsolved</strong>:
                        attempted but not finished, <strong>untagged</strong>: solve status not recorded yet.
                    </>
                }>
                    <span className="info-icon">?</span>
                </Tooltip>
            </div>
            {sorted.map((pattern) => {
                const { cold } = getSolveBreakdown(pattern);
                const total = calc(pattern);
                const pct = Math.round(percentage(pattern));
                return (
                    <div key={pattern} className="pattern" onClick={() => scrollToPattern(pattern)}>
                        <span className="pattern-label"> {pattern} </span>
                        <Tooltip content={
                            <>{total} of {CONFIDENT_TARGET} attempted ({pct}%) &middot; {cold} solved cold</>
                        } className="progress-track-tooltip">
                            <div className="progress-track">
                                <div className={`progress-fill ${getBadgeColor(percentage(pattern))}`} style={{ width: `${percentage(pattern)}%` }} />
                            </div>
                        </Tooltip>
                        <span className="progress-count">
                            {total}
                            {renderBreakdown(pattern)}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}