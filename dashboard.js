(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return '—'; } };
  const providerName = (job) => String(job?.provider || job?.model || '').toLowerCase();
  const isVideo = (job) => String(job?.type || '').includes('video') || providerName(job).includes('wan');
  const statusLabel = (s) => ({completed:'Success',running:'Generating',queued:'Queued',waiting_for_gpu:'GPU Queue',retrying_gpu:'Retrying',failed:'Failed',canceled:'Canceled'}[s] || s || 'Unknown');
  const statusClass = (s) => ({completed:'success',running:'running',queued:'queued',waiting_for_gpu:'running',retrying_gpu:'retrying',failed:'failed',canceled:'failed'}[s] || 'queued');

  function renderQueue(jobs) {
    const rows = $('queueRows');
    if (!rows) return;
    const active = jobs.filter(j => ['queued','running','waiting_for_gpu','retrying_gpu'].includes(j.status)).length;
    if ($('queueActiveCount')) $('queueActiveCount').textContent = active;
    if ($('navQueueCount')) $('navQueueCount').textContent = active;
    if (!jobs.length) { rows.innerHTML = '<tr><td colspan="9" class="empty-state">No jobs in the queue.</td></tr>'; return; }
    rows.innerHTML = jobs.slice(0, 12).map((j, i) => {
      const video = isVideo(j), engine = video ? 'Wan 2.2' : 'Nano Banana';
      const progress = j.status === 'completed' ? 100 : j.status === 'failed' || j.status === 'canceled' ? 0 : (j.progress ?? (j.status === 'running' ? 58 : 8));
      const type = video ? 'Video' : 'Image';
      return `<tr><td>${i+1}</td><td><span class="type-pill ${video?'video':'image'}">${type}</span></td><td>Shadow of Innocence</td><td>${esc(j.shot_id || j.shot?.shot_id || j.input?.shot_id || '—')}</td><td><span class="engine-mini">● ${engine}</span></td><td><span class="status-pill ${statusClass(j.status)}">${statusLabel(j.status)}</span></td><td><div class="progress-cell"><span><i style="width:${progress}%"></i></span><b>${progress}%</b></div></td><td>${fmtTime(j.createdAt || j.created_at || j.created)}</td><td><button class="row-menu" title="Job details">•••</button></td></tr>`;
    }).join('');
  }

  function renderRecent(records, evaluations) {
    const el = $('recentActivity'); if (!el) return;
    const items = [];
    (records || []).slice(0, 5).forEach(r => items.push({kind: r.status === 'failed' ? 'fail' : 'success', title: r.event || (r.status === 'completed' ? 'Generation completed' : 'Generation event'), sub: r.model || r.provider || r.job_id || 'generation', time: r.timestamp || r.createdAt}));
    (evaluations || []).slice(0, 3).forEach(e => items.push({kind:'review', title:'Evaluation flagged for review', sub:e.job_id || e.generation_id || 'evaluation', time:e.createdAt || e.timestamp}));
    items.sort((a,b) => new Date(b.time || 0) - new Date(a.time || 0));
    el.innerHTML = items.slice(0,6).map(x => `<div class="activity-item"><span class="activity-icon ${x.kind}">${x.kind==='fail'?'△':x.kind==='review'?'▶':'▧'}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.sub)}</small></div><time>${esc(fmtTime(x.time))}</time><em class="activity-tag ${x.kind}">${x.kind==='fail'?'Retrying':x.kind==='review'?'Needs Review':'Success'}</em></div>`).join('') || '<div class="empty-state">No generation activity recorded yet.</div>';
  }

  function updateEngineStats(jobs) {
    const groups = {nano: jobs.filter(j => !isVideo(j)), wan: jobs.filter(isVideo)};
    [['nano',groups.nano],['wan',groups.wan]].forEach(([key,list]) => {
      const total = list.length, done = list.filter(j=>j.status==='completed').length, success = total ? Math.round(done/total*1000)/10 : null;
      const latencyValues = list.map(j=>Number(j.duration_ms || j.latency_ms || j.latency || 0)).filter(Boolean);
      const latency = latencyValues.length ? (latencyValues.reduce((a,b)=>a+b,0)/latencyValues.length/1000).toFixed(1)+'s' : '—';
      if ($(`${key}Jobs`)) $(`${key}Jobs`).textContent = total || '0';
      if ($(`${key}Success`)) $(`${key}Success`).textContent = success == null ? '—' : `${success}%`;
      if ($(`${key}Latency`)) $(`${key}Latency`).textContent = latency;
    });
  }

  async function refresh() {
    try {
      const [jobsR,histR,evalR,healthR] = await Promise.all([fetch('/jobs'),fetch('/generation-history?limit=30'),fetch('/evaluations?limit=20'),fetch('/health')]);
      const jobsD = await jobsR.json(), histD = await histR.json(), evalD = await evalR.json(), health = healthR.ok ? await healthR.json() : null;
      const jobs = jobsD.jobs || [], records = histD.records || [], evaluations = evalD.evaluations || [];
      const active = jobs.filter(j=>['queued','running','waiting_for_gpu','retrying_gpu'].includes(j.status)).length;
      const completed = jobs.filter(j=>j.status==='completed').length;
      const failed = jobs.filter(j=>['failed','canceled'].includes(j.status)).length;
      const review = evaluations.filter(e=>['needs_review','rejected','evaluation_error'].includes(e.status)).length;
      if ($('metricActive')) $('metricActive').textContent = active;
      if ($('metricCompleted')) $('metricCompleted').textContent = completed;
      if ($('metricFailed')) $('metricFailed').textContent = failed;
      if ($('metricReview')) $('metricReview').textContent = review;
      if ($('systemStatus')) $('systemStatus').textContent = health?.ok ? 'System Online' : 'System Attention';
      if ($('lastUpdated')) $('lastUpdated').textContent = `Last updated: ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
      if ($('healthPercent')) $('healthPercent').textContent = health?.ok ? '98%' : '—';
      ['healthApi','healthQueue','healthState','healthModels','healthStorage'].forEach(id=>{ if ($(id)) $(id).textContent = health?.ok ? 'Online' : 'Attention'; });
      updateEngineStats(jobs); renderQueue(jobs); renderRecent(records,evaluations);
    } catch (e) {
      if ($('systemStatus')) $('systemStatus').textContent = 'System Attention';
      if ($('lastUpdated')) $('lastUpdated').textContent = 'Telemetry unavailable';
    }
  }

  document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); a.classList.add('active');
  }));
  document.querySelectorAll('.action-btn,.dark-btn,.icon-btn,.profile-btn').forEach(b=>b.addEventListener('mousedown',()=>b.classList.add('pressed')));
  document.querySelectorAll('button').forEach(b=>b.addEventListener('mouseup',()=>b.classList.remove('pressed')));
  $('refreshDashboard')?.addEventListener('click', refresh);
  refresh();
  setInterval(refresh, 15000);
})();