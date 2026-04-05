import './App.css'
import { useState } from 'react';

import { signInWithGoogle } from './utils/supabase';

import { useProblems } from "./hooks/useProblem";
import { useAuthUser } from './hooks/useAuthUser';

import { Navbar } from './components/layout/Navbar/Navbar';
import { Landing } from './components/layout/Landing/Landing';

import { ProblemForm } from './components/features/ProblemForm/ProblemForm';
import { PatternList } from './components/features/PatternList/PatternList';
import { ProgressBar } from './components/features/ProgressCard/ProgressCard';
import { SidePanel } from './components/layout/SidePanel/SidePanel';

function App() {
  const [isDemoMode, setIsDemoMode] = useState(false);

  const { grouped, handleSave, handleUpdate, handleDelete } = useProblems();
  const user = useAuthUser();

  // side panel state
  const [selectedProblem, setSelectedProblem] = useState<any | null>(null);

  return (
    <>
      <Navbar user={user} />
      {!user && !isDemoMode ? <Landing onDemo={() => setIsDemoMode(true)} /> : (
        <div className="app">
          {isDemoMode && (
            <div className="demo-banner">
              Viewing demo — <button onClick={signInWithGoogle}>Sign in with Google</button> to track your own problems
            </div>
          )}
          <div className="form-column">
            <ProblemForm handleSave={handleSave} />
          </div>
          <div className="content-column">
            <ProgressBar grouped={grouped} />
            <PatternList
              grouped={grouped}
              handleDelete={handleDelete}
              onSelectProblem={setSelectedProblem} // side panel wiring
            />
          </div>

          {/* side panel */}
          <SidePanel
            problem={selectedProblem}
            onClose={() => setSelectedProblem(null)}
            onUpdate={handleUpdate}
          />
        </div>
      )}
    </>
  )
}

export default App;