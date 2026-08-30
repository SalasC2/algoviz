import "./Navbar.css";

import { signOut } from '../../../utils/supabase';
import type { User } from "@supabase/supabase-js";
import algovizIcon from '../../../assets/algoviz.png';

import { Button } from "../../ui/Button"

export type NavView = "journal" | "tracer";

type NavbarProps = {
    user: User | null;
    activeView?: NavView;
    onChangeView?: (view: NavView) => void;
}

export const Navbar = ({ user, activeView = "journal", onChangeView }: NavbarProps) => {

    const userAvatar = user?.user_metadata.avatar_url ?? undefined;

    return (
        <div className="navbar">
            <div className="navbar-left">
                <img className="algoviz-logo" src={algovizIcon} />
                <span className="navbar-brand">AlgoViz</span>
                <p> Track your LeetCode patterns. Build real intuition. </p>
            </div>
            {onChangeView && (
                <div className="navbar-tabs">
                    <button
                        className={`navbar-tab ${activeView === "journal" ? "navbar-tab-active" : ""}`}
                        onClick={() => onChangeView("journal")}
                    >
                        Journal
                    </button>
                    <button
                        className={`navbar-tab ${activeView === "tracer" ? "navbar-tab-active" : ""}`}
                        onClick={() => onChangeView("tracer")}
                    >
                        Visualizer <span className="navbar-tab-beta">beta</span>
                    </button>
                </div>
            )}
            <div className="navbar-right">
                {user ? (
                    <>
                        <img src={userAvatar} alt="user-avatar" className="user-avatar" />
                        <Button variant="danger" onClick={signOut}>Sign out</Button>
                    </>
                ) : null}
            </div>
        </div>
    )
}