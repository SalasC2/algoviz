import './Tooltip.css';
import type { ReactNode } from 'react';

type TooltipProps = {
    content: ReactNode;
    children: ReactNode;
    className?: string;
}

export const Tooltip = ({ content, children, className = '' }: TooltipProps) => {
    return (
        <span className={`tooltip-wrapper ${className}`}>
            {children}
            <span className="tooltip-panel">{content}</span>
        </span>
    )
}