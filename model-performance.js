const fs = require('fs');
const path = require('path');
const { APP_DATA_DIR } = require('./storage-paths');

const DATA_DIR = APP_DATA_DIR;
const FILE = path.join(DATA_DIR, 'model-performance.jsonl');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '', 'utf8');
}

function recordEvaluation(evaluation) {
  ensureStore();
  const record = {
    recorded_at: new Date().toISOString(),
    provider: evaluation.provider || 'unknown',
    model: evaluation.model || 'unknown',
    model_version: evaluation.model_version || null,
    generation_type: evaluation.generation_type || null,
    status: evaluation.status || 'unknown',
    scores: evaluation.scores || {},
    errors: evaluation.errors || [],
  };
  fs.appendFileSync(FILE, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

function readPerformance() {
  ensureStore();
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function summarizePerformance() {
  const records = readPerformance();
  const groups = new Map();

  for (const record of records) {
    const key = `${record.provider}:${record.model}:${record.generation_type || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, { provider: record.provider, model: record.model, generation_type: record.generation_type, attempts: 0, completed: 0, failed: 0, scores: {}, errors: {} });
    const group = groups.get(key);
    group.attempts += 1;
    if (record.status === 'approved' || record.status === 'completed') group.completed += 1;
    if (record.status === 'failed' || record.status === 'rejected') group.failed += 1;
    for (const [name, value] of Object.entries(record.scores || {})) {
      if (typeof value !== 'number') continue;
      group.scores[name] ||= { total: 0, count: 0 };
      group.scores[name].total += value;
      group.scores[name].count += 1;
    }
    for (const error of record.errors || []) {
      const code = error.code || 'unknown_error';
      group.errors[code] = (group.errors[code] || 0) + 1;
    }
  }

  return [...groups.values()].map(group => ({
    ...group,
    scores: Object.fromEntries(Object.entries(group.scores).map(([name, value]) => [name, Number((value.total / value.count).toFixed(2))])),
  }));
}

module.exports = { recordEvaluation, readPerformance, summarizePerformance };
