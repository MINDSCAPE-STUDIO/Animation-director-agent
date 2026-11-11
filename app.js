const example = `Kai walks toward the camera for 10 seconds on a slight curved path. He keeps looking toward the camera throughout the shot and gives a subtle smile. His walking and body language should feel natural and relaxed. The camera slowly tracks backward while Kai physically approaches. The background has subtle movement/parallax. Keep Kai's identity and the scene visually consistent.`;

const $ = id => document.getElementById(id);
const esc = x => String(x).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
const has = (s, ...t) => t.some(x => s.includes(x));
const between = (t, r) => (t.match(r) || [])[1] || null;

$('loadExample').onclick = () => { $('prompt').value = example; $('duration').value = '10'; plan() };
$('generate').onclick = plan;
$('duration').onchange = () => { plan() };
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('json').textContent);
    $('copy').textContent = 'Copied ✓';
    setTimeout(() => $('copy').textContent = 'Copy', 1000);
  } catch {}
};

function plan() {
  const raw = $('prompt').value.trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  const duration = Math.max(5, Math.min(12, Number($('duration').value) || 10));
  const fps = Number($('fps').value) || 12;
  const character = has(s, 'kai') ? 'Kai' : (between(raw, /([A-Z][a-z]+)\s+(?:walks|runs|moves|stands|looks)/) || 'Unspecified');
  const action = has(s, 'walk') ? 'walks toward camera' : has(s, 'run') ? 'runs' : has(s, 'stand') ? 'stands' : 'unspecified action';
  const path = has(s, 'curved', 'curve') ? 'slight curved path' : has(s, 'straight') ? 'straight path' : 'unspecified path';
  const camera = has(s, 'static') ? 'mostly static' : has(s, 'frontal', 'front') ? 'frontal' : has(s, 'close-up', 'closeup') ? 'close-up' : has(s, 'wide') ? 'wide' : 'tracking toward subject';
  const gaze = has(s, 'look toward camera', 'looking toward the camera', 'gaze toward camera', 'gaze') ? 'toward camera' : 'unspecified';
  const expression = has(s, 'smile') ? 'subtle smile' : has(s, 'serious') ? 'serious' : 'natural / unspecified';
  const body = has(s, 'natural', 'relaxed') ? 'natural, relaxed body language' : 'unspecified';
  const background = has(s, 'parallax') ? 'subtle movement/parallax' : has(s, 'background') ? 'background present; motion unspecified' : 'unspecified';
  const priorities = [];
  if (has(s, 'identity', 'consistent')) priorities.push('identity consistency');
  if (has(s, 'gaze', 'look')) priorities.push('gaze consistency');
  if (has(s, 'natural')) priorities.push('natural movement');
  if (has(s, 'camera', 'frontal', 'tracking')) priorities.push('camera continuity');
  if (has(s, 'background', 'parallax')) priorities.push('background continuity');
  priorities.push('physical forward translation toward camera');
  priorities.push('visible distance decrease and progressive subject enlargement');
  if (!priorities.length) priorities.push('follow explicit director intent');
  const ambiguities = [];
  if (character === 'Unspecified') ambiguities.push('Character identity is not specified.');
  const spec = {
    shot_id: $('shotId').value.trim() || 'UNASSIGNED',
    duration_seconds: duration,
    fps,
    character,
    action,
    path,
    camera,
    performance: { gaze, expression, body_language: body },
    background,
    priorities,
    acceptance_criteria: [
      `Continuous ${action} for ${duration}s`,
      `Physical forward travel toward camera for the full shot`,
      `Character scale visibly increases from beginning to end`,
      `${character === 'Unspecified' ? 'character' : character} remains visually consistent`,
      'No major anatomical/identity deformation',
      'Performance and gaze follow the specified direction',
      'Camera and background continuity are maintained'
    ],
    ambiguities
  };
  const bundle = window.DirectorPipeline ? DirectorPipeline.run(spec) : { shot: spec };
  $('json').textContent = JSON.stringify(bundle, null, 2);
  $('confidence').textContent = ambiguities.length ? 'Needs review' : 'Ready';
  $('pipelineStatus').textContent = ambiguities.length ? 'Director review' : 'Ready for generation';
  $('brief').className = 'brief';
  $('brief').innerHTML = `<h3>Shot ${esc(spec.shot_id)}</h3><p><b>${esc(character)}</b> ${esc(action)} for <b>${duration}s</b> at <b>${fps} FPS</b>, following ${esc(path)}.</p><dl><dt>Camera</dt><dd>${esc(camera)}</dd><dt>Gaze</dt><dd>${esc(gaze)}</dd><dt>Expression</dt><dd>${esc(expression)}</dd><dt>Body</dt><dd>${esc(body)}</dd><dt>Background</dt><dd>${esc(background)}</dd><dt>Priorities</dt><dd>${priorities.map(esc).join(' · ')}</dd></dl>`;
  if ($('checks')) $('checks').innerHTML = [
    ['Timing', `${duration}s target · video uses the configured cloud route`, 'ok'],
    ['Continuity', priorities.join(' · '), 'ok'],
    ['Ambiguity', ambiguities.length ? ambiguities.join(' ') : 'No major ambiguity detected', 'ok']
  ].map(x => `<div class="check"><strong class="${x[2]}">${x[0]}</strong>${esc(x[1])}</div>`).join('');
  return spec;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function submitGeneration(type) {
  try {
    const shot = plan();
    if (!shot) return;
    const isVideo = type === 'image_to_video';
    const input = isVideo ? { duration: shot.duration_seconds, fps: shot.fps, resolution: $('videoQuality').value } : { image_size: $('imageQuality').value };
    if (isVideo) {
      const file = $('videoImageFile').files?.[0];
      if (file) {
        if (file.size > 12 * 1024 * 1024) throw Error('Please choose an image under 12 MB.');
        input.imageData = await readFileAsDataUrl(file);
      } else if ($('videoImageUrl').value.trim()) input.image = $('videoImageUrl').value.trim();
      if (!input.imageData && !input.image) throw Error('Select the approved reference image first.');
      $('videoStatus').textContent = 'Submitting…';
      $('videoResultLink').classList.add('hidden');
      $('videoResult').textContent = 'Sending reference image to the video engine…';
    } else {
      $('imageStatus').textContent = 'Submitting…';
      $('imageResultLink').classList.add('hidden');
      $('imageResult').textContent = 'Sending asset request to the image engine…';
    }
    const payload = { type, shot, input };
    if (type === 'text_to_image') payload.prompt = $('prompt').value.trim();
    const r = await window.apiFetch('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || `HTTP ${r.status}`);
    if (isVideo) {
      $('videoStatus').textContent = 'Running';
      $('videoResult').textContent = `Job ${data.id} · ${data.provider} · ${data.model}`;
    } else {
      $('imageStatus').textContent = 'Running';
      $('imageResult').textContent = `Job ${data.id} · ${data.provider} · ${data.model}`;
    }
    refreshDashboard();
    poll(data.id, type);
  } catch (e) {
    if (type === 'image_to_video') {
      $('videoStatus').textContent = 'Setup needed';
      $('videoResult').textContent = e.message;
    } else {
      $('imageStatus').textContent = 'Setup needed';
      $('imageResult').textContent = e.message;
    }
  }
}

async function poll(id, type) {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const r = await window.apiFetch('/jobs/' + encodeURIComponent(id));
      const j = await r.json();
      const isVideo = type === 'image_to_video';
      if (j.status === 'completed') {
        const result = j.result;
        const url = typeof result === 'string' ? result : result?.output || result?.url || result?.video?.url;
        if (isVideo) {
          $('videoStatus').textContent = 'Complete';
          $('videoResult').textContent = `Video generated with ${j.model}.`;
          if (url) { $('videoResultLink').href = url; $('videoResultLink').classList.remove('hidden') }
        } else {
          $('imageStatus').textContent = 'Complete';
          $('imageResult').textContent = `Asset generated with ${j.model}.`;
          if (url) { $('imageResultLink').href = url; $('imageResultLink').classList.remove('hidden') }
        }
        refreshDashboard();
        return;
      }
      if (j.status === 'failed' || j.status === 'canceled') {
        if (isVideo) {
          $('videoStatus').textContent = 'Failed';
          $('videoResult').textContent = j.error || 'Generation failed.';
        } else {
          $('imageStatus').textContent = 'Failed';
          $('imageResult').textContent = j.error || 'Generation failed.';
        }
        refreshDashboard();
        return;
      }
      if (isVideo) $('videoStatus').textContent = j.status || 'Running';
      else $('imageStatus').textContent = j.status || 'Running';
    } catch {}
  }
  const msg = 'Still running. You can leave this page; the job remains on the cloud server.';
  if (type === 'image_to_video') $('videoResult').textContent = msg;
  else $('imageResult').textContent = msg;
  refreshDashboard();
}

$('generateVideo').onclick = () => submitGeneration('image_to_video');
$('generateImage').onclick = () => submitGeneration('text_to_image');
$('duration').value = '10';
$('prompt').value = example;
plan();
