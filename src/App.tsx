import "./App.css";
import { useState } from "react";

import { useProblems } from "./hooks/useProblem";
import { useAuthUser } from "./hooks/useAuthUser";
import { signInWithGoogle } from "./utils/supabase";

import { Navbar } from "./components/layout/Navbar";
import { Landing } from "./components/layout/Landing";
import { SidePanel } from "./components/layout/SidePanel";
import { Footer } from "./components/layout/Footer";

import { ProblemForm } from "./components/features/ProblemForm";
import { PatternList } from "./components/features/PatternList";
import { ProgressBar } from "./components/features/ProgressBar";

import { DEMO_DATA } from "./constants/demoData";

function App() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState<any | null>(null);

  const { grouped, handleSave, handleUpdate, handleDelete } = useProblems();
  const user = useAuthUser();

  // Build grouped data from demo mode
  const demoGrouped = DEMO_DATA.reduce((acc: any, problem: any) => {
    problem.patterns?.forEach((pattern: string) => {
      if (!acc[pattern]) acc[pattern] = [];
      acc[pattern].push(problem);
    });
    return acc;
  }, {});

  const activeGrouped = isDemoMode ? demoGrouped : grouped;

  return (
    <div className="app-container">
      <Navbar user={user} />

      <main className="main-content">
        {/* Landing when not logged in and not in demo mode */}
        {!user && !isDemoMode ? (
          <Landing onDemo={() => setIsDemoMode(true)} />
        ) : (
          <>
            {isDemoMode && (
              <div className="demo-banner">
                Viewing demo —{" "}
                <button
                  className="demo-banner-btn"
                  onClick={signInWithGoogle}
                >
                  Sign in with Google
                </button>{" "}
                to track your own problems
              </div>
            )}

            <div className={`app ${isDemoMode ? "app-demo" : ""}`}>
              {!isDemoMode && (
                <div className="form-column">
                  <ProblemForm handleSave={handleSave} />
                </div>
              )}
              <div
                className={`content-column ${
                  isDemoMode ? "content-column-full" : ""
                }`}
              >
                <ProgressBar grouped={activeGrouped} />
                <PatternList
                  grouped={activeGrouped}
                  handleDelete={
                    isDemoMode ? () => {} : handleDelete
                  }
                  onSelectProblem={setSelectedProblem}
                />
              </div>
            </div>

            <SidePanel
              problem={selectedProblem}
              onClose={() => setSelectedProblem(null)}
              onUpdate={isDemoMode ? () => {} : handleUpdate}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default App;