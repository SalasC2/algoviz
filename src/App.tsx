import './App.css'
import { useState } from 'react';

import { useProblems } from "./hooks/useProblem";
import { useAuthUser } from './hooks/useAuthUser';

import { Navbar } from './components/layout/Navbar/Navbar';
import { Landing } from './components/layout/Landing/Landing';

import { ProblemForm } from './components/features/ProblemForm/ProblemForm';
import { PatternList } from './components/features/PatternList/PatternList';
import { ProgressBar } from './components/features/ProgressCard/ProgressCard';
import { SidePanel } from './components/layout/SidePanel/SidePanel';

function App() {
  const { grouped, handleSave, handleUpdate, handleDelete } = useProblems();
  const user = useAuthUser();

  // side panel state
  const [selectedProblem, setSelectedProblem] = useState<any | null>(null);

  return (
    <>
      <Navbar user={user} />
      {!user ? <Landing /> : (
        <div className="app">
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