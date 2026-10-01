const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'style-bible.json');

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

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readBible(projectId = 'default') {
  ensureStore();
  if (!fs.existsSync(FILE)) {
    const bible = { ...DEFAULT_BIBLE, project_id: projectId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    fs.writeFileSync(FILE, JSON.stringify(bible, null, 2));
    return bible;
  }
  const bible = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (projectId && bible.project_id !== projectId) return { ...DEFAULT_BIBLE, project_id: projectId };
  return bible;
}

function updateBible(projectId, patch = {}) {
  const current = readBible(projectId);
  const next = {
    ...current,
    ...patch,
    project_id: projectId,
    version: (current.version || 0) + 1,
    updated_at: new Date().toISOString(),
  };
  ensureStore();
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
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
