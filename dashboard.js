(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return '—'; } };
  const providerName = (job) => String(job?.provider || job?.model || '').toLowerCase();
  const isVideo = (job) => String(job?.type || '').includes('video') || providerName(job).includes('wan');
  const statusLabel = (s) => ({completed:'Success',running:'Generating',queued:'Queued',waiting_for_gpu:'GPU Queue',retrying_gpu:'Retrying',failed:'Failed',canceled:'Canceled'}[s] || s || 'Unknown');
  const statusClass = (s) => ({completed:'success',running:'running',queued:'queued',waiting_for_gpu:'running',retrying_gpu:'retrying',failed:'failed',canceled:'failed'}[s] || 'queued');
  function updateEngineStats(jobs) {
    const groups = { nano: jobs.filter(job => !isVideo(job)), wan: jobs.filter(isVideo) };
    [['nano', groups.nano], ['wan', groups.wan]].forEach(([key, list]) => {
      const outcomes = list.filter(job => ['completed', 'failed', 'canceled'].includes(job.status));
      const completed = outcomes.filter(job => job.status === 'completed').length;
      const success = outcomes.length ? Math.round(completed / outcomes.length * 1000) / 10 : null;
      const latencyValues = list.map(job => Number(job.duration_ms || job.latency_ms || job.latency || 0)).filter(Boolean);
      const latency = latencyValues.length ? (latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length / 1000).toFixed(1) + 's' : '—';
      if ($(key + 'Jobs')) $(key + 'Jobs').textContent = list.length;
      if ($(key + 'Success')) $(key + 'Success').textContent = success === null ? '—' : success + '%';
      if ($(key + 'Latency')) $(key + 'Latency').textContent = latency;
    });
  }
  function ensureIntelligenceStyles() {
    if (document.getElementById('mindscape-intelligence-styles')) return;
    const style = document.createElement('style'); style.id = 'mindscape-intelligence-styles';
    style.textContent = `.production-intelligence{padding:0 28px 28px;scroll-margin-top:84px}.intelligence-header{display:flex;justify-content:space-between;align-items:flex-end;margin:0 0 13px}.intelligence-header h2{font-size:19px;letter-spacing:-.035em;margin:4px 0}.intelligence-header p{font-size:9px;color:#687b96;margin:0;max-width:650px}.intelligence-live{font-size:8px;color:#75dcb6;border:1px solid rgba(64,205,163,.18);background:rgba(24,88,68,.1);padding:7px 10px;border-radius:99px}.intelligence-live i{display:inline-block;width:5px;height:5px;background:#39e3a8;border-radius:50%;margin-right:5px;box-shadow:0 0 9px #39e3a8;animation:mindPulse 1.5s infinite}.intelligence-grid{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:12px}.intel-card{border:1px solid #1b3049;border-radius:15px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,14,25,.97));padding:16px;box-shadow:0 15px 45px rgba(0,0,0,.14),inset 0 1px rgba(255,255,255,.035);overflow:hidden;transition:transform .25s,border-color .25s}.intel-card:hover{transform:translateY(-2px);border-color:#294764}.intel-title{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}.intel-title span{font-size:7px;letter-spacing:.18em;color:#7089aa;font-weight:800}.intel-title h3{font-size:12px;margin:4px 0 0}.intel-title>b{font-size:7px;color:#71849e}.route-badge{color:#6ebdff!important;border:1px solid #21466e;border-radius:99px;padding:4px 7px;background:#0c2037}.memory-count{color:#9c85df!important}.shot-timeline{height:102px;position:relative;display:flex;justify-content:space-between;padding-top:5px}.timeline-track{position:absolute;left:8%;right:8%;top:22px;height:2px;background:#172b43;overflow:hidden}.timeline-track:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#3b8cff,#3bdcb1);opacity:.16}.timeline-track>span{display:block;height:100%;background:linear-gradient(90deg,#4d8cff,#37dfb0);box-shadow:0 0 12px rgba(62,144,255,.55);width:0;transition:width 1.2s cubic-bezier(.2,.8,.2,1)}.timeline-node{width:16%;position:relative;text-align:center;z-index:1}.timeline-node i{display:grid;place-items:center;width:27px;height:27px;margin:0 auto 10px;border-radius:50%;font-style:normal;font-size:7px;background:#0b1829;border:1px solid #263c58;color:#71849d;transition:.3s}.timeline-node strong{display:block;font-size:7px;color:#7b8da7}.timeline-node small{display:block;font-size:6px;color:#53667f;margin-top:3px}.timeline-node.done i{border-color:#2f8e70;background:#10362e;color:#4de1af;box-shadow:0 0 15px rgba(52,226,174,.13)}.timeline-node.active i{border-color:#3b84d8;background:#11345b;color:#68bfff;box-shadow:0 0 19px rgba(60,147,255,.28);animation:mindNodePulse 2s infinite}.timeline-footer{display:flex;justify-content:space-between;border-top:1px solid #16273c;padding-top:11px;color:#61748e;font-size:7px}.timeline-footer b{color:#dbe5f2;font-size:9px;margin-right:3px}.route-model{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #1b314b;background:#0a1626;border-radius:10px}.route-orb{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:16px}.route-orb.nano{background:linear-gradient(145deg,#193f73,#493c78);color:#76b7ff}.route-model strong{display:block;font-size:10px}.route-model small{display:block;color:#657994;font-size:7px;margin-top:3px;max-width:160px;line-height:1.4}.route-model>span{margin-left:auto;font-size:9px;color:#54dfb0}.route-bars{display:grid;gap:5px;margin-top:13px}.route-bars label{display:flex;justify-content:space-between;color:#74859d;font-size:7px}.route-bars label span{color:#cbd7e7}.route-bars>div{height:4px;background:#16283d;border-radius:99px;overflow:hidden;margin-bottom:3px}.route-bars i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#397eff,#46dcae);transition:width 1s ease;box-shadow:0 0 8px rgba(54,153,255,.25)}.route-detail{width:100%;margin-top:10px;border:0;border-top:1px solid #18293e;padding:10px 0 0;background:transparent;color:#7ea4d4;text-align:left;font-size:7px;cursor:pointer}.route-detail span{float:right}.learning-item{display:flex;gap:9px;padding:9px 0;border-bottom:1px solid #16273c}.learning-item:last-child{border-bottom:0}.learning-icon{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;font-size:9px;flex:0 0 auto}.learning-icon.green{background:#0d342a;color:#44dda9}.learning-icon.amber{background:#413016;color:#ffc04e}.learning-icon.blue{background:#102f50;color:#55baff}.learning-item strong{display:block;font-size:8px}.learning-item small{display:block;color:#657892;font-size:7px;line-height:1.45;margin-top:3px}@keyframes mindPulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes mindNodePulse{0%,100%{box-shadow:0 0 0 rgba(60,147,255,0),0 0 0 rgba(60,147,255,0)}50%{box-shadow:0 0 0 4px rgba(60,147,255,.08),0 0 20px rgba(60,147,255,.28)}}@media(max-width:1180px){.intelligence-grid{grid-template-columns:1fr 1fr}.timeline-card{grid-column:1 / span 2}}@media(max-width:860px){.intelligence-grid{grid-template-columns:1fr}.timeline-card{grid-column:auto}}@media(max-width:640px){.production-intelligence{padding:0 10px 16px}.intelligence-header{align-items:flex-start;gap:12px}.intelligence-header p{max-width:none}.intelligence-live{display:none}.intel-card{padding:13px}.shot-timeline{height:108px;overflow:hidden}.timeline-node strong{font-size:6px}.timeline-node small{font-size:5px}.timeline-footer{gap:7px}.route-model small{max-width:130px}}@media(prefers-reduced-motion:reduce){#production-intelligence *,#production-intelligence *:before,#production-intelligence *:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
    document.head.appendChild(style);
  }

  function ensureIntelligencePanel() {
    ensureIntelligenceStyles();
    if (document.getElementById('production-intelligence')) return;
    const anchor = document.getElementById('generation-queue');
    if (!anchor || !anchor.parentNode) return;
    const section = document.createElement('section'); section.id = 'production-intelligence'; section.className = 'production-intelligence';
    section.innerHTML = `<div class="intelligence-header"><div><span class="section-kicker">DIRECTOR CONTROL</span><h2>Production Intelligence</h2><p>The dashboard shows which configured route ran, what evaluations recorded, and where attention is needed.</p></div><span class="intelligence-live"><i></i> Evidence tracked</span></div><div class="intelligence-grid"><article class="intel-card timeline-card"><div class="intel-title"><div><span>SHOT FLOW</span><h3>Current production path</h3></div><b id="timelineState">READY</b></div><div class="shot-timeline"><div class="timeline-track"><span id="timelineProgress"></span></div><div class="timeline-node"><i>01</i><strong>Brief</strong><small>Director</small></div><div class="timeline-node"><i>02</i><strong>Style</strong><small>Bible</small></div><div class="timeline-node"><i>03</i><strong>Asset</strong><small>Image route</small></div><div class="timeline-node"><i>04</i><strong>Motion</strong><small>Video route</small></div><div class="timeline-node"><i>05</i><strong>Evaluate</strong><small>Quality gate</small></div><div class="timeline-node"><i>06</i><strong>History</strong><small>Records</small></div></div><div class="timeline-footer"><span><b id="timelineJobs">0</b> tracked jobs</span><span><b id="timelineReviews">0</b> review signals</span><span><b id="timelineFailures">0</b> failures</span></div></article><article class="intel-card routing-card"><div class="intel-title"><div><span>MODEL ROUTING</span><h3>Last used route</h3></div><b class="route-badge" id="routeBadge">CONFIGURED</b></div><div class="route-model"><div class="route-orb nano">◎</div><div><strong id="routeModel">Awaiting job</strong><small id="routeReason">Configured route; provider availability has not been checked.</small></div><span id="routeScore">—</span></div><div class="route-bars"><label>Style consistency <span id="routeStyle">—</span></label><div><i id="routeStyleBar"></i></div><label>Prompt adherence <span id="routeRef">—</span></label><div><i id="routeRefBar"></i></div><label>Recent success rate <span id="routeSuccess">—</span></label><div><i id="routeSuccessBar"></i></div></div><p class="route-detail">Provider selection follows server configuration.</p></article><article class="intel-card learning-card"><div class="intel-title"><div><span>EVIDENCE MEMORY</span><h3>Recorded evidence</h3></div><b class="memory-count" id="memoryCount">0 signals</b></div><div class="learning-item"><span class="learning-icon green">✓</span><div><strong>Approved evaluations</strong><small id="approvedSignal">No approved pattern recorded yet.</small></div></div><div class="learning-item"><span class="learning-icon amber">△</span><div><strong>Recent attention</strong><small id="errorSignal">No flagged items in this snapshot.</small></div></div><div class="learning-item"><span class="learning-icon blue">⌁</span><div><strong>Model evidence</strong><small id="modelSignal">Generation evidence will appear here after the first job.</small></div></div></article></div>`;
    anchor.parentNode.insertBefore(section, anchor);
    document.getElementById('routeDetail')?.addEventListener('click', () => document.getElementById('model-performance')?.scrollIntoView({behavior:'smooth'}));
  }

  function renderQueue(jobs) {
    const rows = $('queueRows');
    if (!rows) return;
    const active = jobs.filter(job => ['queued', 'running', 'waiting_for_gpu', 'retrying_gpu'].includes(job.status)).length;
    if ($('queueActiveCount')) $('queueActiveCount').textContent = active;
    if ($('navQueueCount')) $('navQueueCount').textContent = active;
    if (!jobs.length) {
      rows.innerHTML = '<tr><td colspan="9" class="empty-state">No jobs in the queue.</td></tr>';
      return;
    }
    rows.innerHTML = jobs.slice(0, 12).map((job, index) => {
      const video = isVideo(job);
      const progressValue = typeof job.progress === 'number' ? job.progress : Number.NaN;
      const progress = job.status === 'completed' ? 100
        : ['failed', 'canceled'].includes(job.status) ? 0
          : Number.isFinite(progressValue) && progressValue >= 0 && progressValue <= 100 ? progressValue : null;
      const project = job.project_name || job.project_id || job.projectId || 'default';
      const engine = job.model || job.provider || 'Unknown';
      const progressText = progress === null ? '—' : Math.round(progress) + '%';
      return '<tr><td>' + (index + 1) + '</td><td><span class="type-pill ' + (video ? 'video' : 'image') + '">' + (video ? 'Video' : 'Image') + '</span></td><td>' + esc(project) + '</td><td>' + esc(job.shot_id || job.shot?.shot_id || job.input?.shot_id || '—') + '</td><td><span class="engine-mini">● ' + esc(engine) + '</span></td><td><span class="status-pill ' + statusClass(job.status) + '">' + statusLabel(job.status) + '</span></td><td><div class="progress-cell"><span><i style="width:' + (progress === null ? 0 : progress) + '%"></i></span><b>' + progressText + '</b></div></td><td>' + fmtTime(job.createdAt || job.created_at || job.created) + '</td><td><button class="row-menu" title="Job details">•••</button></td></tr>';
    }).join('');
  }

  function renderRecent(records, evaluations) {
    const el = $('recentActivity');
    if (!el) return;
    const items = [];
    (records || []).slice(0, 5).forEach(record => {
      const failed = record.status === 'failed' || record.status === 'canceled';
      items.push({
        kind: failed ? 'fail' : 'success',
        title: record.event || (record.status === 'completed' ? 'Generation completed' : 'Generation event'),
        sub: record.model || record.provider || record.job_id || 'generation',
        time: record.recorded_at || record.timestamp || record.createdAt,
        label: failed ? 'Failed' : record.status === 'completed' ? 'Completed' : 'Recorded',
      });
    });
    (evaluations || []).slice(0, 3).forEach(evaluation => {
      const status = String(evaluation.status || '').toLowerCase();
      const failed = ['rejected', 'evaluation_error'].includes(status);
      const flagged = status === 'needs_review';
      items.push({
        kind: failed ? 'fail' : flagged ? 'review' : 'success',
        title: status === 'approved' ? 'Evaluation approved' : status === 'rejected' ? 'Evaluation rejected' : status === 'evaluation_error' ? 'Evaluation unavailable' : status === 'needs_review' ? 'Evaluation needs review' : 'Evaluation: ' + (status || 'recorded'),
        sub: evaluation.job_id || evaluation.generation_id || 'evaluation',
        time: evaluation.created_at || evaluation.createdAt || evaluation.timestamp,
        label: failed ? 'Attention' : flagged ? 'Needs Review' : status === 'approved' ? 'Approved' : 'Recorded',
      });
    });
    items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    el.innerHTML = items.slice(0, 6).map(item => '<div class="activity-item"><span class="activity-icon ' + item.kind + '">' + (item.kind === 'fail' ? '△' : item.kind === 'review' ? '▶' : '▧') + '</span><div><strong>' + esc(item.title) + '</strong><small>' + esc(item.sub) + '</small></div><time>' + esc(fmtTime(item.time)) + '</time><em class="activity-tag ' + item.kind + '">' + esc(item.label) + '</em></div>').join('') || '<div class="empty-state">No generation activity recorded yet.</div>';
  }

  function updateEngineStats(jobs){const groups={nano:jobs.filter(j=>!isVideo(j)),wan:jobs.filter(isVideo)};[['nano',groups.nano],['wan',groups.wan]].forEach(([key,list])=>{const total=list.length,done=list.filter(j=>j.status==='completed').length,success=total?Math.round(done/total*1000)/10:null,latencyValues=list.map(j=>Number(j.duration_ms||j.latency_ms||j.latency||0)).filter(Boolean),latency=latencyValues.length?(latencyValues.reduce((a,b)=>a+b,0)/latencyValues.length/1000).toFixed(1)+'s':'—';if($(`${key}Jobs`))$(`${key}Jobs`).textContent=total||'0';if($(`${key}Success`))$(`${key}Success`).textContent=success==null?'—':`${success}%`;if($(`${key}Latency`))$(`${key}Latency`).textContent=latency;});}

  function updateIntelligence(jobs, evaluations, records, health) {
    ensureIntelligencePanel();
    const active = jobs.filter(job => ['queued', 'running', 'waiting_for_gpu', 'retrying_gpu'].includes(job.status)).length;
    const failed = jobs.filter(job => ['failed', 'canceled'].includes(job.status)).length;
    const reviews = evaluations.filter(item => ['needs_review', 'rejected', 'evaluation_error'].includes(item.status)).length;
    const latest = jobs.slice().sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))[0];
    if ($('timelineJobs')) $('timelineJobs').textContent = jobs.length;
    if ($('timelineReviews')) $('timelineReviews').textContent = reviews;
    if ($('timelineFailures')) $('timelineFailures').textContent = failed;
    if ($('timelineState')) $('timelineState').textContent = active ? 'RUNNING' : failed ? 'NEEDS ATTENTION' : jobs.length ? 'RECORDED' : 'READY';
    const reportedProgress = typeof latest?.progress === 'number' ? latest.progress : Number.NaN;
    const timelinePercent = latest?.status === 'completed' ? 100 : ['failed', 'canceled'].includes(latest?.status) ? 0 : Number.isFinite(reportedProgress) && reportedProgress >= 0 && reportedProgress <= 100 ? reportedProgress : null;
    if ($('timelineProgress')) {
      $('timelineProgress').style.width = (timelinePercent === null ? 0 : timelinePercent) + '%';
      $('timelineProgress').style.opacity = timelinePercent === null ? '0' : '1';
    }
    if ($('memoryCount')) $('memoryCount').textContent = (evaluations.length + records.length) + ' signals';
    if ($('approvedSignal')) $('approvedSignal').textContent = evaluations.length ? evaluations.filter(item => ['approved', 'passed', 'accepted'].includes(String(item.status || '').toLowerCase())).length + ' approved evaluation outcomes recorded.' : 'No evaluation outcome recorded yet.';
    if ($('errorSignal')) $('errorSignal').textContent = failed ? failed + ' generation failure' + (failed === 1 ? '' : 's') + ' recorded; investigate before repeating.' : reviews ? reviews + ' item' + (reviews === 1 ? '' : 's') + ' need visual review.' : 'No flagged items in this snapshot.';
    if ($('modelSignal')) $('modelSignal').textContent = jobs.length ? 'Route evidence is recorded for ' + jobs.length + ' recent job' + (jobs.length === 1 ? '' : 's') + '.' : 'Generation evidence will appear here after the first job.';
    const configuredRoute = health?.providers?.image;
    if ($('routeModel')) $('routeModel').textContent = latest ? latest.model || latest.provider || 'Unknown route' : configuredRoute ? configuredRoute.model || configuredRoute.provider : 'Unavailable';
    if ($('routeReason')) $('routeReason').textContent = latest ? 'Route reported by the latest generation job.' : configuredRoute ? 'Configured image route; provider availability has not been checked.' : 'Runtime route information is unavailable.';
    const scores = evaluations.map(item => item.scores || {});
    const average = key => {
      const values = scores.map(item => Number(item[key])).filter(value => Number.isFinite(value));
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    const style = average('style_consistency');
    const adherence = average('prompt_adherence');
    const terminalJobs = jobs.filter(job => ['completed', 'failed', 'canceled'].includes(job.status));
    const success = terminalJobs.length ? Math.round(terminalJobs.filter(job => job.status === 'completed').length / terminalJobs.length * 100) : null;
    if ($('routeBadge')) $('routeBadge').textContent = latest ? 'LATEST JOB' : 'CONFIGURED';
    [['routeStyle', style], ['routeRef', adherence], ['routeSuccess', success]].forEach(([id, value]) => {
      if ($(id)) $(id).textContent = value === null ? '—' : value + '%';
    });
    [['routeStyleBar', style], ['routeRefBar', adherence], ['routeSuccessBar', success]].forEach(([id, value]) => {
      if ($(id)) $(id).style.width = (value === null ? 0 : value) + '%';
    });
  }

  async function refresh() {
    try {
      const [jobsResponse, historyResponse, evaluationsResponse, healthResponse] = await Promise.all([
        fetch('/jobs'),
        fetch('/generation-history?limit=30'),
        fetch('/evaluations?limit=20'),
        fetch('/health')
      ]);
      const jobsData = await jobsResponse.json();
      const historyData = await historyResponse.json();
      const evaluationsData = await evaluationsResponse.json();
      const health = healthResponse.ok ? await healthResponse.json() : null;
      const jobs = jobsData.jobs || [];
      const records = historyData.records || [];
      const evaluations = evaluationsData.evaluations || [];
      const active = jobs.filter(job => ['queued', 'running', 'waiting_for_gpu', 'retrying_gpu'].includes(job.status)).length;
      const completed = jobs.filter(job => job.status === 'completed').length;
      const failed = jobs.filter(job => ['failed', 'canceled'].includes(job.status)).length;
      const review = evaluations.filter(item => ['needs_review', 'rejected', 'evaluation_error'].includes(item.status)).length;
      if ($('metricActive')) $('metricActive').textContent = active;
      if ($('metricCompleted')) $('metricCompleted').textContent = completed;
      if ($('metricFailed')) $('metricFailed').textContent = failed;
      if ($('metricReview')) $('metricReview').textContent = review;
      if ($('activityCompleted')) $('activityCompleted').textContent = completed;
      if ($('activityFailed')) $('activityFailed').textContent = failed;
      if ($('activityReview')) $('activityReview').textContent = review;
      if ($('systemStatus')) $('systemStatus').textContent = health?.ok ? 'System Online' : 'System Attention';
      if ($('lastUpdated')) $('lastUpdated').textContent = 'Last updated: ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if ($('healthPercent')) $('healthPercent').textContent = health ? health.ok ? 'OK' : 'CHECK' : '—';
      const healthLabels = {
        healthApi: health ? health.ok ? 'Available' : 'Unavailable' : 'Unknown',
        healthQueue: health ? health.storage_ok ? 'Writable' : 'Unavailable' : 'Unknown',
        healthState: health ? health.storage_path_configured ? 'Configured path' : 'Default path' : 'Unknown',
        healthModels: health ? health.provider_setup_ready ? 'Credentials set' : 'Setup needed' : 'Unknown',
        healthStorage: health ? health.storage_path_configured ? 'Configured path' : 'Default path' : 'Unknown',
      };
      for (const [id, label] of Object.entries(healthLabels)) if ($(id)) $(id).textContent = label;
      const providerNames = { google: 'Google', fal: 'fal.ai', hf_image: 'Hugging Face', hf_space: 'Hugging Face', replicate: 'Replicate' };
      for (const [kind, route] of Object.entries({ image: health?.providers?.image, video: health?.providers?.video })) {
        if (!route) continue;
        const name = providerNames[route.provider] || route.provider;
        if ($(kind + 'EngineName')) $(kind + 'EngineName').textContent = name;
        if ($(kind + 'EngineModel')) $(kind + 'EngineModel').textContent = route.model || 'Model not reported';
        if ($(kind + 'RouteNote')) $(kind + 'RouteNote').textContent = name + ' · ' + (route.model || 'model not reported') + ' · availability not checked';
      }
      updateEngineStats(jobs);
      renderQueue(jobs);
      renderRecent(records, evaluations);
      updateIntelligence(jobs, evaluations, records, health);
    } catch (error) {
      if ($('systemStatus')) $('systemStatus').textContent = 'System Attention';
      if ($('lastUpdated')) $('lastUpdated').textContent = 'Telemetry unavailable';
      if ($('healthPercent')) $('healthPercent').textContent = 'CHECK';
      ensureIntelligencePanel();
    }
  }

  document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));document.querySelectorAll('.action-btn,.dark-btn,.icon-btn,.profile-btn').forEach(b=>b.addEventListener('mousedown',()=>b.classList.add('pressed')));document.querySelectorAll('button').forEach(b=>b.addEventListener('mouseup',()=>b.classList.remove('pressed')));$('refreshDashboard')?.addEventListener('click',refresh);ensureIntelligencePanel();refresh();setInterval(refresh,15000);
  window.refreshDashboard = refresh;
})();
