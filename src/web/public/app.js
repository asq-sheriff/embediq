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
  // Active fill-role for the three-role delegation model. 'admin' for the
  // session creator / single-pass operator; 'lead' or 'individual' when the
  // page is opened from a delegation link (?role=…). Drives proxy framing and
  // (in delegate views) role-scoped question fetching.
  activeRole: 'admin',
  // True only when ?role= was explicitly present (a delegation link). When
  // scoped, the wizard shows only that role's question slice. The default
  // (no ?role=) stays unscoped so a solo operator still sees everything.
  scoped: false,
  // The demo's three-role handoff (Admin → Team Lead → Individual). Unlike a
  // real delegation link (`scoped`), this is a single owner identity acting as
  // each role in turn — it scopes the visible slice client-side only, so the
  // shared session and its API calls are never role-restricted (no 403s).
  // null = the three-role handoff is not active.
  demoRole: null,
};

// Keep only the questions the active fill-role owns (respondent matches) or
// shared (`any`). Active in both a delegation view (`scoped`) and the demo's
// three-role handoff (`demoRole`); a solo unscoped operator sees everything.
function scopeQuestions(qs) {
  if (!state.scoped && !state.demoRole) return qs;
  return qs.filter(q => !q.respondent || q.respondent === 'any' || q.respondent === state.activeRole);
}

const DEMO_ROLE_KEY = 'embediq_fill_role';
function readDemoRole() {
  try {
    const r = sessionStorage.getItem(DEMO_ROLE_KEY);
    return r === 'admin' || r === 'lead' || r === 'individual' ? r : null;
  } catch { return null; }
}

// ─── Gated three-role handoff (Admin → Team Lead → Individual) ───
// The slices have a dependency order: the Lead's questions branch off the
// Admin's setup, and generation consumes all three. So roles unlock in
// sequence — a role is available only once its predecessor is complete —
// and generation happens only after the final (Individual) slice.
const ROLE_ORDER = ['admin', 'lead', 'individual'];
const DONE_ROLES_KEY = 'embediq_done_roles';

function nextRoleAfter(role) {
  const i = ROLE_ORDER.indexOf(role);
  return i >= 0 && i < ROLE_ORDER.length - 1 ? ROLE_ORDER[i + 1] : null;
}
function doneRoles() {
  try { const d = JSON.parse(sessionStorage.getItem(DONE_ROLES_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch { return []; }
}
function markRoleDone(role) {
  const d = doneRoles();
  if (role && !d.includes(role)) { d.push(role); try { sessionStorage.setItem(DONE_ROLES_KEY, JSON.stringify(d)); } catch {} }
}
function clearHandoffProgress() {
  try { sessionStorage.removeItem(DONE_ROLES_KEY); sessionStorage.removeItem(DEMO_ROLE_KEY); } catch {}
}
// A role is reachable if it's first, already completed (reviewable), or its
// immediate predecessor is done.
function roleUnlocked(role) {
  const i = ROLE_ORDER.indexOf(role);
  if (i <= 0) return true;
  const done = doneRoles();
  return done.includes(role) || done.includes(ROLE_ORDER[i - 1]);
}

function readRoleFromUrl() {
  try {
    const r = new URLSearchParams(window.location.search).get('role');
    return r === 'lead' || r === 'individual' || r === 'admin' ? r : 'admin';
  } catch {
    return 'admin';
  }
}

const SESSION_STORAGE_KEY = 'embediq_session_id';

// ─── Iconography ───
//
// Monochrome line icons (Lucide / Feather style — the open-source line-icon
// language Apple SF Symbols popularized). `stroke="currentColor"` lets every
// icon inherit its parent's text color; the .icon CSS class sets size.

const ICONS = {
  target: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1.5v3M12 19.5v3M4.5 12h-3M22.5 12h-3M19 19l-2-2M19 5l-2 2M5 19l2-2M5 5l2 2"/><circle cx="12" cy="12" r="4"/></svg>',
  code: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  dollar: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1.5v21"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  sparkle: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M3 12h3M18 12h3M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1"/></svg>',
  doc: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  xCircle: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  checkCircle: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
};

// Icon order matching the seven dimensions (Strategic Intent, Problem
// Definition, Operational Reality, Technology Requirements, Regulatory
// Compliance, Financial Constraints, Innovation & Future-Proofing).
const DIMENSION_ICONS = [
  ICONS.target,
  ICONS.search,
  ICONS.gear,
  ICONS.code,
  ICONS.shield,
  ICONS.dollar,
  ICONS.sparkle,
];

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

// Append the active role to a session API URL in a delegation (scoped) view,
// so the server grants the delegate access to (and scopes writes to) their slice.
function withRole(url) {
  if (!state.scoped) return url;
  return url + (url.includes('?') ? '&' : '?') + 'role=' + encodeURIComponent(state.activeRole);
}

async function loadServerSession(sessionId) {
  try {
    const res = await fetch(withRole(`/api/sessions/${encodeURIComponent(sessionId)}`), {
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
    const res = await fetch(withRole(`/api/sessions/${encodeURIComponent(sessionId)}/resume`), {
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
    await fetch(withRole(`/api/sessions/${encodeURIComponent(sessionId)}`), {
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

  document.querySelectorAll('.phase-step').forEach(d => {
    const idx = parseInt(d.dataset.phase);
    d.classList.toggle('active', idx === phaseMap[id]);
    d.classList.toggle('done', idx < phaseMap[id]);
  });
}

// ─── Phase 0: Welcome ───

async function startWizard() {
  // Gated handoff entry: the run must begin as the Admin (the Team Lead and
  // Individual slices branch off the Admin's setup). If a demo operator clicks
  // Get Started without choosing a role, start them as the Admin.
  if (state.identity && state.identity.authStrategy === 'demo' && !state.demoRole) {
    selectDemoRole('admin');
    return;
  }
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

  renderScopeBanner();
  showPhase('phase-qa');
}

// ─── Phase 1: Q&A ───

function renderDimensionSidebar() {
  const list = document.getElementById('dimension-list');
  list.innerHTML = state.dimensions.map((d, i) => `
    <div class="dim-item${i === 0 ? ' active' : ''}" id="dim-${i}">
      <span class="dim-icon">${DIMENSION_ICONS[i] || ICONS.target}</span>
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
  // Dimension name is shown in the sidebar (active dim-item) — no duplicate
  // header above the question card.

  // Fetch visible questions
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dimension: dim.name, answers: state.answers }),
  });
  state.currentQuestions = scopeQuestions(await res.json());

  if (state.currentQuestions.length === 0) {
    await advanceDimension();
    return;
  }

  // Reset the review/card visibility — switching dimensions always starts in
  // the question-card view.
  const reviewEl = document.getElementById('dimension-review');
  if (reviewEl) reviewEl.style.display = 'none';
  const cardEl = document.getElementById('question-card');
  if (cardEl) cardEl.style.display = '';
  state.editingFromReview = false;

  // Advance past any already-answered questions (resuming or branching may
  // mean the first visible question has already been answered).
  state.currentQuestionIndex = findNextUnansweredIndex(0);
  if (state.currentQuestionIndex === -1) {
    showDimensionReview();
    return;
  }

  renderQuestion();
}

function findNextUnansweredIndex(startIdx) {
  for (let i = startIdx; i < state.currentQuestions.length; i++) {
    if (!state.answers[state.currentQuestions[i].id]) return i;
  }
  return -1;
}

// True when the operator identified as a Coding Agent Admin (STRAT_000b),
// either by signing in (auto-derived from the auth role before the wizard
// starts) or by answering the question. Drives both the "WHY WE ASK" panel
// and the team-framed question copy below.
function isAdminOperator() {
  return state.answers['STRAT_000b']?.value === 'admin';
}

// Admins configure the harness for a team, so user-profile questions
// (role, proficiency) read better in team framing. Fall back to the
// first-person `text`/`helpText` for individual users and any question
// without an admin variant.
function questionText(q) {
  return (isAdminOperator() && q.adminText) || q.text;
}
function questionHelpText(q) {
  return (isAdminOperator() && q.adminHelpText) || q.helpText || '';
}

// Show a "best answered by…" marker when the current operator is answering a
// question owned by a different role (e.g. an admin filling a Team-Lead pain-
// point question, or a per-seat individual preference). The marker plus the
// existing skip→infer affordance lets a proxy defer rather than guess.
const PROXY_COPY = {
  lead: '👥 Best answered by your <strong>Team Lead</strong> — answer on their behalf, delegate it, or skip.',
  individual: '🧑 <strong>Personal preference</strong> — sets a team default; individuals can override later.',
  admin: '🔒 Admin policy question.',
};
function renderProxyMarker(q) {
  let el = document.getElementById('proxy-marker');
  if (!el) {
    const anchor = document.getElementById('purpose-text') || document.getElementById('help-text');
    if (!anchor) return;
    el = document.createElement('p');
    el.id = 'proxy-marker';
    el.className = 'proxy-marker';
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }
  const owner = q.respondent || 'any';
  if (owner !== 'any' && owner !== state.activeRole && PROXY_COPY[owner]) {
    el.innerHTML = PROXY_COPY[owner];
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function renderQuestion() {
  const q = state.currentQuestions[state.currentQuestionIndex];
  if (!q) return;

  state.currentValue = null;

  document.getElementById('question-counter').textContent =
    `Question ${state.currentQuestionIndex + 1} of ${state.currentQuestions.length}`;
  document.getElementById('question-text').textContent = questionText(q);
  document.getElementById('help-text').textContent = questionHelpText(q);

  // Admin-only purpose: shown when the user identified as a Coding Agent Admin
  // via STRAT_000b. The field is optional on questions; render container
  // empty when missing or when the user is not an admin.
  const isAdmin = isAdminOperator();
  let purposeEl = document.getElementById('purpose-text');
  if (!purposeEl) {
    const helpEl = document.getElementById('help-text');
    if (helpEl) {
      purposeEl = document.createElement('p');
      purposeEl.id = 'purpose-text';
      purposeEl.className = 'purpose-text';
      helpEl.parentNode.insertBefore(purposeEl, helpEl.nextSibling);
    }
  }
  if (purposeEl) {
    if (isAdmin && q.purposeText) {
      purposeEl.innerHTML = '<span class="purpose-label">WHY WE ASK</span> ' + q.purposeText;
      purposeEl.style.display = '';
    } else {
      purposeEl.style.display = 'none';
    }
  }
  renderProxyMarker(q);
  const skipBtn = document.getElementById('btn-skip');
  skipBtn.style.display = q.required ? 'none' : '';
  // When the app can infer a default for a skipped optional question, say so
  // on the control itself so skipping feels safe rather than lossy.
  skipBtn.textContent = q.inferredNote ? `Skip — we'll infer: ${q.inferredNote}` : 'Skip';

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
          <label class="choice-item" onclick="toggleMulti(event, this, '${o.key}')">
            <input type="checkbox" value="${o.key}" tabindex="-1">
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

  // Pre-fill any existing answer so the user sees their prior choice when
  // navigating back or revisiting a question.
  prefillExistingAnswer(q);

  // Back button visibility: enabled when there's an earlier question to go to
  // in this dimension.
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    const hasEarlier = state.currentQuestionIndex > 0;
    backBtn.style.visibility = hasEarlier ? 'visible' : 'hidden';
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
  hideValidationHint();
}

function prefillExistingAnswer(q) {
  const existing = state.answers[q.id];
  if (!existing) return;
  const value = existing.value;
  switch (q.type) {
    case 'free_text': {
      const input = document.getElementById('text-answer');
      if (input) {
        input.value = String(value ?? '');
        state.currentValue = input.value;
      }
      break;
    }
    case 'single_choice':
    case 'yes_no': {
      const items = document.querySelectorAll('#answer-input .choice-item');
      items.forEach((el) => {
        const input = el.querySelector('input');
        const optionKey = input?.value;
        const matches = optionKey !== undefined && (
          String(optionKey).toLowerCase() === String(value).toLowerCase()
          || (q.type === 'yes_no' && ((value === true && optionKey === 'true') || (value === false && optionKey === 'false')))
        );
        if (matches) {
          el.classList.add('selected');
          if (input) input.checked = true;
          state.currentValue = q.type === 'yes_no' ? value : optionKey;
        }
      });
      break;
    }
    case 'multi_choice': {
      const arr = Array.isArray(value) ? value : [];
      state.currentValue = [...arr];
      const items = document.querySelectorAll('#answer-input .choice-item');
      items.forEach((el) => {
        const cb = el.querySelector('input[type="checkbox"]');
        const optionKey = cb?.value;
        if (optionKey !== undefined && arr.some((v) => String(v).toLowerCase() === String(optionKey).toLowerCase())) {
          el.classList.add('selected');
          if (cb) cb.checked = true;
        }
      });
      break;
    }
    case 'scale': {
      const items = document.querySelectorAll('#answer-input .scale-item');
      items.forEach((el) => {
        if (el.textContent.trim() === String(value)) {
          el.classList.add('selected');
          state.currentValue = Number(value);
        }
      });
      break;
    }
  }
}

function previousQuestion() {
  // Find the nearest earlier question in this dimension (skipping nothing —
  // the user may want to revisit a Skip-ed question too).
  if (state.currentQuestionIndex <= 0) return;
  state.currentQuestionIndex = state.currentQuestionIndex - 1;
  renderQuestion();
}

function selectChoice(el, value) {
  el.closest('.choice-group').querySelectorAll('.choice-item').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.currentValue = value;
  hideValidationHint();
}

function toggleMulti(event, el, value) {
  // The label wraps the checkbox, so the browser would otherwise forward
  // the click to the checkbox and toggle it. We manage state ourselves to
  // keep the checkbox tick, the .selected class, and state.currentValue
  // in sync — preventing the default forwarding stops a double-toggle.
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const nowSelected = !el.classList.contains('selected');
  el.classList.toggle('selected', nowSelected);
  const cb = el.querySelector('input[type="checkbox"]');
  if (cb) cb.checked = nowSelected;

  if (!Array.isArray(state.currentValue)) state.currentValue = [];
  if (nowSelected) {
    if (!state.currentValue.includes(value)) state.currentValue.push(value);
  } else {
    state.currentValue = state.currentValue.filter(v => v !== value);
  }
  hideValidationHint();
}

function selectScale(el, value) {
  el.closest('.scale-group').querySelectorAll('.scale-item').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.currentValue = value;
  hideValidationHint();
}

function showValidationHint(q) {
  const card = document.getElementById('question-card');
  if (!card) return;
  let hint = document.getElementById('validation-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'validation-hint';
    hint.className = 'validation-hint';
    const nav = card.querySelector('.question-nav');
    if (nav) card.insertBefore(hint, nav);
    else card.appendChild(hint);
  }
  const message = q && q.type === 'multi_choice'
    ? 'Pick at least one option to continue.'
    : q && q.type === 'free_text'
      ? 'Please type an answer to continue.'
      : 'Select an option to continue.';
  hint.textContent = message;
  hint.style.display = 'block';
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

function hideValidationHint() {
  const hint = document.getElementById('validation-hint');
  if (hint) hint.style.display = 'none';
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
    showValidationHint(q);
    return;
  }
  hideValidationHint();

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

  // Re-fetch visible questions (the answer just stored may have changed
  // which downstream questions are visible — branching). Keep the full
  // visible list so the counter reflects the whole dimension; navigate by
  // index, skipping already-answered entries.
  const dim = state.dimensions[state.currentDimIndex];
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dimension: dim.name, answers: state.answers }),
  });
  state.currentQuestions = scopeQuestions(await res.json());

  // If the user was editing from the dimension review, return to the review
  // after their change is recorded rather than auto-advancing.
  if (state.editingFromReview) {
    state.editingFromReview = false;
    showDimensionReview();
    return;
  }

  const nextIdx = findNextUnansweredIndex(state.currentQuestionIndex + 1);
  if (nextIdx === -1) {
    // No more unanswered questions in this dimension — show the review step.
    showDimensionReview();
  } else {
    state.currentQuestionIndex = nextIdx;
    renderQuestion();
  }
}

function skipQuestion() {
  const nextIdx = findNextUnansweredIndex(state.currentQuestionIndex + 1);
  if (nextIdx === -1) {
    showDimensionReview();
  } else {
    state.currentQuestionIndex = nextIdx;
    renderQuestion();
  }
}

// ─── Dimension review step ───
//
// After every question in a dimension has been answered (or skipped) the
// user sees a per-dimension review before advancing. They can click any
// answer to edit it; doing so returns to that question and, after Continue,
// brings them back to this review instead of auto-advancing.

function showDimensionReview() {
  const dim = state.dimensions[state.currentDimIndex];
  const card = document.getElementById('question-card');
  const review = document.getElementById('dimension-review');
  if (!review) return;

  card.style.display = 'none';
  review.style.display = 'block';

  const title = document.getElementById('dim-review-title');
  if (title) title.textContent = `Review your answers · ${dim.name}`;

  const list = document.getElementById('dim-review-list');
  if (!list) return;

  // Build a row per visible question. Use the current `state.currentQuestions`
  // which is the full visible list for this dimension.
  list.innerHTML = state.currentQuestions.map((q) => {
    const ans = state.answers[q.id];
    const summary = formatAnswerSummary(q, ans);
    const answered = ans !== undefined;
    return `
      <div class="dim-review-row${answered ? '' : ' unanswered'}" onclick="editAnswerFromReview('${q.id}')">
        <div class="dim-review-row-main">
          <div class="dim-review-question">${escapeHtml(questionText(q))}</div>
          <div class="dim-review-answer">${answered ? escapeHtml(summary) : 'Not answered'}</div>
        </div>
        <div class="dim-review-edit">Change</div>
      </div>
    `;
  }).join('');

  // Non-blocking consistency check: warn + suggest a fix for typed answers
  // that contradict earlier answers. Fire-and-forget so the review renders
  // immediately; warnings populate when the response lands.
  renderDimensionWarnings(list);

  // Mark sidebar dimension as fully filled while we're on the review.
  const progressEl = document.getElementById(`dim-progress-${state.currentDimIndex}`);
  if (progressEl) progressEl.style.width = '100%';

  // Update the next-button copy to name the next dimension if there is one.
  const nextDim = state.dimensions[state.currentDimIndex + 1];
  const btn = document.getElementById('btn-review-continue');
  if (btn) {
    btn.textContent = nextDim ? `Continue · ${nextDim.name}` : 'Continue · Review';
  }
}

// Fetch cross-answer warnings and render any that belong to a question in the
// current dimension, with the suggested fix and a click-to-edit affordance.
async function renderDimensionWarnings(listEl) {
  let box = document.getElementById('dim-review-warnings');
  if (!box) {
    box = document.createElement('div');
    box.id = 'dim-review-warnings';
    box.className = 'dim-review-warnings';
    listEl.parentNode.insertBefore(box, listEl);
  }
  box.innerHTML = '';
  let warnings = [];
  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers }),
    });
    if (res.ok) warnings = (await res.json()).warnings || [];
  } catch (err) { return; }

  const here = new Set(state.currentQuestions.map((q) => q.id));
  const relevant = warnings.filter((w) => here.has(w.questionId));
  if (relevant.length === 0) return;

  box.innerHTML = relevant.map((w) => `
    <div class="dim-review-warning" onclick="editAnswerFromReview('${w.questionId}')">
      <span class="warn-icon">⚠</span>
      <div>
        <div class="warn-message">${escapeHtml(w.message)}</div>
        ${w.suggestion ? `<div class="warn-suggestion">Suggestion: ${escapeHtml(w.suggestion)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// Download the profile report (answers + the app's determinations) as a
// versioned, stamped document. `format` is 'md' or 'json'.
async function downloadProfileReport(format) {
  try {
    const res = await fetch(`/api/profile/report?format=${format === 'json' ? 'json' : 'md'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers, targets: state.targets }),
    });
    if (!res.ok) return;
    const body = format === 'json' ? JSON.stringify(await res.json(), null, 2) : await res.text();
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'json' ? 'embediq-profile.json' : 'embediq-profile.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('Failed to download profile report', err);
  }
}

function formatAnswerSummary(q, ans) {
  if (!ans) return '';
  const v = ans.value;
  if (Array.isArray(v)) {
    const labels = v.map((key) => {
      const opt = (q.options || []).find((o) => o.key === key);
      return opt ? opt.label : String(key);
    });
    return labels.join(', ');
  }
  if (q.options) {
    const opt = q.options.find((o) => String(o.key) === String(v));
    if (opt) return opt.label;
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function editAnswerFromReview(questionId) {
  const idx = state.currentQuestions.findIndex((q) => q.id === questionId);
  if (idx === -1) return;
  state.editingFromReview = true;
  state.currentQuestionIndex = idx;
  document.getElementById('dimension-review').style.display = 'none';
  document.getElementById('question-card').style.display = '';
  renderQuestion();
}

function reviewPreviousQuestion() {
  // From the review, jump back to the last visible question for editing.
  if (state.currentQuestions.length === 0) return;
  state.editingFromReview = true;
  state.currentQuestionIndex = state.currentQuestions.length - 1;
  document.getElementById('dimension-review').style.display = 'none';
  document.getElementById('question-card').style.display = '';
  renderQuestion();
}

async function confirmDimensionAndAdvance() {
  // Hide the review and advance to the next dimension.
  document.getElementById('dimension-review').style.display = 'none';
  document.getElementById('question-card').style.display = '';
  const dimEl = document.getElementById(`dim-${state.currentDimIndex}`);
  if (dimEl) dimEl.classList.add('done');
  await advanceDimension();
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
  // In the gated handoff, the playback doubles as each slice's summary: show
  // the progress stepper and a hand-off / generate CTA appropriate to the role.
  if (state.demoRole) {
    const summaryEl = document.getElementById('profile-summary');
    if (summaryEl) summaryEl.insertAdjacentHTML('afterbegin',
      `<div class="playback-handoff">${renderHandoffStepper(state.demoRole)}</div>`);
  }
  configureHandoffCta();
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

  // Priorities — rendered with categorical labels (Top / High / Moderate /
  // Light) instead of raw confidence percentages. The bar still scales with
  // the underlying confidence so users can see relative intensity at a
  // glance, but the label is the headline. Hover the label to see the raw
  // value for users who want it.
  const prioSection = document.getElementById('priorities-section');
  if (p.priorities?.length) {
    prioSection.innerHTML = `
      <div class="profile-card">
        <h3>Interpreted Priorities</h3>
        ${p.priorities.map((pr, i) => {
          const c = pr.confidence;
          const label = c >= 0.60 ? 'Top'
            : c >= 0.45 ? 'High'
            : c >= 0.30 ? 'Moderate'
            : 'Light';
          const tier = label.toLowerCase();
          const raw = Math.round(c * 100);
          return `
            <div class="priority-item">
              <div class="priority-rank">${i + 1}</div>
              <div class="priority-name">${pr.name}</div>
              <div class="priority-bar" title="Signal intensity ${raw}% of maximum for this category"><div class="priority-fill priority-fill-${tier}" style="width: ${raw}%"></div></div>
              <div class="priority-label priority-label-${tier}" title="${raw}% of maximum signal intensity from your answers across all questions tagged for this priority. Top ≥ 60% · High 45-60% · Moderate 30-45% · Light < 30%.">${label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

function editProfile() {
  // Go back to Q&A — restart from beginning with existing answers preserved
  state.currentDimIndex = 0;
  renderDimensionSidebar();
  loadDimension(0);
  renderScopeBanner();
  showPhase('phase-qa');
}

function stepLabel(role) {
  const s = HANDOFF_STEPS.find(x => x.role === role);
  return s ? s.label : role;
}

// End-of-slice handoff: mark the current role done, advance to the next role's
// slice, and start its Q&A from the top (answered questions are skipped). The
// shared session carries every prior answer forward, so the next role branches
// off them. When there is no next role, fall through to generation.
function advanceToNextRole() {
  markRoleDone(state.demoRole);
  const next = nextRoleAfter(state.demoRole);
  if (!next) { approveAndGenerate(); return; }
  state.demoRole = next;
  state.activeRole = next;
  try { sessionStorage.setItem(DEMO_ROLE_KEY, next); } catch {}
  seedDemoBootstrap();
  state.currentDimIndex = 0;
  startWizard();
}

// On the playback (per-slice summary), swap the primary action: a non-final
// role hands off to the next; the final role (or an unscoped run) generates.
function configureHandoffCta() {
  const actions = document.querySelector('#phase-playback .playback-actions');
  if (!actions) return;
  const heading = document.querySelector('#phase-playback h1');
  const sub = document.querySelector('#phase-playback .subtitle');
  const next = state.demoRole ? nextRoleAfter(state.demoRole) : null;
  const editBtn = '<button class="btn-secondary" onclick="editProfile()">Make Changes</button>';
  if (next) {
    const nextLabel = stepLabel(next);
    if (heading) heading.textContent = `${stepLabel(state.demoRole)} slice complete`;
    if (sub) sub.textContent = `Review the configuration so far, then hand off to the ${nextLabel}.`;
    actions.innerHTML = editBtn
      + `<button class="btn-primary" onclick="advanceToNextRole()">Continue as ${escapeHtml(nextLabel)} →</button>`;
  } else {
    if (heading) heading.textContent = state.demoRole ? 'Everything’s configured' : "Here's what we understand";
    if (sub) sub.textContent = 'Review and adjust before we generate your setup.';
    actions.innerHTML = editBtn
      + '<button class="btn-primary" onclick="approveAndGenerate()">Looks Good — Generate</button>';
  }
}

async function approveAndGenerate() {
  // Find the Looks Good / Generate button to show a loading state while the
  // preview API runs. For complex profiles (healthcare + multi-framework
  // compliance) the orchestrator can take several seconds to produce all
  // generators' output, and the user otherwise sees no feedback.
  const btn = document.querySelector('#phase-playback .btn-primary');
  let originalLabel = '';
  if (btn) {
    originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing your files…';
  }

  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Preview API returned ${res.status}: ${errBody.slice(0, 240)}`);
    }

    const payload = await res.json();
    // /api/preview returns { files, validation } — accept either that shape
    // or a bare files array (older response shape).
    const files = Array.isArray(payload) ? payload : (payload.files || []);

    // Reset the generate-phase chrome to its pre-generation state, in case
    // the user reached this phase before (made changes, came back).
    const heading = document.getElementById('generate-heading');
    if (heading) heading.textContent = 'Ready to Generate';
    const subtitle = document.getElementById('generate-subtitle');
    if (subtitle) subtitle.style.display = '';
    const targetInput = document.getElementById('target-dir-input');
    if (targetInput) targetInput.style.display = '';
    const results = document.getElementById('generation-results');
    if (results) results.classList.add('hidden');
    const liveProgress = document.getElementById('live-progress');
    if (liveProgress) liveProgress.classList.add('hidden');

    const preview = document.getElementById('file-preview');
    preview.classList.remove('hidden');
    preview.innerHTML = `
      <h3 style="padding: 16px 16px 8px; font-size: 14px; color: var(--text-secondary);">
        Files to generate (${files.length})
      </h3>
      ${files.map(f => `
        <div class="file-item" onclick="togglePreview(this, '${encodeURIComponent(f.content || '')}', '${f.path}')">
          <span class="file-icon">${ICONS.doc}</span>
          <span class="file-path">${f.path}</span>
          <span class="file-desc">${f.description || ''}</span>
        </div>
      `).join('')}
    `;

    showPhase('phase-generate');
    renderDelegationPanel();
  } catch (err) {
    console.error('approveAndGenerate failed', err);
    // Surface the error inline so the user can see what happened instead of
    // wondering whether their click did anything.
    const playback = document.getElementById('phase-playback');
    let banner = document.getElementById('approve-error-banner');
    if (!banner && playback) {
      banner = document.createElement('div');
      banner.id = 'approve-error-banner';
      banner.className = 'validation-hint';
      banner.style.display = 'block';
      banner.style.margin = '16px auto';
      banner.style.maxWidth = '640px';
      playback.appendChild(banner);
    }
    if (banner) {
      banner.textContent = `Could not prepare files: ${err instanceof Error ? err.message : String(err)}. Check the browser console for details and try again.`;
      banner.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel || 'Looks Good — Generate';
    }
  }
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
    line.className = 'progress-line progress-line-ok';
    line.innerHTML = `${ICONS.check}<span>${env.payload.relativePath}</span>`;
    progress.appendChild(line);
  } else if (env.name === 'validation:completed') {
    const { passCount, failCount } = env.payload;
    const line = document.createElement('div');
    const isOk = failCount === 0;
    line.className = `progress-line ${isOk ? 'progress-line-ok' : 'progress-line-warn'}`;
    line.innerHTML = isOk
      ? `${ICONS.check}<span>Validation passed (${passCount} checks)</span>`
      : `${ICONS.warn}<span>Validation: ${passCount} passed, ${failCount} failed</span>`;
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

  // The pre-generation preview list and the post-generation result list are
  // two different DOM elements that would otherwise stack visually. Hide the
  // preview now that the real result is in.
  const preview = document.getElementById('file-preview');
  if (preview) preview.classList.add('hidden');

  // Live-progress event stream is also redundant once the final list lands.
  if (progress) progress.classList.add('hidden');

  // Swap the page heading + subtitle from "Ready to Generate" → "Setup
  // Complete" now that generation actually happened. This avoids the
  // confusing pre-generate "Setup Complete" h1.
  const heading = document.getElementById('generate-heading');
  if (heading) heading.textContent = 'Setup Complete';
  const subtitle = document.getElementById('generate-subtitle');
  if (subtitle) subtitle.style.display = 'none';

  // Hide the target-dir input + Generate button once results are in —
  // re-running generation from the same screen would surprise the user.
  const targetInput = document.getElementById('target-dir-input');
  if (targetInput) targetInput.style.display = 'none';

  const results = document.getElementById('generation-results');
  results.classList.remove('hidden');

  const fileList = document.getElementById('file-list');
  fileList.innerHTML = result.files.map(f => `
    <div class="file-item${f.written ? ' file-item-ok' : ' file-item-fail'}">
      <span class="file-icon">${f.written ? ICONS.checkCircle : ICONS.xCircle}</span>
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

// Seed the admin-owned bootstrap (role + proficiency) for a Team Lead /
// Individual fill-role so their slice branches correctly even when they're the
// first to open the wizard. No-op for the admin role (they answer it) and never
// overwrites an answer already present (e.g. carried in from the admin's turn).
function seedDemoBootstrap() {
  if (!state.demoRole || state.demoRole === 'admin') return;
  const seed = (id, value) => {
    if (!state.answers[id]) state.answers[id] = { value, timestamp: new Date().toISOString() };
  };
  seed('STRAT_000', 'developer');
  seed('STRAT_000a', 'advanced');
}

async function initWizard() {
  state.activeRole = readRoleFromUrl();
  state.scoped = new URLSearchParams(window.location.search).has('role');
  // Demo three-role handoff: a persisted fill-role scopes the slice without a
  // delegation link, under one constant owner identity so the shared session
  // carries answers from one role to the next.
  state.demoRole = readDemoRole();
  if (state.demoRole) state.activeRole = state.demoRole;
  seedDemoBootstrap();
  showPhase('phase-welcome');
  await renderIdentityBanner();
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
  seedDemoBootstrap(); // re-seed: the resume may have replaced the answers map
  storeSessionId(state.sessionId);
  writeSessionToUrl(state.sessionId);
  state.resumeView = resume;
  renderResumeBanner(resume);
}

/**
 * Demo-mode persona signin. Sets the `embediq_demo_user` cookie that the
 * DemoAuthStrategy reads on the next request, then reloads the page so the
 * identity banner and downstream auth-gated questions reflect the choice.
 */
function signInDemo(persona) {
  document.cookie = `embediq_demo_user=${encodeURIComponent(persona)}; path=/; max-age=86400; samesite=lax`;
  // Also auto-prefill STRAT_000b so the wizard flow matches the SSO identity
  // (saves the user one click during the demo recording).
  if (persona === 'admin' || persona === 'user') {
    state.answers['STRAT_000b'] = { value: persona, timestamp: new Date().toISOString() };
  }
  window.location.reload();
}

/**
 * Pick a fill-role for the three-role handoff (Admin → Team Lead → Individual).
 * One constant owner identity (admin) carries the shared session through every
 * role; the chosen role only scopes which question slice is shown. Persisted
 * across the reload that establishes the demo identity cookie.
 */
function selectDemoRole(role) {
  document.cookie = `embediq_demo_user=admin; path=/; max-age=86400; samesite=lax`;
  try { sessionStorage.setItem(DEMO_ROLE_KEY, role); } catch {}
  window.location.reload();
}

/**
 * Switch to the other demo persona (admin ↔ user). Reads the current cookie
 * and flips it.
 */
function switchDemoUser() {
  const cookieMatch = document.cookie.match(/embediq_demo_user=([^;]+)/);
  const current = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
  const next = current === 'admin' ? 'user' : 'admin';
  signInDemo(next);
}

async function renderIdentityBanner() {
  // Fetches identity, auto-derives the wizard's admin/user answer from the
  // authenticated role (so STRAT_000b doesn't have to ask the user something
  // they already told us by signing in), populates the header profile menu,
  // and renders the welcome-screen banner (simplified — the header menu now
  // carries the persistent identity, the banner just covers demo-mode
  // persona selection when unauthenticated).
  try {
    const res = await fetch('/api/identity');
    if (!res.ok) return;
    const id = await res.json();
    state.identity = id;

    // Auto-derive STRAT_000b from auth role. wizard-admin → admin, wizard-user
    // → user. This skips the redundant in-wizard question for authenticated
    // users. If the user is unauthenticated (no SSO, or demo-mode without a
    // chosen persona), the wizard still asks STRAT_000b like before.
    if (id.authenticated && Array.isArray(id.roles)) {
      const persona = id.roles.includes('wizard-admin') ? 'admin'
        : id.roles.includes('wizard-user') || id.roles.includes('wizard-contributor') ? 'user'
        : null;
      if (persona) {
        state.answers['STRAT_000b'] = {
          value: persona,
          timestamp: new Date().toISOString(),
          source: 'auth',
        };
      }
    }

    renderHeaderProfile(id);
    renderWelcomeIdentityBanner(id);
  } catch (err) {
    // Best-effort — don't block the wizard if the identity endpoint fails.
    console.warn('Failed to load identity', err);
  }
}

function renderHeaderProfile(id) {
  const wrapper = document.getElementById('user-profile');
  if (!wrapper) return;
  if (!id.authenticated) {
    wrapper.style.display = 'none';
    return;
  }
  const name = id.displayName || id.userId || 'User';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  document.getElementById('user-profile-initial').textContent = initial;
  document.getElementById('user-profile-name').textContent = name;
  const isAdmin = id.roles && id.roles.includes('wizard-admin');
  document.getElementById('user-profile-role').innerHTML =
    `<span class="user-profile-role-badge ${isAdmin ? 'admin' : 'user'}">${isAdmin ? 'Coding Agent Admin' : 'Coding Agent User'}</span>${id.authStrategy === 'demo' ? ' <span class="demo-badge">ACME Corp</span>' : ''}`;
  document.getElementById('user-profile-email').textContent = id.email || id.userId || '';
  document.getElementById('user-profile-switch-icon').innerHTML = ICONS.target;
  document.getElementById('user-profile-signout-icon').innerHTML = ICONS.xCircle;
  wrapper.style.display = '';
}

function renderWelcomeIdentityBanner(id) {
  // The welcome-screen banner is now only used for the demo-mode
  // persona-picker (when unauthenticated) and the device info. Persistent
  // identity lives in the header profile menu.
  const banner = document.getElementById('identity-banner');
  if (!banner) return;

  // Demo strategy: the explicit three-role handoff stepper (Admin → Team Lead →
  // Individual). It doubles as the role switcher; the active step is the
  // current fill-role. Shown whether or not a role has been picked yet.
  if (id.authStrategy === 'demo') {
    banner.innerHTML = renderHandoffStepper(state.demoRole)
      + (id.authenticated ? (renderDeviceLine(id) || '') : '');
    banner.style.display = '';
    return;
  }

  // Authenticated (non-demo): just surface the device line (header profile
  // carries identity).
  if (id.authenticated) {
    const deviceLine = renderDeviceLine(id);
    if (deviceLine) {
      banner.innerHTML = deviceLine;
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }
    return;
  }

  // Unauthenticated + no auth strategy configured: explain why.
  const userLine = `<div class="identity-user"><span class="identity-icon">${ICONS.shield}</span>
    <span>No enterprise sign-in active
      <span class="identity-help" title="EmbedIQ supports HTTP Basic, OIDC (Okta / Entra / Auth0 / any compliant IdP), and reverse-proxy header strategies. Set EMBEDIQ_AUTH_STRATEGY=oidc and the OIDC env vars to enable SSO. Set EMBEDIQ_AUTH_STRATEGY=demo to enable the admin/user demo personas. Currently running in local mode — auth=${escapeHtml(id.authStrategy)}.">why?</span>
    </span></div>`;
  banner.innerHTML = userLine + (renderDeviceLine(id) || '');
  banner.style.display = '';
}

// The three-role handoff: Admin sets policy, hands to the Team Lead for the
// project/tech, then to the Individual for per-seat preferences. One owner
// identity fills each slice in turn; clicking a step switches the fill-role.
const HANDOFF_STEPS = [
  { role: 'admin', label: 'Admin', desc: 'Security & policy' },
  { role: 'lead', label: 'Team Lead', desc: 'Project & tech' },
  { role: 'individual', label: 'Individual', desc: 'Your preferences' },
];

function renderHandoffStepper(active) {
  const done = doneRoles();
  const steps = HANDOFF_STEPS
    .map((s, i) => {
      const isDone = done.includes(s.role);
      const isActive = s.role === active;
      const unlocked = roleUnlocked(s.role);
      const cls = ['handoff-step'];
      if (isActive) cls.push('active');
      if (isDone) cls.push('done');
      if (!unlocked) cls.push('locked');
      const num = isDone ? '✓' : (i + 1);
      const prevLabel = i > 0 ? HANDOFF_STEPS[i - 1].label : '';
      const attrs = unlocked
        ? `onclick="selectDemoRole('${s.role}')"`
        : `disabled aria-disabled="true" title="Complete the ${prevLabel} step first"`;
      return `<button type="button" class="${cls.join(' ')}" ${attrs} aria-current="${isActive}">`
        + `<span class="handoff-num">${num}</span>`
        + `<span class="handoff-label">${s.label}</span>`
        + `<span class="handoff-desc">${s.desc}</span></button>`;
    })
    .join('<span class="handoff-arrow" aria-hidden="true">→</span>');
  const activeStep = HANDOFF_STEPS.find(s => s.role === active);
  const caption = activeStep
    ? `Filling as <strong>${activeStep.label}</strong> — finish this slice to unlock the next`
    : 'Roles unlock in order — start as the Admin, then hand off to the Team Lead and Individual';
  return `<div class="handoff"><div class="handoff-caption">${caption}</div>`
    + `<div class="handoff-stepper">${steps}</div></div>`;
}

function renderDeviceLine(id) {
  if (id.deviceVerification === 'mdm-header') {
    return `<div class="identity-device">
      <span class="identity-device-label">Device</span>
      <code>${escapeHtml(id.workstationId)}</code>
      <span class="identity-verified" title="Workstation ID supplied by a managed reverse proxy or MDM agent.">verified by MDM</span>
    </div>`;
  }
  if (id.deviceVerification === 'os-hostname' && id.host) {
    const platformLabel =
      id.host.platform === 'darwin' ? 'macOS' :
      id.host.platform === 'win32' ? 'Windows' :
      id.host.platform === 'linux' ? 'Linux' :
      id.host.platform;
    return `<div class="identity-device">
      <span class="identity-device-label">Device</span>
      <code>${escapeHtml(id.host.hostname)}</code>
      <span class="identity-device-os">${escapeHtml(platformLabel)} ${escapeHtml(id.host.release)} · ${escapeHtml(id.host.arch)}</span>
      ${id.host.username ? `<span class="identity-device-user">${escapeHtml(id.host.username)}</span>` : ''}
      <span class="identity-unverified" title="Browsers cannot access hardware serial numbers. To get MDM-verified device identity (Intune / JAMF / CrowdStrike registration), configure your managed reverse proxy to inject an X-Workstation-Id header.">local hostname</span>
    </div>`;
  }
  const ua = id.userAgent || '';
  const browser =
    ua.includes('Firefox') ? 'Firefox' :
    ua.includes('Edg/') ? 'Edge' :
    ua.includes('Chrome') ? 'Chrome' :
    ua.includes('Safari') ? 'Safari' : 'Browser';
  const platform =
    ua.includes('Mac OS X') ? 'macOS' :
    ua.includes('Windows') ? 'Windows' :
    ua.includes('Linux') ? 'Linux' : 'unknown OS';
  return `<div class="identity-device">
    <span class="identity-device-label">Device</span>
    <code>${escapeHtml(browser)} on ${escapeHtml(platform)}</code>
    <span class="identity-unverified" title="Hardware serial numbers and device IDs are not available to browsers. To get verifiable device identity, your IT team can configure a managed reverse proxy (or an MDM agent like Intune / JAMF / CrowdStrike) to inject an X-Workstation-Id header on every request.">unverified — see details</span>
  </div>`;
}

// ─── Header user-profile menu ───

function toggleProfileMenu() {
  const menu = document.getElementById('user-profile-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function switchAccount() {
  // Re-show the demo-mode handoff picker: clear the cookie + handoff progress and reload.
  document.cookie = 'embediq_demo_user=; path=/; max-age=0; samesite=lax';
  clearHandoffProgress();
  // Also clear the auto-set STRAT_000b so the wizard re-asks (or re-derives) after a fresh signin.
  if (state.answers['STRAT_000b'] && state.answers['STRAT_000b'].source === 'auth') {
    delete state.answers['STRAT_000b'];
  }
  window.location.reload();
}

function signOut() {
  document.cookie = 'embediq_demo_user=; path=/; max-age=0; samesite=lax';
  clearHandoffProgress();
  storeSessionId(null);
  writeSessionToUrl(null);
  window.location.reload();
}

// Close the profile menu when clicking outside it.
document.addEventListener('click', (e) => {
  const menu = document.getElementById('user-profile-menu');
  const avatar = document.getElementById('user-profile-avatar');
  if (!menu || !avatar) return;
  if (menu.style.display === 'none') return;
  if (avatar.contains(e.target) || menu.contains(e.target)) return;
  menu.style.display = 'none';
});

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

const ROLE_LABEL = { admin: 'Admin (policy)', lead: 'Team Lead', individual: 'Individual' };

// Banner shown in a delegation (scoped) view so the delegate knows they're
// only being asked their slice. Called when entering the Q&A phase.
function renderScopeBanner() {
  const el = document.getElementById('scope-banner');
  if (!el) return;
  if (!state.scoped && !state.demoRole) { el.style.display = 'none'; return; }
  const r = state.activeRole;
  el.innerHTML = `<strong>${ROLE_LABEL[r] || r} questions.</strong> `
    + `You're filling the ${ROLE_LABEL[r] || r} slice of this configuration — `
    + `only the questions you're positioned to answer are shown. Your answers are attributed to you.`;
  el.style.display = '';
}

// Admin "Assign & delegate" panel + live per-role dashboard on the generate
// screen. Hidden in scoped (delegate) views and when sessions are off.
async function renderDelegationPanel() {
  const panel = document.getElementById('delegation-panel');
  if (!panel) return;
  // Only the Admin assigns/delegates; hide for the Team Lead / Individual slices.
  if (state.scoped || (state.demoRole && state.demoRole !== 'admin')
      || !state.serverBackend || !state.sessionId) { panel.style.display = 'none'; return; }
  let data;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(state.sessionId)}/assignments`);
    if (!res.ok) { panel.style.display = 'none'; return; }
    data = await res.json();
  } catch { panel.style.display = 'none'; return; }

  const byRole = Object.fromEntries((data.completion || []).map(c => [c.role, c]));
  const assignmentByRole = Object.fromEntries((data.assignments || []).map(a => [a.role, a]));
  const origin = window.location.origin;

  const row = (role) => {
    const c = byRole[role] || { answered: 0, visible: 0, status: 'pending', contributors: [] };
    const a = assignmentByRole[role];
    const link = a ? origin + a.link : '';
    const who = c.contributors.length ? ` · by ${c.contributors.map(escapeHtml).join(', ')}` : '';
    const actions = role === 'admin'
      ? '<span class="deleg-self">you</span>'
      : a
        ? `<button class="btn-secondary btn-xs" onclick="copyDelegationLink('${role}')">Copy link</button>`
        : `<button class="btn-secondary btn-xs" onclick="createAssignment('${role}')">Assign &amp; get link</button>`;
    return `
      <div class="deleg-row">
        <div class="deleg-role">${ROLE_LABEL[role]}</div>
        <div class="deleg-prog"><span class="deleg-badge deleg-${c.status}">${c.status.replace('_',' ')}</span>
          ${c.answered}/${c.visible}${who}</div>
        <div class="deleg-act">${actions}</div>
        ${a && link ? `<input class="deleg-link" readonly value="${escapeHtml(link)}" onclick="this.select()">` : ''}
      </div>`;
  };

  panel.innerHTML = `
    <h3>Delegate the rest</h3>
    <p class="deleg-help">You answered the policy slice. The project, problem, tech and innovation questions are best answered by your <strong>Team Lead</strong>; per-seat preferences by an <strong>Individual</strong>. Assign each to generate a link they open to fill only their part.</p>
    ${['admin','lead','individual'].map(row).join('')}`;
  panel.style.display = '';
}

async function createAssignment(role) {
  if (!state.sessionId) return;
  const assigneeLabel = prompt(`Email or name for the ${ROLE_LABEL[role]} (optional):`) || undefined;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(state.sessionId)}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, assigneeLabel }),
    });
    if (res.ok) await renderDelegationPanel();
  } catch (err) { console.warn('assign failed', err); }
}

async function copyDelegationLink(role) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(state.sessionId)}/assignments`);
    const data = await res.json();
    const a = (data.assignments || []).find(x => x.role === role);
    if (!a) return;
    const link = window.location.origin + a.link;
    await navigator.clipboard.writeText(link);
    // brief visual confirmation
    await renderDelegationPanel();
  } catch (err) { console.warn('copy failed', err); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

initWizard();
