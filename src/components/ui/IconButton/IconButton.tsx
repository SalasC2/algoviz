import { useState } from 'react';
import "./IconButton.css";

import { Button } from "../Button"

type IconButtonProps = {
    onConfirm: () => void;
}

export const IconButton = ({ onConfirm }: IconButtonProps) => {
    const [confirming, setConfirming] = useState(false);

    return (<>
        {confirming ?
            <span className="icon-btn-confirm">
                <Button onClick={onConfirm}> Yes </Button>
                <Button variant={"danger"} onClick={() => setConfirming(false)}> No </Button>
            </span>
            :
            <span onClick={() => setConfirming(true)}>
                <svg className="icon-btn" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                </svg>
            </span>
        }
    </>
    )
};