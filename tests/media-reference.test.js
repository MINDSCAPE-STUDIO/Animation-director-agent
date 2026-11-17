const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'media-reference-test-'));
process.env.PERSISTENT_STORAGE_DIR = STORAGE_DIR;

const { safeLocalFile } = require('../media-reference');
const { GENERATED_DIR } = require('../storage-paths');
const { outputReference } = require('../gemini-visual-provider');

fs.mkdirSync(GENERATED_DIR, { recursive: true });
const generatedFile = path.join(GENERATED_DIR, 'sample.png');
fs.writeFileSync(generatedFile, 'x');

test('generated media resolves inside the configured storage directory', () => {
  assert.equal(safeLocalFile('/generated/sample.png'), generatedFile);
});

test('absolute paths outside service directories are rejected', () => {
  const secret = path.join(STORAGE_DIR, 'secret.txt');
  fs.writeFileSync(secret, 'x');
  assert.equal(safeLocalFile(secret), null);
  assert.equal(safeLocalFile('/etc/passwd'), null);
});

test('traversal out of the generated directory is rejected', () => {
  assert.equal(safeLocalFile('/generated/../secret.txt'), null);
});

test('only dedicated upload temp files are accepted', () => {
  const upload = path.join(os.tmpdir(), `mindscape-ref-${Date.now()}.png`);
  const unrelated = path.join(os.tmpdir(), `unrelated-${Date.now()}.png`);
  fs.writeFileSync(upload, 'x');
  fs.writeFileSync(unrelated, 'x');
  assert.equal(safeLocalFile(upload), upload);
  assert.equal(safeLocalFile(unrelated), null);
  fs.unlinkSync(upload);
  fs.unlinkSync(unrelated);
});

test('evaluator resolves generated output through storage-paths', () => {
  assert.equal(outputReference({ result: { output: '/generated/sample.png' } }), generatedFile);
});
