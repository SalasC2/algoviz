import './Button.css';

type ButtonVariant = "primary" | "danger";

type ButtonProps = {
    children: React.ReactNode,
    onClick?: () => void,
    variant?: ButtonVariant,
    disabled?: boolean
}

export const Button = ({children, onClick, variant = "primary", disabled = false }: ButtonProps) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`btn btn-${variant}`}
        > 
            {children}
        </button>
    )
}