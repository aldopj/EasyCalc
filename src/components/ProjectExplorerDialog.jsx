import React, { useEffect, useId, useRef, useState } from 'react';

export default function ProjectExplorerDialog({
  isOpen,
  projects,
  activeProjectId,
  onClose,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const titleId = useId();
  const [newProjectName, setNewProjectName] = useState('');

  // Sync React isOpen prop with native top-layer <dialog>.showModal() / .close()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setNewProjectName('');
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for browsers without native `closedby="any"` support (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) {
      return undefined;
    }

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    onCreateProject(trimmed);
    setNewProjectName('');
  };

  return (
    <dialog
      ref={dialogRef}
      className="project-explorer-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      {...({ closedby: 'any' })}
    >
      <div className="project-explorer-shell">
        <div className="project-explorer-header">
          <div>
            <h2 id={titleId} className="project-explorer-title">
              Projects
            </h2>
            <p className="project-explorer-subtitle">
              Each project saves its own calculation notes in a separate file.
            </p>
          </div>
          <button
            type="button"
            className="popover-close-btn project-explorer-close"
            aria-label="Close Project Explorer"
            onClick={() => dialogRef.current?.close()}
          >
            ✕
          </button>
        </div>

        <form className="project-create-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="text-input project-create-input"
            aria-label="New project name"
            placeholder="New project name (e.g. Dining Table)"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            maxLength={60}
          />
          <button
            type="submit"
            className="pill-btn active project-create-btn"
          >
            + New Project
          </button>
        </form>

        <ul className="project-list" aria-label="Saved projects">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const noteCount = Number(project.noteCount) || 0;
            const noteLabel = `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;

            return (
              <li
                key={project.id}
                className={`project-row-item ${isActive ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="project-select-btn"
                  onClick={() => {
                    onSelectProject(project.id);
                    dialogRef.current?.close();
                  }}
                >
                  <div className="project-row-main">
                    <span className="project-row-name">{project.name}</span>
                    {isActive && (
                      <span className="project-active-badge">Active</span>
                    )}
                  </div>
                  <div className="project-row-meta">
                    <span className="project-file-badge">
                      {project.fileName || `${project.id}.notes.json`}
                    </span>
                    <span className="project-note-count">{noteLabel}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="delete-item-btn project-delete-btn"
                  aria-label={`Delete project ${project.name}`}
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
