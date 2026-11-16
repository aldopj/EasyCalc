const STORAGE_KEY_PROJECTS_INDEX = 'easycalc_projects_index_v1';
const STORAGE_KEY_ACTIVE_PROJECT = 'easycalc_active_project_id_v1';
const PROJECT_FILE_PREFIX = 'easycalc_project_file_';

const LEGACY_STORAGE_KEYS = [
  'easycalc_notes_v2',
  'easycalc_variables_v2',
  'easycalc_notes_v1',
  'easycalc_variables_v1',
];

export function toFileSlug(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'project'}.notes.json`;
}

export function getProjectFileKey(projectId) {
  return `${PROJECT_FILE_PREFIX}${projectId}`;
}

async function syncProjectFileToOPFS(projectId, fileData) {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.getDirectory !== 'function'
    ) {
      return;
    }
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(`${projectId}.notes.json`, {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(fileData, null, 2));
    await writable.close();
  } catch {
    // Ignore OPFS errors in unsupported or restricted environments
  }
}

async function deleteProjectFileFromOPFS(projectId) {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.getDirectory !== 'function'
    ) {
      return;
    }
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(`${projectId}.notes.json`);
  } catch {
    // Ignore OPFS delete errors if file or API is unavailable
  }
}

function sanitizeNotes(rawNotes) {
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes.filter(
    (item) =>
      item &&
      typeof item.expr === 'string' &&
      typeof item.result === 'string' &&
      item.qty &&
      typeof item.qty.value === 'number'
  );
}

function syncVariablesWithNotes(rawVars, notes) {
  const baseVars =
    rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)
      ? { ...rawVars }
      : {};

  if (Array.isArray(notes)) {
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note && note.varName && note.qty) {
        const key = note.varName.toLowerCase();
        baseVars[key] = {
          name: note.varName,
          qty: note.qty,
          formatted: note.result,
        };
      }
    }
  }

  return baseVars;
}

function readProjectsIndex() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS_INDEX);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.filter(
      (proj) =>
        proj &&
        typeof proj.id === 'string' &&
        proj.id.length > 0 &&
        typeof proj.name === 'string' &&
        proj.name.trim().length > 0
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function writeProjectsIndex(projects) {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS_INDEX, JSON.stringify(projects));
  } catch {
    // Ignore quota or private-browsing storage errors
  }
}

function writeActiveProjectId(projectId) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, projectId);
  } catch {
    // Ignore storage errors
  }
}

export function loadProjectFile(
  projectId,
  fallbackNotes = [],
  fallbackVars = {},
  fallbackFreeflowNotes = ''
) {
  try {
    const raw = localStorage.getItem(getProjectFileKey(projectId));
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const notes = sanitizeNotes(parsed.notes);
        const variables = syncVariablesWithNotes(parsed.variables, notes);
        const freeflowNotes =
          typeof parsed.freeflowNotes === 'string' ? parsed.freeflowNotes : '';
        return { notes, variables, freeflowNotes };
      }
    }
  } catch {
    // Fallback below if storage is unavailable or corrupted
  }
  const safeNotes = sanitizeNotes(fallbackNotes);
  return {
    notes: safeNotes,
    variables: syncVariablesWithNotes(fallbackVars, safeNotes),
    freeflowNotes:
      typeof fallbackFreeflowNotes === 'string' ? fallbackFreeflowNotes : '',
  };
}

export function saveProjectFile(
  projectId,
  projectName,
  notes,
  variables,
  freeflowNotes = ''
) {
  const now = Date.now();
  const safeNotes = sanitizeNotes(notes);
  const safeVars = syncVariablesWithNotes(variables, safeNotes);
  const safeFreeflowNotes =
    typeof freeflowNotes === 'string' ? freeflowNotes : '';
  const fileData = {
    id: projectId,
    name: projectName,
    fileName: toFileSlug(projectName),
    updatedAt: now,
    notes: safeNotes,
    variables: safeVars,
    freeflowNotes: safeFreeflowNotes,
  };

  try {
    localStorage.setItem(getProjectFileKey(projectId), JSON.stringify(fileData));
  } catch {
    // Ignore quota or private-browsing storage errors
  }

  void syncProjectFileToOPFS(projectId, fileData);

  const existingIndex = readProjectsIndex();
  if (existingIndex) {
    const updatedIndex = existingIndex.map((proj) =>
      proj.id === projectId
        ? {
            ...proj,
            name: projectName || proj.name,
            fileName: toFileSlug(projectName || proj.name),
            noteCount: safeNotes.length,
            updatedAt: now,
          }
        : proj
    );
    writeProjectsIndex(updatedIndex);
    return updatedIndex;
  }

  return null;
}

export function initializeProjectsState() {
  const existingProjects = readProjectsIndex();

  if (!existingProjects) {
    // One-time migration from legacy global v2 keys if present
    let initialNotes = [];
    let initialVars = {};
    try {
      const legacyNotesRaw = localStorage.getItem('easycalc_notes_v2');
      const legacyVarsRaw = localStorage.getItem('easycalc_variables_v2');
      if (legacyNotesRaw) {
        initialNotes = sanitizeNotes(JSON.parse(legacyNotesRaw));
      }
      if (legacyVarsRaw) {
        initialVars = syncVariablesWithNotes(
          JSON.parse(legacyVarsRaw),
          initialNotes
        );
      } else {
        initialVars = syncVariablesWithNotes({}, initialNotes);
      }
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      initialNotes = [];
      initialVars = {};
    }

    const now = Date.now();
    const defaultProject = {
      id: 'default',
      name: 'Default Project',
      fileName: toFileSlug('Default Project'),
      noteCount: initialNotes.length,
      createdAt: now,
      updatedAt: now,
    };

    const projects = [defaultProject];
    writeProjectsIndex(projects);
    writeActiveProjectId(defaultProject.id);
    saveProjectFile(
      defaultProject.id,
      defaultProject.name,
      initialNotes,
      initialVars,
      ''
    );

    return {
      projects,
      activeProjectId: defaultProject.id,
      activeProjectData: {
        notes: initialNotes,
        variables: initialVars,
        freeflowNotes: '',
      },
    };
  }

  let storedActiveId = null;
  try {
    storedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
  } catch {
    storedActiveId = null;
  }

  const matchedProject =
    existingProjects.find((p) => p.id === storedActiveId) || existingProjects[0];

  if (matchedProject.id !== storedActiveId) {
    writeActiveProjectId(matchedProject.id);
  }

  const activeProjectData = loadProjectFile(matchedProject.id);
  const syncedProjects = existingProjects.map((proj) => {
    if (proj.id === matchedProject.id) {
      return { ...proj, noteCount: activeProjectData.notes.length };
    }
    return proj;
  });

  return {
    projects: syncedProjects,
    activeProjectId: matchedProject.id,
    activeProjectData,
  };
}

export function createProject(name, currentProjects) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;

  const now = Date.now();
  const id = `proj_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const newProject = {
    id,
    name: cleanName,
    fileName: toFileSlug(cleanName),
    noteCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const nextProjects = [...currentProjects, newProject];
  writeProjectsIndex(nextProjects);
  writeActiveProjectId(id);
  saveProjectFile(id, cleanName, [], {}, '');

  return {
    projects: nextProjects,
    newProject,
    activeProjectData: {
      notes: [],
      variables: {},
      freeflowNotes: '',
    },
  };
}

export function selectProject(projectId, currentProjects) {
  const target =
    currentProjects.find((p) => p.id === projectId) || currentProjects[0];
  if (!target) {
    return initializeProjectsState();
  }
  writeActiveProjectId(target.id);
  const activeProjectData = loadProjectFile(target.id);
  return {
    activeProjectId: target.id,
    activeProjectData,
  };
}

export function deleteProject(projectId, currentProjects, currentActiveId) {
  try {
    localStorage.removeItem(getProjectFileKey(projectId));
  } catch {
    // Ignore storage removal errors
  }
  void deleteProjectFileFromOPFS(projectId);

  let nextProjects = currentProjects.filter((p) => p.id !== projectId);

  if (nextProjects.length === 0) {
    const now = Date.now();
    const defaultProject = {
      id: 'default',
      name: 'Default Project',
      fileName: toFileSlug('Default Project'),
      noteCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    nextProjects = [defaultProject];
    writeProjectsIndex(nextProjects);
    writeActiveProjectId(defaultProject.id);
    saveProjectFile(defaultProject.id, defaultProject.name, [], {}, '');

    return {
      projects: nextProjects,
      activeProjectId: defaultProject.id,
      activeProjectData: {
        notes: [],
        variables: {},
        freeflowNotes: '',
      },
    };
  }

  const activeStillExists =
    currentActiveId !== projectId &&
    nextProjects.some((p) => p.id === currentActiveId);
  const nextActiveId = activeStillExists ? currentActiveId : nextProjects[0].id;

  writeProjectsIndex(nextProjects);
  writeActiveProjectId(nextActiveId);
  const activeProjectData = loadProjectFile(nextActiveId);

  return {
    projects: nextProjects,
    activeProjectId: nextActiveId,
    activeProjectData,
  };
}
