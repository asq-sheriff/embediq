// ─── State ───

const state = {
  dimensions: [],
  currentDimIndex: 0,
  currentQuestions: [],
  currentQuestionIndex: 0,
  answers: {},
  profile: null,
  currentValue: null,
  sessionId: null,
  eventWs: null,
  filesStreamed: new Set(),
  serverBackend: null, // null = unknown, false = disabled, true = enabled
};

const SESSION_STORAGE_KEY = 'embediq_session_id';

// ─── Server-Side Session Helpers ───

async function loadSessionsConfig() {
  try {
    const res = await fetch('/api/sessions/config');
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false };
  }
}

async function mintServerSession() {
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.sessionId;
  } catch {
    return null;
  }
}

async function loadServerSession(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadResumeView(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function patchSession(sessionId, body) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort — failing to persist a single PATCH should not block
    // wizard progression. The next answer's PATCH will catch up.
  }
}

function readSessionFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  } catch {
    return null;
  }
}

function writeSessionToUrl(sessionId) {
  try {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set('session', sessionId);
    else url.searchParams.delete('session');
    window.history.replaceState({}, '', url.toString());
  } catch {
    // history API unavailable — degrade gracefully
  }
}

function storeSessionId(sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable (private mode); degrade gracefully
  }
}

function readStoredSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

// ─── Phase Navigation ───

function showPhase(id) {
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  const phaseMap = {
    'phase-welcome': 0,
    'phase-qa': 1,
    'phase-playback': 2,
    'phase-generate': 3,
  };

  document.querySelectorAll('.dot').forEach(d => {
    const idx = parseInt(d.dataset.phase);
    d.classList.toggle('active', idx === phaseMap[id]);
    d.classList.toggle('done', idx < phaseMap[id]);
  });
}

// ─── Phase 0: Welcome ───

async function startWizard() {
  if (state.serverBackend && !state.sessionId) {
    const sessionId = await mintServerSession();
    if (sessionId) {
      state.sessionId = sessionId;
      storeSessionId(sessionId);
      writeSessionToUrl(sessionId);
    }
  }

  const res = await fetch('/api/dimensions');
  state.dimensions = await res.json();

  // When resuming, jump to the coordinates the server computed so the
  // wizard lands at the next unanswered visible question rather than
  // starting from dimension 0.
  const resume = state.resumeView;
  const startDimension = resume ? Math.max(0, resume.nextDimensionIndex) : 0;
  state.currentDimIndex = startDimension;

  renderDimensionSidebar();
  await loadDimension(startDimension);

  if (resume) {
    const idx = Math.min(
      resume.nextQuestionIndex,
      Math.max(0, state.currentQuestions.length - 1),
    );
    if (idx > 0) {
      state.currentQuestionIndex = idx;
      renderQuestion();
    }
    state.resumeView = null; // consume — only honored on first start after init
  }

  showPhase('phase-qa');
}

// ─── Phase 1: Q&A ───

function renderDimensionSidebar() {
  const icons = ['🎯', '🔍', '⚙️', '💻', '🔒', '💰', '🚀'];
  const list = document.getElementById('dimension-list');
  list.innerHTML = state.dimensions.map((d, i) => `
    <div class="dim-item${i === 0 ? ' active' : ''}" id="dim-${i}">
      <span class="dim-icon">${icons[i] || '•'}</span>
      <span class="dim-label">${d.name}</span>
      <div class="dim-progress">
        <div class="dim-progress-fill" id="dim-progress-${i}" style="width: 0%"></div>
      </div>
    </div>
  `).join('');
}

async function loadDimension(index) {
  state.currentDimIndex = index;
  state.currentQuestionIndex = 0;

  // Update sidebar
  document.querySelectorAll('.dim-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  const dim = state.dimensions[index];
  document.getElementById('current-dimension').textContent = dim.name;

  // Fetch visible questions
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dimension: dim.name, answers: state.answers }),
  });
  state.currentQuestions = await res.json();

  if (state.currentQuestions.length === 0) {
    await advanceDimension();
    return;
  }

  renderQuestion();
}

function renderQuestion() {
  const q = state.currentQuestions[state.currentQuestionIndex];
  if (!q) return;

  state.currentValue = null;

  document.getElementById('question-counter').textContent =
    `Question ${state.currentQuestionIndex + 1} of ${state.currentQuestions.length}`;
  document.getElementById('question-text').textContent = q.text;
  document.getElementById('help-text').textContent = q.helpText || '';
  document.getElementById('btn-skip').style.display = q.required ? 'none' : '';

  const container = document.getElementById('answer-input');
  container.innerHTML = '';

  switch (q.type) {
    case 'free_text':
      container.innerHTML = `<input type="text" class="text-input" id="text-answer"
        placeholder="Type your answer..." onkeydown="if(event.key==='Enter')nextQuestion()">`;
      setTimeout(() => document.getElementById('text-answer')?.focus(), 100);
      break;

    case 'single_choice':
      container.innerHTML = `<div class="choice-group">
        ${(q.options || []).map(o => `
          <label class="choice-item" onclick="selectChoice(this, '${o.key}')">
            <input type="radio" name="choice" value="${o.key}">
            <div class="choice-label">
              <div class="label-text">${o.label}</div>
              ${o.description ? `<div class="label-desc">${o.description}</div>` : ''}
            </div>
          </label>
        `).join('')}
      </div>`;
      break;

    case 'multi_choice':
      container.innerHTML = `<div class="choice-group">
        ${(q.options || []).map(o => `
          <label class="choice-item" onclick="toggleMulti(this, '${o.key}')">
            <input type="checkbox" value="${o.key}">
            <div class="choice-label">
              <div class="label-text">${o.label}</div>
              ${o.description ? `<div class="label-desc">${o.description}</div>` : ''}
            </div>
          </label>
        `).join('')}
      </div>`;
      state.currentValue = [];
      break;

    case 'scale':
      container.innerHTML = `
        <div class="scale-group">
          ${[1,2,3,4,5].map(n => `
            <div class="scale-item" onclick="selectScale(this, ${n})">${n}</div>
          `).join('')}
        </div>
        <div class="scale-labels">
          <span>Not at all</span>
          <span>Extremely</span>
        </div>`;
      break;

    case 'yes_no':
      container.innerHTML = `<div class="choice-group">
        <label class="choice-item" onclick="selectChoice(this, true)">
          <input type="radio" name="yn" value="true">
          <div class="choice-label"><div class="label-text">Yes</div></div>
        </label>
        <label class="choice-item" onclick="selectChoice(this, false)">
          <input type="radio" name="yn" value="false">
          <div class="choice-label"><div class="label-text">No</div></div>
        </label>
      </div>`;
      break;
  }

  // Update progress
  const pct = Math.round(((state.currentQuestionIndex) / state.currentQuestions.length) * 100);
  const progressEl = document.getElementById(`dim-progress-${state.currentDimIndex}`);
  if (progressEl) progressEl.style.width = `${pct}%`;

  // Animate
  const card = document.getElementById('question-card');
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = '';
}

function selectChoice(el, value) {
  el.closest('.choice-group').querySelectorAll('.choice-item').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.currentValue = value;
}

function toggleMulti(el, value) {
  el.classList.toggle('selected');
  const cb = el.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;

  if (!Array.isArray(state.currentValue)) state.currentValue = [];
  if (el.classList.contains('selected')) {
    state.currentValue.push(value);
  } else {
    state.currentValue = state.currentValue.filter(v => v !== value);
  }
}

function selectScale(el, value) {
  el.closest('.scale-group').querySelectorAll('.scale-item').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.currentValue = value;
}

async function nextQuestion() {
  const q = state.currentQuestions[state.currentQuestionIndex];

  // Gather value
  let value = state.currentValue;
  if (q.type === 'free_text') {
    value = document.getElementById('text-answer')?.value || '';
  }

  if (q.required && (value === null || value === undefined || value === '' ||
      (Array.isArray(value) && value.length === 0))) {
    return; // Don't advance without required answer
  }

  // Store answer
  if (value !== null && value !== undefined && value !== '') {
    const answerEntry = { value, timestamp: new Date().toISOString() };
    state.answers[q.id] = answerEntry;
    // Best-effort persist to server-side session for interrupt/resume.
    // The server stamps `contributedBy` from the request context — the
    // client cannot supply attribution. The current dimension is patched
    // alongside so resume lands at the right spot.
    if (state.serverBackend && state.sessionId) {
      patchSession(state.sessionId, {
        answers: { [q.id]: { questionId: q.id, ...answerEntry } },
        currentDimension: state.dimensions[state.currentDimIndex]?.name,
      });
    }
  }

  // Next question or next dimension
  state.currentQuestionIndex++;

  if (state.currentQuestionIndex >= state.currentQuestions.length) {
    // Mark dimension done
    const progressEl = document.getElementById(`dim-progress-${state.currentDimIndex}`);
    if (progressEl) progressEl.style.width = '100%';
    const dimEl = document.getElementById(`dim-${state.currentDimIndex}`);
    if (dimEl) dimEl.classList.add('done');

    await advanceDimension();
  } else {
    // Re-fetch visible questions (answer may have changed visibility)
    const dim = state.dimensions[state.currentDimIndex];
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimension: dim.name, answers: state.answers }),
    });
    const updated = await res.json();
    const answeredIds = Object.keys(state.answers);
    state.currentQuestions = updated.filter(q => !answeredIds.includes(q.id));

    if (state.currentQuestionIndex >= state.currentQuestions.length) {
      const progressEl = document.getElementById(`dim-progress-${state.currentDimIndex}`);
      if (progressEl) progressEl.style.width = '100%';
      const dimEl = document.getElementById(`dim-${state.currentDimIndex}`);
      if (dimEl) dimEl.classList.add('done');
      await advanceDimension();
    } else {
      state.currentQuestionIndex = 0; // reset since we re-filtered
      renderQuestion();
    }
  }
}

function skipQuestion() {
  state.currentQuestionIndex++;
  if (state.currentQuestionIndex >= state.currentQuestions.length) {
    advanceDimension();
  } else {
    renderQuestion();
  }
}

async function advanceDimension() {
  state.currentDimIndex++;
  if (state.currentDimIndex >= state.dimensions.length) {
    await buildProfile();
  } else {
    await loadDimension(state.currentDimIndex);
  }
}

// ─── Phase 2: Playback ───

async function buildProfile() {
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: state.answers }),
  });
  state.profile = await res.json();
  renderPlayback();
  showPhase('phase-playback');
}

function renderPlayback() {
  const p = state.profile;
  const summary = document.getElementById('profile-summary');

  const roleMap = {
    developer: 'Software Developer',
    devops: 'DevOps / SRE',
    lead: 'Tech Lead / Architect',
    ba: 'Business Analyst',
    pm: 'Product Manager',
    executive: 'Executive / Director',
    qa: 'QA / Test Engineer',
    data: 'Data Analyst',
  };

  const industryMap = {
    healthcare: 'Healthcare / Life Sciences',
    finance: 'Financial Services / Fintech',
    ecommerce: 'E-Commerce / Retail',
    saas: 'SaaS / Enterprise Software',
    education: 'Education / EdTech',
    government: 'Government / Public Sector',
    manufacturing: 'Manufacturing / IoT',
    media: 'Media / Entertainment / Gaming',
  };

  const teamMap = {
    solo: 'Solo developer',
    small: 'Small team (2-5)',
    medium: 'Medium team (6-15)',
    large: 'Large team (15+)',
  };

  const rows = [
    ['Role', roleMap[p.role] || p.role],
    ['Domain', p.businessDomain || '—'],
    ['Industry', industryMap[p.industry] || p.industry || '—'],
    ['Team', teamMap[p.teamSize] || p.teamSize],
  ];

  const isNonTech = ['ba', 'pm', 'executive'].includes(p.role);

  if (!isNonTech) {
    if (p.languages?.length) rows.push(['Languages', p.languages.join(', ')]);
    if (p.devOps?.buildTools?.length) rows.push(['Build', p.devOps.buildTools.join(', ')]);
    if (p.devOps?.testFrameworks?.length) rows.push(['Testing', p.devOps.testFrameworks.join(', ')]);
  }

  if (p.devOps?.cicd) rows.push(['CI/CD', p.devOps.cicd]);
  if (p.complianceFrameworks?.length) rows.push(['Compliance', p.complianceFrameworks.map(f => f.toUpperCase()).join(', ')]);
  if (p.securityConcerns?.length) rows.push(['Security', p.securityConcerns.length + ' controls']);
  rows.push(['Budget', { minimal: '< $5/day', moderate: '$5-20/day', enterprise: 'Enterprise' }[p.budgetTier] || p.budgetTier]);

  summary.innerHTML = `
    <div class="profile-card">
      <h3>Profile</h3>
      ${rows.map(([k, v]) => `
        <div class="profile-row">
          <div class="profile-key">${k}</div>
          <div class="profile-value">${v}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Priorities
  const prioSection = document.getElementById('priorities-section');
  if (p.priorities?.length) {
    prioSection.innerHTML = `
      <div class="profile-card">
        <h3>Interpreted Priorities</h3>
        ${p.priorities.map((pr, i) => `
          <div class="priority-item">
            <div class="priority-rank">${i + 1}</div>
            <div class="priority-name">${pr.name}</div>
            <div class="priority-bar">
              <div class="priority-fill" style="width: ${Math.round(pr.confidence * 100)}%"></div>
            </div>
            <div class="priority-pct">${Math.round(pr.confidence * 100)}%</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function editProfile() {
  // Go back to Q&A — restart from beginning with existing answers preserved
  state.currentDimIndex = 0;
  renderDimensionSidebar();
  loadDimension(0);
  showPhase('phase-qa');
}

async function approveAndGenerate() {
  // Preview files first
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: state.answers }),
  });
  const files = await res.json();

  const preview = document.getElementById('file-preview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <h3 style="padding: 16px 16px 8px; font-size: 14px; color: var(--text-secondary);">
      Files to generate (${files.length})
    </h3>
    ${files.map(f => `
      <div class="file-item" onclick="togglePreview(this, '${encodeURIComponent(f.content)}', '${f.path}')">
        <span class="file-icon">📄</span>
        <span class="file-path">${f.path}</span>
        <span class="file-desc">${f.description}</span>
      </div>
    `).join('')}
  `;

  showPhase('phase-generate');
}

function togglePreview(el, encodedContent, path) {
  const existing = el.nextElementSibling;
  if (existing && existing.classList.contains('file-preview')) {
    existing.remove();
    return;
  }

  const content = decodeURIComponent(encodedContent);
  const previewEl = document.createElement('div');
  previewEl.className = 'file-preview';
  previewEl.style.margin = '0 0 8px 0';
  previewEl.style.borderRadius = '0';
  previewEl.innerHTML = `
    <div class="file-preview-header">
      <span class="file-name">${path}</span>
      <button class="btn-secondary" style="padding: 4px 12px; font-size: 12px;" onclick="this.closest('.file-preview').remove()">Close</button>
    </div>
    <pre>${escapeHtml(content)}</pre>
  `;
  el.after(previewEl);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Live Event Stream ───

function openEventStream(sessionId) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws/events`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
  ws.onmessage = (m) => {
    try {
      dispatchEnvelope(JSON.parse(m.data));
    } catch { /* ignore malformed frames */ }
  };
  return ws;
}

function dispatchEnvelope(env) {
  const progress = document.getElementById('live-progress');
  if (!progress) return;
  if (env.name === 'generation:started') {
    progress.innerHTML = `<div class="progress-line">Starting ${env.payload.generatorCount} generators…</div>`;
  } else if (env.name === 'file:generated') {
    if (state.filesStreamed.has(env.payload.relativePath)) return;
    state.filesStreamed.add(env.payload.relativePath);
    const line = document.createElement('div');
    line.className = 'progress-line';
    line.textContent = `✓ ${env.payload.relativePath}`;
    progress.appendChild(line);
  } else if (env.name === 'validation:completed') {
    const { passCount, failCount } = env.payload;
    const line = document.createElement('div');
    line.className = 'progress-line';
    line.textContent = failCount === 0
      ? `✓ Validation passed (${passCount} checks)`
      : `⚠ Validation: ${passCount} passed, ${failCount} failed`;
    progress.appendChild(line);
  }
}

async function generateFiles() {
  const targetDir = document.getElementById('targetDir').value.trim();
  if (!targetDir) {
    document.getElementById('targetDir').style.borderColor = 'var(--error)';
    return;
  }

  const btn = document.querySelector('#target-dir-input .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  if (!state.sessionId) {
    state.sessionId = crypto.randomUUID();
  }
  state.filesStreamed = new Set();
  const progress = document.getElementById('live-progress');
  if (progress) {
    progress.classList.remove('hidden');
    progress.innerHTML = '';
  }
  state.eventWs = openEventStream(state.sessionId);

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: state.answers, targetDir, sessionId: state.sessionId }),
  });
  const result = await res.json();

  const results = document.getElementById('generation-results');
  results.classList.remove('hidden');

  const fileList = document.getElementById('file-list');
  fileList.innerHTML = result.files.map(f => `
    <div class="file-item">
      <span class="file-icon">${f.written ? '✅' : '❌'}</span>
      <span class="file-path">${f.path}</span>
      <span class="file-desc">${f.description}</span>
    </div>
  `).join('');

  const isNonTech = state.profile && ['ba', 'pm', 'executive'].includes(state.profile.role);
  const msg = document.getElementById('completion-message');
  msg.innerHTML = `
    <h2>All set</h2>
    <p>${result.totalWritten} files written to ${targetDir}</p>
    <p style="margin-top: 12px; font-size: 14px; color: var(--text-secondary);">
      ${isNonTech
        ? 'Your Claude coworker setup is ready. Run <code>claude</code> in your project directory.'
        : 'Run <code>claude</code> in your project directory to start. Copy <code>.mcp.json.template</code> to <code>.mcp.json</code> and add API keys.'}
    </p>
  `;

  btn.textContent = 'Done';

  if (state.eventWs && state.eventWs.readyState === WebSocket.OPEN) {
    state.eventWs.close();
  }
  state.eventWs = null;
}

// ─── Init ───

async function initWizard() {
  showPhase('phase-welcome');
  const config = await loadSessionsConfig();
  state.serverBackend = !!config.enabled;
  if (!state.serverBackend) return;

  // URL-supplied session id takes precedence over sessionStorage so a
  // shared bookmark always wins over whatever the local browser knows.
  const fromUrl = readSessionFromUrl();
  const stored = fromUrl || readStoredSessionId();
  if (!stored) return;

  const resume = await loadResumeView(stored);
  if (!resume) {
    storeSessionId(null);
    if (fromUrl) writeSessionToUrl(null);
    return;
  }

  state.sessionId = resume.session.sessionId;
  state.answers = resume.session.answers || {};
  storeSessionId(state.sessionId);
  writeSessionToUrl(state.sessionId);
  state.resumeView = resume;
  renderResumeBanner(resume);
}

function renderResumeBanner(resume) {
  const banner = document.getElementById('resume-banner');
  if (!banner) return; // index.html doesn't have the slot — no-op gracefully
  const { totals, contributors, complete } = resume;
  const contributorCount = Object.keys(contributors || {}).length;
  const parts = [];
  parts.push(`Welcome back — <strong>${totals.answered}</strong> of ${totals.visible} answered`);
  if (contributorCount > 1) {
    parts.push(`across ${contributorCount} contributors`);
  } else if (contributorCount === 1) {
    const [only] = Object.keys(contributors);
    parts.push(`by <strong>${escapeHtml(only)}</strong>`);
  }
  if (complete) parts.push('— ready to generate');
  banner.innerHTML = parts.join(' ');
  banner.style.display = 'block';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

initWizard();
