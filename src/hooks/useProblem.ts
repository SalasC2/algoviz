import { useState, useEffect } from 'react';

import { useAuthUser } from './useAuthUser';
import { supabase } from '../utils/supabase'

import type { FormType } from '../types/';

export const useProblems = () => {
    const user = useAuthUser();

    const [data, setData] = useState<FormType[]>([]);

    const toSnakeCase = (form: FormType) => ({
        problem: form.problem,
        problem_number: form.problemNumber ?? 0,
        pattern: form.patterns,
        difficulty: form.difficulty,
        date: form.date,
        solved: form.solved,
        time_complexity: form.timeComplexity ?? "",
        space_complexity: form.spaceComplexity ?? "",
        tripped_up: form.trippedUp ?? "",
        explanation: form.explanation,
    })

    const fromSnakeCase = (row: any): FormType => ({
        id: row.id,
        problem: row.problem,
        problemNumber: row.problem_number,
        patterns: row.pattern,
        difficulty: row.difficulty,
        date: row.date,
        solved: row.solved,
        timeComplexity: row.time_complexity,
        spaceComplexity: row.space_complexity,
        trippedUp: row.tripped_up,
        explanation: row.explanation,
    })

    useEffect(() => {
        if (!user) return;

        const fetchProblems = async () => {
            const { data: problems, error } = await supabase
                .from('problems')
                .select("*")
                .eq('user_id', user.id);
            if (error) console.error(error);
            else setData(problems.map(fromSnakeCase))
        }

        fetchProblems();
    }, [user])


    const handleSave = async (form: FormType) => {
        if (!user) return;
        const { data: newProblem, error } = await supabase
            .from('problems')
            .insert([{ ...toSnakeCase(form), user_id: user.id }])
            .select()
            .single();

        if (error) console.error(error);
        else setData(prev => [...prev, fromSnakeCase(newProblem)]);
    }

    const handleUpdate = async (updated: FormType) => {
        if (!user) return;
        const { error } = await supabase
            .from('problems')
            .update(toSnakeCase(updated))
            .eq('id', updated.id ?? "")
            .eq('user_id', user.id);

        if (error) console.error(error);
        else setData(prev => prev.map(p =>
            p.id === updated.id ? updated : p
        ));
    }

    const handleDelete = async (problem: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('problems')
            .delete()
            .eq('problem', problem)
            .eq('user_id', user.id);
        if (error) console.log(error);
        else setData(prev => prev.filter((e: FormType) => e.problem !== problem));
    }

    const exportData = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
        problem.patterns?.forEach((pattern: string) => {
            if (!acc[pattern]) acc[pattern] = [];
            acc[pattern].push(problem);
        });
        return acc;
    }, {})

    return { data, grouped, handleSave, handleUpdate, handleDelete, exportData, importData }
}