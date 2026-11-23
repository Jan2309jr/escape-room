const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const GM_PASSWORD = process.env.GM_PASSWORD;
const GM_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const gmSessions = new Map();
const gmLoginAttempts = new Map();
const TEAM_IDS = (process.env.TEAM_IDS || '')
  .split(',')
  .map((id) => id.trim().toUpperCase())
  .filter(Boolean);
const allowedTeamIds = TEAM_IDS.length > 0 ? new Set(TEAM_IDS) : null;
const MAX_TEAMS = Number(process.env.MAX_TEAMS) || 500;

const gmSessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of gmSessions) {
    if (expiresAt <= now) gmSessions.delete(token);
  }
  for (const [key, attempt] of gmLoginAttempts) {
    if (attempt.resetAt <= now) gmLoginAttempts.delete(key);
  }
}, 60 * 1000);
gmSessionCleanup.unref();

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function getISTTimestamp(date = new Date()) {
  try {
    const timeStr = date.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${timeStr} IST`;
  } catch (e) {
    return `${date.toTimeString().split(' ')[0]} IST`;
  }
}

let teams = {};
try {
  if (fs.existsSync(TEAMS_FILE)) {
    teams = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf-8'));
  }
} catch (e) {
  console.warn('Could not load existing teams.json, starting fresh.', e.message);
  teams = {};
}

let saveTimeout = null;
let persistenceQueue = Promise.resolve();

function writeTeamsSnapshot() {
  if (!saveTimeout) return persistenceQueue;
  clearTimeout(saveTimeout);
  saveTimeout = null;
  const snapshot = JSON.stringify(teams, null, 2);
  const tempFile = `${TEAMS_FILE}.tmp`;
  persistenceQueue = persistenceQueue
    .then(() => new Promise((resolve, reject) => {
      fs.writeFile(tempFile, snapshot, (writeError) => {
        if (writeError) {
          reject(writeError);
          return;
        }
        fs.rename(tempFile, TEAMS_FILE, (renameError) => {
          if (renameError) reject(renameError);
          else resolve();
        });
      });
    }))
    .catch((error) => {
      console.error('Failed to persist teams.json', error);
    });
  return persistenceQueue;
}

function persistTeams() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    writeTeamsSnapshot();
  }, 300);
}

function normalizeTeamId(value) {
  const id = (value || '').toString().trim().toUpperCase();
  return /^[A-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

function validateTeamId(req, res, next) {
  const id = normalizeTeamId(req.params.id || req.body?.teamId);
  if (!id) {
    return res.status(400).json({ error: 'Invalid team ID.' });
  }
  if (allowedTeamIds && !allowedTeamIds.has(id)) {
    return res.status(403).json({ error: 'Team ID is not allowed.' });
  }
  req.teamId = id;
  next();
}

function validatePublicPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ('stage' in value && (!Number.isInteger(value.stage) || value.stage < 0 || value.stage > 6)) return false;
  if ('timerSeconds' in value && (!Number.isFinite(value.timerSeconds) || value.timerSeconds < 0 || value.timerSeconds > 3600)) return false;
  if ('finalReasoning' in value && value.finalReasoning !== null &&
      (typeof value.finalReasoning !== 'string' || value.finalReasoning.length > 20000)) return false;
  if ('haltReason' in value && typeof value.haltReason !== 'string') return false;
  if ('finalizations' in value && (!Array.isArray(value.finalizations) || value.finalizations.length > 3)) return false;
  if ('event' in value && value.event !== null) {
    if (typeof value.event !== 'object' || Array.isArray(value.event)) return false;
    if (value.event.type && (typeof value.event.type !== 'string' || value.event.type.length > 100)) return false;
    if (value.event.message && (typeof value.event.message !== 'string' || value.event.message.length > 2000)) return false;
  }
  return true;
}

function initTeam(id) {
  if (!teams[id]) {
    if (Object.keys(teams).length >= MAX_TEAMS) {
      throw new Error('Team capacity reached.');
    }
    teams[id] = {
      teamId: id,
      stage: 0,
      gameHalted: false,
      haltReason: null,
      haltTimestamp: null,
      startTime: null,
      timerSeconds: 3600,
      timerRunning: true,
      timerExpired: false,
      gmCommandId: 0,
      gmCommand: null,
      finalizations: [],
      finalMurderer: null,
      finalReasoning: null,
      finalSubmissionTimestamp: null,
      wipeStopped: false,
      lastSeen: getISTTimestamp(),
      lastSeenMs: Date.now(),
      events: [],
      lastEvent: null,
      lastUpdate: getISTTimestamp()
    };
  }
  return teams[id];
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

function getCookie(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  const cookie = cookies.find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? cookie.trim().slice(name.length + 1) : '';
}

function hasGmSession(req) {
  const token = getCookie(req, 'epoch_gm_session');
  const expiresAt = gmSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    gmSessions.delete(token);
    return false;
  }
  return true;
}

function requireGm(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!hasGmSession(req)) {
    return res.status(401).json({ error: 'Game Master authentication required.' });
  }
  next();
}

function passwordsMatch(candidate, expected) {
  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

function setGmCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `epoch_gm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

app.post('/api/gm/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!GM_PASSWORD) {
    return res.status(503).json({ error: 'GM access is not configured. Set GM_PASSWORD on the server.' });
  }

  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  const key = req.ip || 'unknown';
  const now = Date.now();
  const attempt = gmLoginAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 10) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  if (!passwordsMatch(password, GM_PASSWORD)) {
    gmLoginAttempts.set(key, {
      count: ((attempt && attempt.resetAt > now ? attempt.count : 0) + 1),
      resetAt: attempt && attempt.resetAt > now ? attempt.resetAt : now + 15 * 60 * 1000
    });
    return res.status(401).json({ error: 'Incorrect GM password.' });
  }
  gmLoginAttempts.delete(key);

  const token = crypto.randomBytes(32).toString('hex');
  gmSessions.set(token, Date.now() + GM_SESSION_DURATION_MS);
  setGmCookie(res, token, GM_SESSION_DURATION_MS / 1000);
  res.json({ ok: true });
});

app.post('/api/gm/logout', requireGm, (req, res) => {
  gmSessions.delete(getCookie(req, 'epoch_gm_session'));
  setGmCookie(res, '', 0);
  res.json({ ok: true });
});

// API endpoint for health check / status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    game: 'THE EPOCH — EscapeServer',
    version: '2.0.0',
    timestamp: getISTTimestamp()
  });
});

// Central multi-team event endpoint
app.post('/api/event', (req, res) => {
  const body = req.body || {};
  if (!validatePublicPayload(body)) {
    return res.status(400).json({ error: 'Invalid team event payload.' });
  }
  const id = normalizeTeamId(body.teamId);
  if (!id) return res.status(400).json({ error: 'Invalid team ID.' });
  if (allowedTeamIds && !allowedTeamIds.has(id)) {
    return res.status(403).json({ error: 'Team ID is not allowed.' });
  }

  const { stage, startTime, timerSeconds, timerRunning, timerExpired, event, gameHalted, haltReason, haltTimestamp, finalMurderer, finalReasoning, finalSubmissionTimestamp, finalizations } = body;
  let t;
  try {
    t = initTeam(id);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  t.stage = stage !== undefined ? stage : t.stage;
  t.startTime = startTime !== undefined ? startTime : t.startTime;
  t.timerSeconds = timerSeconds !== undefined ? timerSeconds : t.timerSeconds;
  t.timerRunning = timerRunning !== undefined ? timerRunning : t.timerRunning;
  t.timerExpired = timerExpired !== undefined ? timerExpired : t.timerExpired;
  t.gameHalted = gameHalted !== undefined ? gameHalted : t.gameHalted;
  t.haltReason = haltReason !== undefined ? haltReason : t.haltReason;
  t.haltTimestamp = haltTimestamp !== undefined ? haltTimestamp : t.haltTimestamp;
  t.finalMurderer = finalMurderer !== undefined ? finalMurderer : t.finalMurderer;
  t.finalReasoning = finalReasoning !== undefined ? finalReasoning : t.finalReasoning;
  t.finalSubmissionTimestamp = finalSubmissionTimestamp !== undefined ? finalSubmissionTimestamp : t.finalSubmissionTimestamp;
  if (Array.isArray(finalizations)) t.finalizations = finalizations;
  t.lastUpdate = getISTTimestamp();
  t.lastSeen = t.lastUpdate;
  t.lastSeenMs = Date.now();

  if (event) {
    if (!event.clock) event.clock = getISTTimestamp();
    t.events.push(event);
    if (t.events.length > 500) t.events.shift();
    t.lastEvent = event;
  }

  persistTeams();
  res.json({ ok: true });
});

// Player clients only need halt state; private submissions and event logs stay GM-only.
app.get('/api/teams/:id/status', (req, res) => {
  const id = normalizeTeamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid team ID.' });
  if (allowedTeamIds && !allowedTeamIds.has(id)) {
    return res.status(403).json({ error: 'Team ID is not allowed.' });
  }
  let t;
  try {
    t = initTeam(id);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  t.lastSeen = getISTTimestamp();
  t.lastSeenMs = Date.now();
  res.set('Cache-Control', 'no-store');
  res.json({
    teamId: t.teamId,
    stage: t.stage,
    startTime: t.startTime,
    timerSeconds: t.timerSeconds,
    timerRunning: t.timerRunning !== false,
    timerExpired: !!t.timerExpired,
    gmCommand: t.gmCommand || null,
    gameHalted: t.gameHalted,
    haltReason: t.haltReason,
    haltTimestamp: t.haltTimestamp,
    lastUpdate: t.lastUpdate,
    lastSeen: t.lastSeen,
    lastSeenMs: t.lastSeenMs
  });
});

// Sync full team status
app.post('/api/teams/:id/status', (req, res) => {
  const id = normalizeTeamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid team ID.' });
  if (allowedTeamIds && !allowedTeamIds.has(id)) {
    return res.status(403).json({ error: 'Team ID is not allowed.' });
  }
  const data = req.body || {};
  if (!validatePublicPayload(data)) {
    return res.status(400).json({ error: 'Invalid team status payload.' });
  }
  let t;
  try {
    t = initTeam(id);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  Object.assign(t, {
    stage: data.stage !== undefined ? data.stage : t.stage,
    gameHalted: data.gameHalted !== undefined ? data.gameHalted : t.gameHalted,
    haltReason: data.haltReason !== undefined ? data.haltReason : t.haltReason,
    haltTimestamp: data.haltTimestamp !== undefined ? data.haltTimestamp : t.haltTimestamp,
    startTime: data.startTime !== undefined ? data.startTime : t.startTime,
    timerSeconds: data.timerSeconds !== undefined ? data.timerSeconds : t.timerSeconds,
    timerRunning: data.timerRunning !== undefined ? data.timerRunning : t.timerRunning,
    timerExpired: data.timerExpired !== undefined ? data.timerExpired : t.timerExpired,
    finalMurderer: data.finalMurderer !== undefined ? data.finalMurderer : t.finalMurderer,
    finalReasoning: data.finalReasoning !== undefined ? data.finalReasoning : t.finalReasoning,
    finalSubmissionTimestamp: data.finalSubmissionTimestamp !== undefined ? data.finalSubmissionTimestamp : t.finalSubmissionTimestamp,
    wipeStopped: data.wipeStopped !== undefined ? data.wipeStopped : t.wipeStopped,
    lastSeen: getISTTimestamp(),
    lastSeenMs: Date.now(),
    lastUpdate: getISTTimestamp()
  });

  if (Array.isArray(data.finalizations)) t.finalizations = data.finalizations;

  persistTeams();
  res.json({ ok: true });
});

// GM action: Resume a halted team session
app.post('/api/teams/:id/resume', requireGm, validateTeamId, (req, res) => {
  const id = req.teamId;
  const t = initTeam(id);

  t.gameHalted = false;
  t.haltReason = null;
  t.haltTimestamp = null;
  t.lastUpdate = getISTTimestamp();

  const resumeEvent = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    clock: getISTTimestamp(),
    teamId: id,
    type: 'GM_RESUME',
    message: `GM cleared halt state for Team ${id}. Game resumed.`,
    meta: { organizerAction: 'RESUME_GAME' }
  };

  t.events.push(resumeEvent);
  if (t.events.length > 500) t.events.shift();
  t.lastEvent = resumeEvent;

  persistTeams();
  res.json({ ok: true });
});

app.post('/api/teams/:id/control', requireGm, validateTeamId, (req, res) => {
  const id = req.teamId;
  const team = initTeam(id);
  const { type, action } = req.body || {};
  const stageActions = ['RESET', 'SLOT1', 'SLOT2', 'NETTRACE_CCTV', 'SLOT3', 'FINAL', 'SOLVED'];
  const timerActions = ['pause', 'resume', 'add5', 'sub5', 'reset60'];

  if (!((type === 'stage' && stageActions.includes(action)) || (type === 'timer' && timerActions.includes(action)))) {
    return res.status(400).json({ error: 'Invalid team control command.' });
  }

  if (type === 'stage' && action === 'RESET') {
    Object.assign(team, {
      stage: 0,
      gameHalted: false,
      haltReason: null,
      haltTimestamp: null,
      startTime: null,
      timerSeconds: 3600,
      timerRunning: true,
      timerExpired: false,
      finalizations: [],
      finalMurderer: null,
      finalReasoning: null,
      finalSubmissionTimestamp: null,
      wipeStopped: false
    });
  } else if (type === 'timer') {
    const remaining = team.timerRunning && Number.isFinite(team.startTime)
      ? Math.max(0, 3600 - Math.floor((Date.now() - team.startTime) / 1000))
      : Math.max(0, Number(team.timerSeconds) || 0);

    if (action === 'pause') {
      team.timerSeconds = remaining;
      if (Number.isFinite(team.startTime)) team.startTime = Date.now() - (3600 - remaining) * 1000;
      team.timerRunning = false;
    } else if (action === 'resume') {
      if (!team.timerExpired) team.timerRunning = true;
    } else if (action === 'reset60') {
      team.startTime = Date.now();
      team.timerSeconds = 3600;
      team.timerExpired = false;
    } else {
      const adjustment = action === 'add5' ? 300 : -300;
      team.timerSeconds = Math.max(0, remaining + adjustment);
      team.startTime = Date.now() - (3600 - team.timerSeconds) * 1000;
      team.timerExpired = team.timerSeconds === 0;
    }
  } else {
    team.stage = action === 'SOLVED' ? 6 : 1;
    team.gameHalted = false;
    team.haltReason = null;
    team.haltTimestamp = null;
    if (action === 'SOLVED') {
      team.timerRunning = false;
      team.wipeStopped = true;
    }
  }

  team.gmCommandId = (Number(team.gmCommandId) || 0) + 1;
  team.gmCommand = { id: team.gmCommandId, type, action };
  team.lastUpdate = getISTTimestamp();
  const controlEvent = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    clock: getISTTimestamp(),
    teamId: id,
    type: 'GM_TEAM_CONTROL',
    message: `GM applied ${type} control "${action}" to Team ${id}.`,
    meta: { type, action }
  };
  team.events.push(controlEvent);
  if (team.events.length > 500) team.events.shift();
  team.lastEvent = controlEvent;

  persistTeams();
  res.json({ ok: true, commandId: team.gmCommandId });
});

// Return summaries by default; submissions are fetched separately to avoid transferring logs.
app.get('/api/teams', requireGm, (req, res) => {
  const view = req.query.view;
  const result = {};
  Object.entries(teams).forEach(([id, team]) => {
    if (view === 'submissions') {
      result[id] = {
        finalMurderer: team.finalMurderer,
        finalReasoning: team.finalReasoning,
        finalSubmissionTimestamp: team.finalSubmissionTimestamp
      };
      return;
    }

    result[id] = {
      teamId: team.teamId,
      stage: team.stage,
      startTime: team.startTime,
      timerSeconds: team.timerSeconds,
      timerRunning: team.timerRunning !== false,
      timerExpired: !!team.timerExpired,
      finalizationCount: Array.isArray(team.finalizations) ? team.finalizations.length : 0,
      gameHalted: team.gameHalted,
      haltReason: team.haltReason,
      haltTimestamp: team.haltTimestamp,
      finalMurderer: team.finalMurderer,
      finalSubmissionTimestamp: team.finalSubmissionTimestamp,
      wipeStopped: team.wipeStopped,
      lastUpdate: team.lastUpdate,
      lastSeen: team.lastSeen || team.lastUpdate,
      lastSeenMs: team.lastSeenMs || null,
      lastEvent: team.lastEvent ? {
        type: team.lastEvent.type,
        clock: team.lastEvent.clock
      } : null
    };
  });
  res.json(result);
});

// Full event history for a single team.
app.get('/api/teams/:id', requireGm, validateTeamId, (req, res) => {
  const id = req.teamId;
  res.json(teams[id] || initTeam(id));
});

app.get('/api/teams/:id/events', requireGm, validateTeamId, (req, res) => {
  const team = teams[req.teamId];
  res.json(team ? team.events : []);
});

app.get('/api/events', requireGm, (req, res) => {
  const events = [];
  Object.values(teams).forEach((team) => {
    if (Array.isArray(team.events)) events.push(...team.events);
  });
  events.sort((left, right) => (Number(right.ts) || 0) - (Number(left.ts) || 0));
  res.json(events.slice(0, 500));
});

app.get('/api/gm/solution', requireGm, (req, res) => {
  res.json([
    { person: 'Ram Sharma', verdict: 'Not culprit', evidence: 'WS-14 authenticated; CCTV shows operator struggling with machine they do not own.' },
    { person: 'Prof. Anand Rao', verdict: 'Not culprit', evidence: 'Left lunch at 5:40 PM; no re-entry recorded that night.' },
    { person: 'Divya Mehta', verdict: 'Not culprit', evidence: 'Exposed permissions earlier; wipe session traces to WS-14, not her login.' },
    { person: 'K. Verma', verdict: 'CULPRIT', evidence: 'Grant ledger funds routed to NULLDEPT; car parked in Slot B-14 during wipe window.' }
  ]);
});

// Organizer utility: clear a single team's server-side record.
app.delete('/api/teams/:id', requireGm, validateTeamId, (req, res) => {
  const id = req.teamId;
  delete teams[id];
  persistTeams();
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload is too large.' });
  }
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'Internal server error.' });
});

if (!GM_PASSWORD) {
  console.warn('GM_PASSWORD is not set. GM login and organizer APIs will remain unavailable.');
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` THE EPOCH — EPOCHCORP ESCAPE SERVER HOST`);
  console.log(` Server active at: http://localhost:${PORT}`);
  console.log(` For other stations on the same network, use this`);
  console.log(` machine's LAN IP instead of localhost, e.g.:`);
  console.log(`   http://<this-machine-ip>:${PORT}/?team=TEAM01`);
  console.log(` Meera's Workstation interface ready.`);
  console.log(` Press Ctrl+C to stop.`);
  console.log(`=======================================================`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; flushing team state.`);
  await writeTeamsSnapshot();
  server.close((error) => {
    if (error) {
      console.error('Error while closing the HTTP server:', error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10 * 1000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));


