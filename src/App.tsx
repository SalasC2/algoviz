import './App.css'

import { useProblems } from "./hooks/useProblem";

import { ProblemForm } from './components/features/ProblemForm/ProblemForm';
import { PatternList } from './components/features/PatternList/PatternList';
import { ProgressBar } from './components/features/ProgressCard/ProgressCard';

function App() {
  const { data, grouped, handleSave, handleDelete } = useProblems();

  return (
    <div className="app">
      <div className="form-column">
        <ProblemForm handleSave={handleSave} />
      </div>
      <ProgressBar grouped={grouped} />
      <PatternList grouped={grouped} handleDelete={handleDelete} />

    </div>
  )
}

export default App
