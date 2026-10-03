const fs = require('fs');
const { dataFile, writeJsonAtomically } = require('./storage-paths');

const DEFAULT_QUEUE_FILE = process.env.GENERATION_QUEUE_FILE || dataFile('generation-queue.json');

function readJobs(file = DEFAULT_QUEUE_FILE) {
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value) || value.some(job => !job || typeof job.id !== 'string')) {
    throw new Error(`Generation queue store has an invalid format: ${file}`);
  }
  return value;
}

function writeJobs(jobs, file = DEFAULT_QUEUE_FILE) {
  writeJsonAtomically(file, jobs);
}

function toPersistedJob(job) {
  const copy = { ...job, input: { ...(job.input || {}) } };
  delete copy.input.imageData;
  const omitInlineImages = value => {
    if (typeof value === 'string' && value.startsWith('data:image/')) return '[omitted-image-data]';
    if (Array.isArray(value)) return value.map(omitInlineImages);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, omitInlineImages(item)]));
    return value;
  };
  copy.input = omitInlineImages(copy.input);
  return copy;
}

module.exports = { DEFAULT_QUEUE_FILE, readJobs, writeJobs, toPersistedJob };
