import "./Landing.css";
import { signInWithGoogle } from '../../../utils/supabase';
import { BetaSignup } from '../../ui/BetaSignup';

type LandingProps = {
    onDemo: () => void;
}

export const Landing = ({ onDemo }: LandingProps) => {
    return (
        <div className="landing">
            <div className="hero">
                <h1 className="hero-headline">
                    You solved it. You forgot it.<br />You Googled it again.
                </h1>
                <p className="hero-sub">
                    Most LC practice builds familiarity, not pattern recognition. 
                    AlgoViz closes that gap — log what tripped you, track which 
                    patterns you actually know, and see exactly where your blind spots are.
                </p>
                <span className="beta-badge">beta</span>
                <div className="hero-actions">
                    <BetaSignup source="algoviz" onSignIn={signInWithGoogle} />
                    <button className="hero-demo" onClick={onDemo}>
                        View Demo
                    </button>
                </div>
            </div>
        </div>
    );
};