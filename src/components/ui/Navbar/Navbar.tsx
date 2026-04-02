import "./Navbar.css";

import { supabase } from "../../../utils/supabase";
import type { User } from "@supabase/supabase-js";
import algovizLogo from '../../../assets/algoviz.png';

import { Button } from "../Button"

type NavbarProps = {
    user: User | null;
}

export const Navbar = ({ user }: NavbarProps) => {

    const userAvatar = user?.user_metadata.avatar_url ?? undefined;

    const signInWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        })
    }

    const signOut = async () => {
        await supabase.auth.signOut();
    }
    return (
        <div className="navbar">
            <div className="navbar-left">
                <img className="algoviz-logo" src={algovizLogo} />
            </div>
            <div className="navbar-right">
                {user ? (
                    <>
                        <img src={userAvatar} alt="user-avatar" className="user-avatar" />
                        <Button variant="danger" onClick={signOut}>Sign out</Button>
                    </>
                ) : (
                    <Button onClick={signInWithGoogle}>Sign in with Google</Button>
                )}
            </div>
        </div>
    )
}