import './App.css'

import { useProblems } from "./hooks/useProblem";
import { useAuthUser } from './hooks/useAuthUser';

import { Navbar } from './components/ui/Navbar/Navbar';
import { Landing } from './components/ui/Landing/Landing';

import { ProblemForm } from './components/features/ProblemForm/ProblemForm';
import { PatternList } from './components/features/PatternList/PatternList';
import { ProgressBar } from './components/features/ProgressCard/ProgressCard';

function App() {
  const { grouped, handleSave, handleDelete } = useProblems();

  const user = useAuthUser();

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
            <PatternList grouped={grouped} handleDelete={handleDelete} />
          </div>
        </div>
      )
      }
    </>
  )
}

export default App
