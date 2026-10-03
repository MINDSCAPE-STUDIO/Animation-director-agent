const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveStaticFile } = require('../static-files');

const root = path.resolve('public-root');
const generated = path.resolve('persistent-data', 'generated');

test('allows the dashboard assets and generated outputs only', () => {
  assert.equal(resolveStaticFile('/index.html', root, generated).file, path.join(root, 'index.html'));
  assert.equal(resolveStaticFile('/styles.css', root, generated).file, path.join(root, 'styles.css'));
  assert.equal(resolveStaticFile('/job-status.js', root, generated).file, path.join(root, 'job-status.js'));
  assert.equal(resolveStaticFile('/generated/scene/final.mp4', root, generated).file, path.join(generated, 'scene', 'final.mp4'));
  assert.equal(resolveStaticFile('/CLAUDE.md', root, generated), null);
  assert.equal(resolveStaticFile('/README-DEPLOY.md', root, generated), null);
  assert.equal(resolveStaticFile('/.env', root, generated), null);
});

test('rejects traversal paths for dashboard assets and generated outputs', () => {
  assert.deepEqual(resolveStaticFile('/../.env', root, generated), { error: 'bad_path' });
  assert.deepEqual(resolveStaticFile('/generated/../../.env', root, generated), { error: 'bad_path' });
  assert.deepEqual(resolveStaticFile('/generated/../.env', root, generated), { error: 'bad_path' });
});
