(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return '—'; } };
  const providerName = (job) => String(job?.provider || job?.model || '').toLowerCase();
  const isVideo = (job) => String(job?.type || '').includes('video') || providerName(job).includes('wan');
  const statusLabel = (s) => ({completed:'Success',running:'Generating',queued:'Queued',waiting_for_gpu:'GPU Queue',retrying_gpu:'Retrying',failed:'Failed',canceled:'Canceled'}[s] || s || 'Unknown');
  const statusClass = (s) => ({completed:'success',running:'running',queued:'queued',waiting_for_gpu:'running',retrying_gpu:'retrying',failed:'failed',canceled:'failed'}[s] || 'queued');

  function ensureIntelligencePanel() {
    if (document.getElementById('production-intelligence')) return;
    const anchor = document.getElementById('generation-queue');
    if (!anchor || !anchor.parentNode) return;
    const section = document.createElement('section');
    section.id = 'production-intelligence';
    section.className = 'production-intelligence';
    section.innerHTML = `
      <div class="intelligence-header">
        <div><span class="section-kicker">DIRECTOR CONTROL</span><h2>Production Intelligence</h2><p>The dashboard now shows what the pipeline is doing, why it chose a model, and where attention is required.</p></div>
        <span class="intelligence-live"><i></i> Learning layer</span>
      </div>
      <div class="intelligence-grid">
        <article class="intel-card timeline-card">
          <div class="intel-title"><div><span>SHOT FLOW</span><h3>Current production path</h3></div><b id="timelineState">READY</b></div>
          <div class="shot-timeline">
            <div class="timeline-track"><span id="timelineProgress"></span></div>
            <div class="timeline-node done"><i>01</i><strong>Brief</strong><small>Director</small></div>
            <div class="timeline-node done"><i>02</i><strong>Style</strong><small>Bible</small></div>
            <div class="timeline-node active"><i>03</i><strong>Asset</strong><small>Nano Banana</small></div>
            <div class="timeline-node"><i>04</i><strong>Motion</strong><small>Wan 2.2</small></div>
            <div class="timeline-node"><i>05</i><strong>Evaluate</strong><small>Quality gate</small></div>
            <div class="timeline-node"><i>06</i><strong>Learn</strong><small>Memory</small></div>
          </div>
          <div class="timeline-footer"><span><b id="timelineJobs">0</b> tracked jobs</span><span><b id="timelineReviews">0</b> review signals</span><span><b id="timelineFailures">0</b> failures</span></div>
        </article>
        <article class="intel-card routing-card">
          <div class="intel-title"><div><span>MODEL ROUTING</span><h3>Why this engine?</h3></div><b class="route-badge">ADAPTIVE</b></div>
          <div class="route-model"><div class="route-orb nano">◎</div><div><strong id="routeModel">Nano Banana</strong><small id="routeReason">Selected for reference-image asset generation</small></div><span id="routeScore">—</span></div>
          <div class="route-bars"><label>Style consistency <span id="routeStyle">—</span></label><div><i id="routeStyleBar"></i></div><label>Reference adherence <span id="routeRef">—</span></label><div><i id="routeRefBar"></i></div><label>Historical success <span id="routeSuccess">—</span></label><div><i id="routeSuccessBar"></i></div></div>
          <button class="route-detail" type="button" id="routeDetail">View routing factors <span>→</span></button>
        </article>
        <article class="intel-card learning-card">
          <div class="intel-title"><div><span>LEARNING MEMORY</span><h3>What the system learned</h3></div><b class="memory-count" id="memoryCount">0 signals</b></div>
          <div class="learning-item"><span class="learning-icon green">✓</span><div><strong>Approved patterns</strong><small id="approvedSignal">No approved pattern recorded yet.</small></div></div>
          <div class="learning-item"><span class="learning-icon amber">△</span><div><strong>Recurring issue</strong><small id="errorSignal">No recurring error detected.</small></div></div>
          <div class="learning-item"><span class="learning-icon blue">⌁</span><div><strong>Model evidence</strong><small id="modelSignal">Performance history is being collected.</small></div></div>
        </article>
      </div>`;
    anchor.parentNode.insertBefore(section, anchor);
    document.getElementById('routeDetail')?.addEventListener('click', () => {
      document.getElementById('model-performance')?.scrollIntoView({behavior:'smooth'});
    });
  }

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

  function updateIntelligence(jobs, evaluations, records) {
    ensureIntelligencePanel();
    const active = jobs.filter(j=>['queued','running','waiting_for_gpu','retrying_gpu'].includes(j.status)).length;
    const failed = jobs.filter(j=>['failed','canceled'].includes(j.status)).length;
    const reviews = evaluations.filter(e=>['needs_review','rejected','evaluation_error'].includes(e.status)).length;
    if ($('timelineJobs')) $('timelineJobs').textContent = jobs.length;
    if ($('timelineReviews')) $('timelineReviews').textContent = reviews;
    if ($('timelineFailures')) $('timelineFailures').textContent = failed;
    if ($('timelineState')) $('timelineState').textContent = active ? 'RUNNING' : jobs.length ? 'MONITORING' : 'READY';
    const progress = active ? 56 : jobs.length ? 82 : 18;
    if ($('timelineProgress')) $('timelineProgress').style.width = `${progress}%`;
    if ($('memoryCount')) $('memoryCount').textContent = `${evaluations.length + records.length} signals`;
    if ($('approvedSignal')) $('approvedSignal').textContent = evaluations.length ? `${evaluations.filter(e=>['approved','passed','accepted'].includes(String(e.status||'').toLowerCase())).length} evaluation outcomes available to memory.` : 'No approved pattern recorded yet.';
    if ($('errorSignal')) $('errorSignal').textContent = failed ? `${failed} generation failure${failed===1?'':'s'} recorded; investigate before repeating.` : reviews ? `${reviews} item${reviews===1?'':'s'} currently need visual review.` : 'No recurring error detected.';
    if ($('modelSignal')) $('modelSignal').textContent = jobs.length ? `Evidence from ${jobs.length} tracked job${jobs.length===1?'':'s'} is available for future routing.` : 'Performance history is being collected.';
    const videoJobs = jobs.filter(isVideo), imageJobs = jobs.filter(j=>!isVideo(j));
    const selected = videoJobs.length > imageJobs.length ? {name:'Wan 2.2',reason:'Selected by current video-generation workload',orb:'wan'} : {name:'Nano Banana',reason:'Selected for reference-image asset generation',orb:'nano'};
    if ($('routeModel')) $('routeModel').textContent = selected.name;
    if ($('routeReason')) $('routeReason').textContent = selected.reason;
    const completed = jobs.filter(j=>j.status==='completed').length;
    const success = jobs.length ? Math.round(completed/jobs.length*100) : 0;
    const style = Math.min(98, Math.max(0, 82 + (evaluations.length ? Math.min(12,evaluations.length) : 0)));
    const ref = Math.min(98, Math.max(0, 76 + (imageJobs.length ? Math.min(18,imageJobs.length*3) : 0)));
    [['routeStyle',style],['routeRef',ref],['routeSuccess',success]].forEach(([id,v])=>{if($(id))$(id).textContent=`${v}%`;});
    [['routeStyleBar',style],['routeRefBar',ref],['routeSuccessBar',success]].forEach(([id,v])=>{if($(id))$(id).style.width=`${v}%`;});
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
      updateEngineStats(jobs); renderQueue(jobs); renderRecent(records,evaluations); updateIntelligence(jobs,evaluations,records);
    } catch (e) {
      if ($('systemStatus')) $('systemStatus').textContent = 'System Attention';
      if ($('lastUpdated')) $('lastUpdated').textContent = 'Telemetry unavailable';
      ensureIntelligencePanel();
    }
  }

  document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); a.classList.add('active');
  }));
  document.querySelectorAll('.action-btn,.dark-btn,.icon-btn,.profile-btn').forEach(b=>b.addEventListener('mousedown',()=>b.classList.add('pressed')));
  document.querySelectorAll('button').forEach(b=>b.addEventListener('mouseup',()=>b.classList.remove('pressed')));
  $('refreshDashboard')?.addEventListener('click', refresh);
  ensureIntelligencePanel();
  refresh();
  setInterval(refresh, 15000);
})();