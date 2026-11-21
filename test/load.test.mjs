import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderTeamRows } from '../js/gm-dashboard.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gmPassword = 'temporary-test-gm-password';
let baseUrl;
let cookie;
let dataDir;
let server;

async function getFreePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Test server exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start within five seconds.');
}

test('serves 50 concurrent teams and shows every team in the GM dashboard', async (context) => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epoch-load-test-'));
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), GM_PASSWORD: gmPassword, DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  context.after(async () => {
    if (server && server.exitCode === null) {
      server.kill();
      await once(server, 'exit');
    }
    if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
  });

  await waitForServer();
  const login = await fetch(`${baseUrl}/api/gm/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: gmPassword })
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];

  const ids = Array.from({ length: 50 }, (_, index) => `TEST_TEAM_${String(index + 1).padStart(2, '0')}`);
  const startedAt = Date.now();
  const requests = ids.flatMap((teamId, index) => [
    fetch(`${baseUrl}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId,
        stage: 1,
        event: { ts: Date.now() + index, teamId, type: 'LOAD_TEST', message: 'Load-test event', meta: {} }
      })
    }),
    fetch(`${baseUrl}/api/teams/${encodeURIComponent(teamId)}/status`)
  ]);
  const responses = await Promise.all(requests);
  assert.equal(responses.length, 100);
  assert.ok(responses.every((response) => response.ok));
  assert.equal(Date.now() - startedAt < 10000, true, '50 concurrent event posts and polls should finish within 10 seconds');

  const authHeaders = { Cookie: cookie };
  const anonymousEvents = await fetch(`${baseUrl}/api/events`);
  assert.equal(anonymousEvents.status, 401);
  const [teamResponse, submissionResponse, eventResponse] = await Promise.all([
    fetch(`${baseUrl}/api/teams`, { headers: authHeaders }),
    fetch(`${baseUrl}/api/teams?view=submissions`, { headers: authHeaders }),
    fetch(`${baseUrl}/api/events`, { headers: authHeaders })
  ]);
  assert.ok(teamResponse.ok && submissionResponse.ok && eventResponse.ok);
  const [teams, submissions, events] = await Promise.all([
    teamResponse.json(),
    submissionResponse.json(),
    eventResponse.json()
  ]);
  assert.deepEqual(Object.keys(teams).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(submissions).sort(), [...ids].sort());
  assert.equal(events.filter((event) => event.type === 'LOAD_TEST').length, 50);
  assert.equal(teams[ids[0]].events, undefined);
  assert.equal(teams[ids[0]].finalReasoning, undefined);
  assert.equal(submissions[ids[0]].events, undefined);

  const dashboardRows = renderTeamRows(teams);
  assert.equal((dashboardRows.match(/<tr class=/g) || []).length, 50);
  ids.forEach((teamId) => assert.ok(dashboardRows.includes(teamId), `GM dashboard omitted ${teamId}`));

  const violationResponse = await fetch(`${baseUrl}/api/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId: ids[0],
      gameHalted: true,
      haltReason: 'FULLSCREEN EXIT',
      haltTimestamp: '10:00:00 IST',
      event: { ts: Date.now(), teamId: ids[0], type: 'FULLSCREEN_EXIT_VIOLATION', message: 'Team exited fullscreen.', meta: { reason: 'FULLSCREEN EXIT' } }
    })
  });
  assert.equal(violationResponse.status, 200);
  const otherDeviceStatus = await fetch(`${baseUrl}/api/teams/${encodeURIComponent(ids[0])}/status`).then((response) => response.json());
  assert.equal(otherDeviceStatus.gameHalted, true);
  assert.equal(otherDeviceStatus.haltReason, 'FULLSCREEN EXIT');
  const updatedSummaries = await fetch(`${baseUrl}/api/teams`, { headers: authHeaders }).then((response) => response.json());
  const haltedRow = renderTeamRows(updatedSummaries).split('<tr class=').find((row) => row.includes(ids[0]));
  assert.ok(haltedRow.includes('GAME HALTED'));
  assert.ok(haltedRow.includes('FULLSCREEN EXIT'));
  const teamEvents = await fetch(`${baseUrl}/api/teams/${encodeURIComponent(ids[0])}/events`, { headers: authHeaders }).then((response) => response.json());
  assert.ok(teamEvents.some((event) => event.type === 'FULLSCREEN_EXIT_VIOLATION'));

  const publicStatus = await fetch(`${baseUrl}/api/teams/${encodeURIComponent(ids[0])}/status`).then((response) => response.json());
  assert.equal(publicStatus.events, undefined);
  assert.equal(publicStatus.finalReasoning, undefined);

  const anonymousControl = await fetch(`${baseUrl}/api/teams/${ids[0]}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'timer', action: 'add5' })
  });
  assert.equal(anonymousControl.status, 401);

  const controlResponse = await fetch(`${baseUrl}/api/teams/${ids[0]}/control`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'timer', action: 'add5' })
  });
  assert.equal(controlResponse.status, 200);
  const controlledTeamStatus = await fetch(`${baseUrl}/api/teams/${encodeURIComponent(ids[0])}/status`).then((response) => response.json());
  assert.deepEqual(controlledTeamStatus.gmCommand, { id: 1, type: 'timer', action: 'add5' });
  assert.equal(controlledTeamStatus.timerSeconds, 3900);

  const invalidControl = await fetch(`${baseUrl}/api/teams/${ids[0]}/control`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'stage', action: 'DELETE_ALL' })
  });
  assert.equal(invalidControl.status, 400);

  await new Promise((resolve) => setTimeout(resolve, 400));
  const persistedTeams = JSON.parse(await fs.readFile(path.join(dataDir, 'teams.json'), 'utf8'));
  assert.equal(Object.keys(persistedTeams).length, 50);
  assert.equal(persistedTeams[ids[0]].events[0].type, 'LOAD_TEST');

  const updateResponse = await fetch(`${baseUrl}/api/teams/${ids[0]}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 2 })
  });
  assert.equal(updateResponse.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const rewrittenTeams = JSON.parse(await fs.readFile(path.join(dataDir, 'teams.json'), 'utf8'));
  assert.equal(rewrittenTeams[ids[0]].stage, 2);
  assert.equal(await fs.access(path.join(dataDir, 'teams.json.tmp')).then(() => true, () => false), false);

  await fetch(`${baseUrl}/api/gm/logout`, { method: 'POST', headers: authHeaders });
  console.log(`50-team load test completed in ${Date.now() - startedAt}ms; all teams rendered in GM dashboard.`);
});
