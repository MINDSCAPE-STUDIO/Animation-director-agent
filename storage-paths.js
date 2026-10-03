const path = require('path');

const APP_DATA_DIR = path.resolve(process.env.APP_DATA_DIR || path.join(__dirname, 'data'));
const GENERATED_OUTPUT_DIR = path.resolve(
  process.env.GENERATED_OUTPUT_DIR ||
  (process.env.APP_DATA_DIR ? path.join(APP_DATA_DIR, 'generated') : path.join(__dirname, 'generated'))
);

function dataFile(name) {
  return path.join(APP_DATA_DIR, name);
}

function writeJsonAtomically(file, value) {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

module.exports = { APP_DATA_DIR, GENERATED_OUTPUT_DIR, dataFile, writeJsonAtomically };
