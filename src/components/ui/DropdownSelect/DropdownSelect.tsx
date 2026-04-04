import { useState, useEffect, useRef } from 'react';
import './DropdownSelect.css';
import { Button } from '../Button';

type DropdownSelectProps = {
    options: string[];
    value: string | string[];
    onChange: (value: any) => void;
    multiple?: boolean;
    placeholder?: string;
    className?: string;
}

export const DropdownSelect = ({ 
    options, 
    value, 
    onChange, 
    multiple = false, 
    placeholder = 'Select...',
    className = ''
}: DropdownSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Whether an option is selected — works for both single and multiple
    const isSelected = (option: string) => {
        if (multiple) return (value as string[]).includes(option);
        return value === option;
    }

    const handleSelect = (option: string) => {
        if (multiple) {
            const arr = value as string[];
            const updated = arr.includes(option)
                ? arr.filter(p => p !== option)
                : [...arr, option];
            onChange(updated);
        } else {
            // Single select — toggle off if same, otherwise replace
            onChange(value === option ? '' : option);
            setIsOpen(false); // auto close on single select
        }
    }

    // Button label
    const getLabel = () => {
        if (multiple) {
            const arr = value as string[];
            return arr.length === 0 ? placeholder : `${arr.length} selected`;
        }
        return value || placeholder;
    }

    // Tags for multiple mode
    const getTags = () => {
        if (!multiple) return null;
        const arr = value as string[];
        return (
            <div className="dropdown-tags">
                {arr.map(v => (
                    <span key={v} className="dropdown-tag">
                        {v}
                        <button onClick={() => handleSelect(v)}>×</button>
                    </span>
                ))}
            </div>
        )
    }

    return (
        <div ref={containerRef} className={`dropdown-select-container ${className}`}>
            <Button className="dropdown-select-btn" onClick={() => setIsOpen(!isOpen)}>
                {getLabel()}
            </Button>
            {getTags()}
            {isOpen && (
                <div className="dropdown-menu">
                    {options.map(option => (
                        <div 
                            key={option} 
                            className={`dropdown-item ${isSelected(option) ? 'selected' : ''}`}
                            onClick={() => handleSelect(option)}
                        >
                            <input
                                type="checkbox"
                                checked={isSelected(option)}
                                onChange={() => {}} // handled by div onClick
                                readOnly
                            />
                            <label>{option}</label>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}