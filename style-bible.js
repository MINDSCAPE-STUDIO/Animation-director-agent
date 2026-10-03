const fs = require('fs');
const path = require('path');
const { APP_DATA_DIR, writeJsonAtomically } = require('./storage-paths');

const FILE = path.join(APP_DATA_DIR, 'style-bible.json');

const DEFAULT_BIBLE = {
  schema_version: 1,
  project_id: 'default',
  status: 'draft',
  version: 1,
  visual_language: {
    medium: 'vector',
    style: 'anime-inspired',
    line_treatment: 'clean controlled lines',
    shading: 'soft cel shading',
    texture: 'minimal',
    rendering: 'flat controlled palette with soft depth',
  },
  composition: {},
  lighting: {},
  color_palette: [],
  character_rules: {},
  environment_rules: {},
  motion_rules: {},
  camera_rules: {},
  preservation_rules: [
    'Do not redesign approved characters without explicit approval.',
    'Do not change approved color palette without explicit approval.',
    'Do not introduce a new rendering style into an approved asset.',
    'Treat approved master assets as the source of truth for identity and design.',
  ],
  forbidden_drift: [],
  created_at: null,
  updated_at: null,
};

function readProjects() {
  if (!fs.existsSync(FILE)) return new Map();
  const stored = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (stored && stored.schema_version === 2 && stored.projects && typeof stored.projects === 'object' && !Array.isArray(stored.projects)) {
    return new Map(Object.entries(stored.projects));
  }
  // Migrate the original one-project document in memory. The next update writes
  // the versioned multi-project envelope without discarding its contents.
  if (stored && typeof stored.project_id === 'string') return new Map([[stored.project_id, stored]]);
  throw new Error(`Style Bible store has an invalid format: ${FILE}`);
}

function writeProjects(projects) {
  writeJsonAtomically(FILE, { schema_version: 2, projects: Object.fromEntries(projects) });
}

function readBible(projectId = 'default') {
  const id = projectId || 'default';
  const bible = readProjects().get(id);
  return bible ? { ...bible } : { ...DEFAULT_BIBLE, project_id: id };
}

function updateBible(projectId, patch = {}) {
  const id = projectId || 'default';
  const projects = readProjects();
  const current = projects.get(id) || { ...DEFAULT_BIBLE, project_id: id };
  const next = {
    ...current,
    ...patch,
    project_id: id,
    version: (current.version || 0) + 1,
    created_at: current.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  projects.set(id, next);
  writeProjects(projects);
  return next;
}

function getStyleContract(projectId = 'default') {
  const bible = readBible(projectId);
  return {
    project_id: bible.project_id,
    version: bible.version,
    visual_language: bible.visual_language,
    color_palette: bible.color_palette,
    character_rules: bible.character_rules,
    environment_rules: bible.environment_rules,
    motion_rules: bible.motion_rules,
    camera_rules: bible.camera_rules,
    preservation_rules: bible.preservation_rules,
    forbidden_drift: bible.forbidden_drift,
  };
}

module.exports = { readBible, updateBible, getStyleContract };
