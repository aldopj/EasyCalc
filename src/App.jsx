import React, { useCallback, useEffect, useState } from 'react';
import Calculator from './components/Calculator';
import BoardFootEstimator from './components/BoardFootEstimator';
import ReferenceChart from './components/ReferenceChart';
import ProjectExplorerDialog from './components/ProjectExplorerDialog';
import SettingsDialog, {
  STORAGE_KEY_SETTINGS,
  loadSavedSettings,
} from './components/SettingsDialog';
import { triggerHaptic } from './utils/haptics';
import {
  initializeProjectsState,
  createProject,
  selectProject,
  deleteProject,
  saveProjectFile,
} from './utils/projectStorage';

export default function App() {
  const [activeTab, setActiveTab] = useState('calc');
  const [initialProjectsState] = useState(() => initializeProjectsState());
  const [projects, setProjects] = useState(initialProjectsState.projects);
  const [activeProjectId, setActiveProjectId] = useState(
    initialProjectsState.activeProjectId
  );
  const [activeProjectData, setActiveProjectData] = useState(
    initialProjectsState.activeProjectData
  );
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [baseUnit, setBaseUnit] = useState(
    () => loadSavedSettings()?.baseUnit || 'in-fractional'
  );
  const [precision, setPrecision] = useState(
    () => loadSavedSettings()?.precision || 16
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ baseUnit, precision })
      );
    } catch {
      // Ignore storage errors
    }
  }, [baseUnit, precision]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleSelectProject = useCallback(
    (projectId) => {
      const next = selectProject(projectId, projects);
      setActiveProjectId(next.activeProjectId);
      setActiveProjectData(next.activeProjectData);
      setIsExplorerOpen(false);
    },
    [projects]
  );

  const handleCreateProject = useCallback(
    (name) => {
      const created = createProject(name, projects);
      if (!created) return;
      setProjects(created.projects);
      setActiveProjectId(created.newProject.id);
      setActiveProjectData(created.activeProjectData);
      setIsExplorerOpen(false);
    },
    [projects]
  );

  const handleDeleteProject = useCallback(
    (projectId) => {
      const next = deleteProject(projectId, projects, activeProjectId);
      setProjects(next.projects);
      setActiveProjectId(next.activeProjectId);
      setActiveProjectData(next.activeProjectData);
    },
    [projects, activeProjectId]
  );

  const handleSaveProjectData = useCallback(
    (notes, variables, freeflowNotes) => {
      if (!activeProject) return;
      const updatedIndex = saveProjectFile(
        activeProject.id,
        activeProject.name,
        notes,
        variables,
        freeflowNotes
      );
      if (updatedIndex) {
        setProjects(updatedIndex);
      }
      setActiveProjectData({ notes, variables, freeflowNotes });
    },
    [activeProject?.id, activeProject?.name]
  );

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <button
            type="button"
            className="brand brand-settings-btn"
            onClick={() => {
              triggerHaptic(8);
              setIsSettingsOpen(true);
            }}
            aria-label="Pocket Calipers Settings"
            title="Open Settings"
          >
            <svg
              className="brand-caliper-icon"
              viewBox="0 0 28 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Main scale beam */}
              <rect
                x="2"
                y="7"
                width="24"
                height="5"
                rx="1.2"
                fill="#272c38"
                stroke="#f59e0b"
                strokeWidth="1.8"
              />
              {/* Tick marks along beam */}
              <path
                d="M7 7v2.5M11 7v2M15 7v2.5M19 7v2M23 7v2.5"
                stroke="#f59e0b"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              {/* Fixed left jaw */}
              <path
                d="M2 7V3.5L5.5 7M2 12v11.5L6.5 18V12"
                fill="#f59e0b"
                stroke="#f59e0b"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              {/* Sliding vernier jaw */}
              <path
                d="M14 7V3.5L10.5 7M13.5 12v6l4.5 5.5V12"
                fill="#38bdf8"
                stroke="#38bdf8"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              {/* Slider carriage */}
              <rect
                x="12.5"
                y="6.2"
                width="6.5"
                height="6.6"
                rx="1"
                fill="#181b22"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
            </svg>
            <span className="brand-title">Pocket Calipers</span>
          </button>

          <button
            type="button"
            className="project-switcher-btn"
            onClick={() => setIsExplorerOpen(true)}
            aria-label={`Project: ${activeProject.name}. Open Project Explorer`}
            title="Open Project Explorer"
          >
            <span className="project-switcher-icon" aria-hidden="true">
              📁
            </span>
            <span className="project-switcher-name">{activeProject.name}</span>
            <span className="project-switcher-caret" aria-hidden="true">
              ▾
            </span>
          </button>
        </div>

        <select
          aria-label="App Mode"
          className="mode-dropdown"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
        >
          <option value="calc">📏 Calculator</option>
          <option value="bf">🪵 Board Feet</option>
          <option value="chart">📐 Fraction Chart</option>
        </select>
      </header>

      <main className="app-content">
        {activeTab === 'calc' && (
          <Calculator
            key={activeProject.id}
            projectName={activeProject.name}
            baseUnit={baseUnit}
            precision={precision}
            initialNotes={activeProjectData.notes}
            initialVariables={activeProjectData.variables}
            initialFreeflowNotes={activeProjectData.freeflowNotes || ''}
            onSaveProjectData={handleSaveProjectData}
            onOpenProjectExplorer={() => setIsExplorerOpen(true)}
          />
        )}
        {activeTab === 'bf' && <BoardFootEstimator />}
        {activeTab === 'chart' && <ReferenceChart />}
      </main>

      <SettingsDialog
        isOpen={isSettingsOpen}
        baseUnit={baseUnit}
        precision={precision}
        onChangeBaseUnit={setBaseUnit}
        onChangePrecision={setPrecision}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ProjectExplorerDialog
        isOpen={isExplorerOpen}
        projects={projects}
        activeProjectId={activeProject.id}
        onClose={() => setIsExplorerOpen(false)}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
      />
    </>
  );
}
