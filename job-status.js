(function registerJobStatus(global) {
  function classifySubmissionError(error) {
    const message = String(error?.message || error || '');
    const status = Number(error?.status || error?.statusCode);
    if (status === 401 || /unauthorized|access_token_required|access token/i.test(message)) {
      return { label: 'Access required', message };
    }
    if (status === 400 || /unsupported generation|non-empty prompt|enter a shot direction|reference image first|under 12 mb|unsupported image format|could not read the selected image/i.test(message)) {
      return { label: 'Request needs correction', message };
    }
    if (/not configured|credentials? (?:is|are) required|setup needed/i.test(message)) {
      return { label: 'Setup needed', message };
    }
    return { label: 'Submission failed', message: message || 'The request could not be submitted.' };
  }

  function pollingFailure(error, consecutiveFailures) {
    const status = Number(error?.status || error?.statusCode);
    const message = String(error?.message || error || 'Unknown status error');
    if (status === 401) return { label: 'Access required', message: `Job status check was unauthorized: ${message}` };
    if (status === 404) return { label: 'Job not found', message: `The server could not find this job: ${message}` };
    if (consecutiveFailures >= 3) {
      return { label: 'Status unavailable', message: `Could not check job status after ${consecutiveFailures} attempts: ${message}. The job may still be running; check the generation queue.` };
    }
    return null;
  }

  function pollingTimeoutMessage(minutes = 7.5) {
    return `No final status arrived within ${minutes} minutes. The job may still be active on the server; check the generation queue for updates.`;
  }

  function terminalSuccessRate(jobs) {
    const outcomes = jobs.filter(job => ['completed', 'failed', 'canceled'].includes(job.status));
    if (!outcomes.length) return null;
    const completed = outcomes.filter(job => job.status === 'completed').length;
    return Math.round(completed / outcomes.length * 1000) / 10;
  }

  const api = { classifySubmissionError, pollingFailure, pollingTimeoutMessage, terminalSuccessRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.MindscapeJobStatus = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
