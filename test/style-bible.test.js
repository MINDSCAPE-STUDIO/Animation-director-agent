const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const originalDataDir = process.env.APP_DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-style-bible-'));
process.env.APP_DATA_DIR = dataDir;
const { getStyleContract, readBible, updateBible } = require('../style-bible');
const { buildGenerationContext } = require('../generation-context');

test.after(() => {
  if (originalDataDir === undefined) delete process.env.APP_DATA_DIR;
  else process.env.APP_DATA_DIR = originalDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('keeps Style Bibles isolated between projects', () => {
  updateBible('default', { visual_language: { style: 'default-project-style' } });
  updateBible('project-a', { visual_language: { style: 'project-a-style' } });

  assert.equal(readBible('default').visual_language.style, 'default-project-style');
  assert.equal(readBible('project-a').visual_language.style, 'project-a-style');
  assert.equal(readBible('project-b').project_id, 'project-b');
  assert.equal(getStyleContract('project-a').project_id, 'project-a');
});

test('uses the selected project Style Bible when preparing a generation job', () => {
  updateBible('shadow-of-innocence', { visual_language: { style: 'approved-shadow-style' } });
  const context = buildGenerationContext({ project_id: 'shadow-of-innocence' });

  assert.equal(context.styleBible.project_id, 'shadow-of-innocence');
  assert.equal(context.styleContract.visual_language.style, 'approved-shadow-style');
  assert.match(context.styleRules, /approved-shadow-style/);
});

test('migrates a legacy single-project Style Bible without losing its content', () => {
  const file = path.join(dataDir, 'style-bible.json');
  const legacy = {
    schema_version: 1,
    project_id: 'legacy-project',
    version: 4,
    visual_language: { style: 'legacy-style' },
    color_palette: ['#123456'],
  };
  fs.writeFileSync(file, JSON.stringify(legacy));

  assert.equal(readBible('legacy-project').visual_language.style, 'legacy-style');
  updateBible('new-project', { status: 'approved' });

  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(migrated.schema_version, 2);
  assert.equal(migrated.projects['legacy-project'].color_palette[0], '#123456');
  assert.equal(migrated.projects['new-project'].status, 'approved');
});
