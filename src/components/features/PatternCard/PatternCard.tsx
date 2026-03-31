
import { IconButton } from "../../ui/IconButton/IconButton";
import './PatternCard.css';

type Props = {
    pattern: string,
    problems: [],
    handleDelete: (problem: string) => void;
}


export const PatternCard = ({ pattern, problems, handleDelete }: Props) => {
    const MAX_DISPLAY = 3;
    const visible = problems.slice(0, MAX_DISPLAY);
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

    return (
        <div className="pattern-card">
            <div className="pattern-card-header">
                <h3> {pattern} </h3>
                <span className={`pattern-length ${getBadgeClass(problems.length)}`}>
                    {problems.length}
                </span>
            </div>
            <div className="pattern-card-content">
                {problems.length > 0 ? (
                    <>
                        <ul>
                            {visible.map((problemObj: any) => (
                                    <li key={problemObj.problem} className="pattern-problem">
                                        <div className="problem-row">
                                            <span className="problem-name">
                                                {problemObj.problem}
                                            </span>
                                            <span className={`pattern-difficulty ${getDifficultyBadgeClass(problemObj?.difficulty)}`}>
                                                {problemObj.difficulty}
                                            </span>
                                            <span className="delete-btn">
                                                {<IconButton onConfirm={() => handleDelete(problemObj.problem)} />}
                                            </span>
                                        </div>
                                        <p className="problem-explanation"> {problemObj.explanation} </p>
                                    </li>

                            ))}
                        </ul>
                        {remaining > 0 && (
                            <p className="more-problems"> +{remaining} more </p>
                        )}
                    </>
                ) :
                    <p> No problems yet</p>
                }
            </div>
        </div>
    )
}