import './App.css'
import { useState } from 'react';

import { useProblems } from "./hooks/useProblem";
import { useAuthUser } from './hooks/useAuthUser';
import { signInWithGoogle } from './utils/supabase';

import { Navbar } from './components/layout/Navbar/Navbar';
import { Landing } from './components/layout/Landing/Landing';
import { SidePanel } from './components/layout/SidePanel/SidePanel';

import { ProblemForm } from './components/features/ProblemForm/ProblemForm';
import { PatternList } from './components/features/PatternList/PatternList';
import { ProgressBar } from './components/features/ProgressCard/ProgressCard';

import { DEMO_DATA } from './constants/demoData';

function App() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState<any | null>(null);

  const { grouped, handleSave, handleUpdate, handleDelete } = useProblems();
  const user = useAuthUser();

  // build grouped from demo data when in demo mode
  const demoGrouped = DEMO_DATA.reduce((acc: any, problem: any) => {
    problem.patterns?.forEach((pattern: string) => {
      if (!acc[pattern]) acc[pattern] = [];
      acc[pattern].push(problem);
    });
    return acc;
  }, {});

  const activeGrouped = isDemoMode ? demoGrouped : grouped;

  // not logged in and not in demo mode — show landing
  if (!user && !isDemoMode) {
    return (
      <>
        <Navbar user={user} />
        <Landing onDemo={() => setIsDemoMode(true)} />
      </>
    )
  }

  return (
    <>
      <Navbar user={user} />

      {isDemoMode && (
        <div className="demo-banner">
          Viewing demo —{' '}
          <button className="demo-banner-btn" onClick={signInWithGoogle}>
            Sign in with Google
          </button>{' '}
          to track your own problems
        </div>
      )}

      <div className={`app ${isDemoMode ? 'app-demo' : ''}`}>
        {!isDemoMode && (
          <div className="form-column">
            <ProblemForm handleSave={handleSave} />
          </div>
        )}
        <div className={`content-column ${isDemoMode ? 'content-column-full' : ''}`}>
          <ProgressBar grouped={activeGrouped} />
          <PatternList
            grouped={activeGrouped}
            handleDelete={isDemoMode ? () => { } : handleDelete}
            onSelectProblem={setSelectedProblem}
          />
        </div>
      </div>

      <SidePanel
        problem={selectedProblem}
        onClose={() => setSelectedProblem(null)}
        onUpdate={isDemoMode ? () => { } : handleUpdate}
      />
    </>
  )
}

export default App;