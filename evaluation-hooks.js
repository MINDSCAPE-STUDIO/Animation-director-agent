const { createEvaluation, getEvaluation } = require('./evaluation');

function buildEvaluationFromGeneration(generation, overrides = {}) {
  const result = generation.result || {};
  const error = generation.error || null;

  const status = overrides.status || (generation.status === 'completed' ? 'pending' : 'not_evaluated');

  return createEvaluation({
    job_id: generation.job_id,
    project_id: generation.project_id,
    shot_id: generation.shot_id,
    generation_type: generation.generation_type,
    provider: generation.provider,
    model: generation.model,
    model_version: generation.model_version,
    attempt: generation.attempt,
    status,
    scores: overrides.scores || {},
    errors: overrides.errors || [],
    notes: overrides.notes || '',
    evaluator: overrides.evaluator || 'pending',
    generation_status: generation.status,
    result,
    generation_error: error,
    evaluated_at: overrides.evaluated_at || null,
  });
}

function attachEvaluation(generation, overrides = {}) {
  const evaluation = buildEvaluationFromGeneration(generation, overrides);
  return {
    ...generation,
    evaluation_id: evaluation.evaluation_id,
    evaluation_status: evaluation.status,
    evaluation,
  };
}

module.exports = {
  buildEvaluationFromGeneration,
  attachEvaluation,
};
