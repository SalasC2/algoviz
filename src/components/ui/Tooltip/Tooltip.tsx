import './Tooltip.css';
import type { ReactNode } from 'react';

type TooltipProps = {
    content: ReactNode;
    children: ReactNode;
    className?: string;
}

export const Tooltip = ({ content, children, className = '' }: TooltipProps) => {
    return (
        // tabIndex makes this tappable-to-reveal on touch devices, not just
        // hoverable — see .tooltip-wrapper:focus-within in Tooltip.css.
        <span className={`tooltip-wrapper ${className}`} tabIndex={0}>
            {children}
            <span className="tooltip-panel">{content}</span>
        </span>
    )
}