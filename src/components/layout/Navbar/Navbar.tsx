import "./Navbar.css";

import { signOut } from '../../../utils/supabase';
import type { User } from "@supabase/supabase-js";
import algovizIcon from '../../../assets/algoviz.png';

import { Button } from "../../ui/Button"

type NavbarProps = {
    user: User | null;
}

export const Navbar = ({ user }: NavbarProps) => {

    const userAvatar = user?.user_metadata.avatar_url ?? undefined;

    return (
        <div className="navbar">
            <div className="navbar-left">
                <img className="algoviz-logo" src={algovizIcon} />
                <span className="navbar-brand">AlgoViz</span>
                <p> Track your LeetCode patterns. Build real intuition. </p>
            </div>
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