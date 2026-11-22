const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const GM_PASSWORD = process.env.GM_PASSWORD;
const GM_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const gmSessions = new Map();

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

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
function persistTeams() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
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
  }, 300);
}

function initTeam(id) {
  if (!teams[id]) {
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
      events: [],
      lastEvent: null,
      lastUpdate: getISTTimestamp()
    };
  }
  return teams[id];
}

app.use(express.json());
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
  if (!passwordsMatch(password, GM_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect GM password.' });
  }

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
  const { teamId, stage, startTime, timerSeconds, timerRunning, timerExpired, event, gameHalted, haltReason, haltTimestamp, finalMurderer, finalReasoning, finalSubmissionTimestamp, finalizations } = req.body || {};
  const id = (teamId || 'UNASSIGNED').toString().toUpperCase();

  const t = initTeam(id);
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
  const t = teams[req.params.id.toUpperCase()];
  res.set('Cache-Control', 'no-store');
  res.json(t ? {
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
    lastUpdate: t.lastUpdate
  } : {
    teamId: req.params.id.toUpperCase(),
    gameHalted: false,
    gmCommand: null
  });
});

// Sync full team status
app.post('/api/teams/:id/status', (req, res) => {
  const id = req.params.id.toUpperCase();
  const t = initTeam(id);
  const data = req.body || {};

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
    lastUpdate: getISTTimestamp()
  });

  if (Array.isArray(data.finalizations)) t.finalizations = data.finalizations;

  persistTeams();
  res.json({ ok: true });
});

// GM action: Resume a halted team session
app.post('/api/teams/:id/resume', requireGm, (req, res) => {
  const id = req.params.id.toUpperCase();
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

app.post('/api/teams/:id/control', requireGm, (req, res) => {
  const id = req.params.id.toUpperCase();
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
      lastEvent: team.lastEvent ? {
        type: team.lastEvent.type,
        clock: team.lastEvent.clock
      } : null
    };
  });
  res.json(result);
});

// Full event history for a single team.
app.get('/api/teams/:id', requireGm, (req, res) => {
  const id = req.params.id.toUpperCase();
  res.json(teams[id] || initTeam(id));
});

app.get('/api/teams/:id/events', requireGm, (req, res) => {
  const team = teams[req.params.id.toUpperCase()];
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
app.delete('/api/teams/:id', requireGm, (req, res) => {
  const id = req.params.id.toUpperCase();
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

if (!GM_PASSWORD) {
  console.warn('GM_PASSWORD is not set. GM login and organizer APIs will remain unavailable.');
}

app.listen(PORT, '0.0.0.0', () => {
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


