import { useState, useEffect } from 'react';
import type { FormType } from '../types/';

const STORAGE_KEY = "algoviz_problems";

export const useProblems = () => {
    const [data, setData] = useState<FormType[]>(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }, [data]);

    const handleSave = (form: FormType) => {
        setData(prev => [...prev, form]);
    }

    const handleDelete = (problem: string) => {
        setData(prev => prev.filter((e: FormType) => e.problem !== problem));
    }

    const exportData = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'algoviz_backup.json';
        a.click();
    }

    const importData = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imported = JSON.parse(e.target?.result as string);
            setData(imported);
        }
        reader.readAsText(file);
    }

    const grouped = data.reduce((acc: any, problem: any) => {
        const pattern = problem.pattern;
        if (!acc[pattern]) acc[pattern] = [];
        acc[pattern].push(problem);
        return acc;
    }, {})

    return { data, grouped, handleSave, handleDelete, exportData, importData}
}