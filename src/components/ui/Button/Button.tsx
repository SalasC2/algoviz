import './Button.css';

type ButtonVariant = "primary" | "danger";

type ButtonProps = {
    children: React.ReactNode,
    onClick?: () => void,
    variant?: ButtonVariant,
    disabled?: boolean
    className?: string
}

export const Button = ({children, onClick, variant = "primary", disabled = false, className }: ButtonProps) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`btn btn-${variant} ${className ?? ''}`}
        > 
            {children}
        </button>
    )
}