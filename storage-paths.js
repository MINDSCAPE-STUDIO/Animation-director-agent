const path = require('path');

function hasPath(env, key) {
  return typeof env[key] === 'string' && env[key].trim().length > 0;
}
function getStorageRoot(env = process.env) {
  return hasPath(env, 'PERSISTENT_STORAGE_DIR')
    ? path.resolve(env.PERSISTENT_STORAGE_DIR)
    : __dirname;
}
function getGeneratedDir(env = process.env) {
  return hasPath(env, 'PERSISTENT_STORAGE_DIR')
    ? path.join(path.resolve(env.PERSISTENT_STORAGE_DIR), 'generated')
    : path.join(__dirname, 'generated');
}
function getDataDir(env = process.env) {
  return hasPath(env, 'PERSISTENT_STORAGE_DIR')
    ? path.join(path.resolve(env.PERSISTENT_STORAGE_DIR), 'data')
    : path.join(__dirname, 'data');
}
function getHistoryFile(env = process.env) {
  return hasPath(env, 'GENERATION_HISTORY_FILE')
    ? path.resolve(env.GENERATION_HISTORY_FILE)
    : path.join(getGeneratedDir(env), 'generation-history.jsonl');
}
function getEvaluationFile(env = process.env) {
  return hasPath(env, 'EVALUATION_STORE_FILE')
    ? path.resolve(env.EVALUATION_STORE_FILE)
    : path.join(getDataDir(env), 'evaluations.jsonl');
}
function getStyleBibleFile(env = process.env) {
  return hasPath(env, 'STYLE_BIBLE_FILE')
    ? path.resolve(env.STYLE_BIBLE_FILE)
    : path.join(getDataDir(env), 'style-bible.json');
}
function getMasterAssetsFile(env = process.env) {
  return hasPath(env, 'MASTER_ASSETS_FILE')
    ? path.resolve(env.MASTER_ASSETS_FILE)
    : path.join(getDataDir(env), 'master-assets.json');
}
const GENERATED_DIR = getGeneratedDir();
const DATA_DIR = getDataDir();
const HISTORY_FILE = getHistoryFile();
const EVALUATIONS_FILE = getEvaluationFile();
const STYLE_BIBLE_FILE = getStyleBibleFile();
const MASTER_ASSETS_FILE = getMasterAssetsFile();

module.exports = {
  GENERATED_DIR, DATA_DIR, HISTORY_FILE, EVALUATIONS_FILE, STYLE_BIBLE_FILE, MASTER_ASSETS_FILE,
  getStorageRoot, getGeneratedDir, getDataDir, getHistoryFile, getEvaluationFile, getStyleBibleFile, getMasterAssetsFile
};
