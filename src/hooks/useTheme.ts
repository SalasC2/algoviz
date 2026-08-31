import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

// Key is per-app so preferences don't collide if these apps ever share a
// domain/localStorage (AlgoViz/InterviewOS/CurriculumOS all use this hook).
const STORAGE_KEY = 'algoviz-theme';

export const useTheme = () => {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        const resolved = (stored === 'light' || stored === 'dark')
            ? stored
            : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', resolved); // no flash
        return resolved;
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    return { theme, toggle };
};
