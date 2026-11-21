/**
 * THE EPOCH - Organizer & GM Control Panel
 * Secure Password-Protected Panel for Game Masters.
 * Provides per-team game status, tab-switch violation monitoring,
 * single-team GM Resume controls, final suspect & reasoning inspection,
 * and complete event audit logs.
 */

import { gameState, getISTTimestamp } from '../state.js';
import { sound } from '../audio.js';
import { renderTeamRows } from '../gm-dashboard.mjs';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export class OrganizerModalComponent {
  constructor(modalContainer) {
    this.modal = modalContainer;
    this.unlocked = false;
    this.pwError = '';
    this.activeTab = 'allteams'; // default to multi-team dashboard for GMs
    this.allTeamsData = null;
    this.serverEvents = null;
    this.solutionKey = null;
    this.solutionKeyLoading = false;
    this.solutionKeyError = '';
    this.eventLogError = '';
    this.eventLogTeamFilter = 'ALL';
    this.eventLogTypeFilter = 'ALL';
    this.teamActionError = '';
    this.refreshInterval = null;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();

    gameState.subscribe((event) => {
      if (['LEVEL_CHANGED', 'TIMER_CHANGED', 'GAME_RESET', 'EVENT_LOGGED', 'TAB_SWITCH_VIOLATION', 'VIOLATION_CLEARED'].includes(event)) {
        if (!this.modal.classList.contains('hidden')) {
          this.render();
          this.bindEvents();
        }
      }
    });
  }

  show() {
    this.render();
    this.bindEvents();
    this.modal.classList.remove('hidden');
    this.startAutoRefresh();
  }

  hide() {
    this.modal.classList.add('hidden');
    this.stopAutoRefresh();
    if (this.unlocked) {
      fetch('/api/gm/logout', { method: 'POST' }).catch((error) => {
        console.error('Could not end the GM session.', error);
      });
    }
    this.unlocked = false;
    this.pwError = '';
    this.allTeamsData = null;
    this.serverEvents = null;
    this.solutionKey = null;
    this.solutionKeyLoading = false;
    this.solutionKeyError = '';
    this.eventLogError = '';
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      if (this.unlocked && !this.modal.classList.contains('hidden')) {
        this.fetchAllTeams(true);
        if (this.activeTab === 'log') this.fetchTeamEvents(true);
      }
    }, 3000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  render() {
    if (!this.unlocked) {
      this.modal.innerHTML = `
        <div class="organizer-drawer-card gm-gate-card">
          <div class="org-header">
            <div class="org-title"><span class="org-badge">GM CONTROL</span><h2>ORGANIZER ACCESS ONLY</h2></div>
            <button class="org-close-btn" id="close-org-modal">✕</button>
          </div>
          <div class="org-section" style="padding: 24px; text-align: center;">
            <p class="org-sub" style="margin-bottom: 16px;">This panel is restricted strictly to Game Masters and Event Organizers.</p>
            <div class="lock-input-group" style="max-width: 380px; margin: 0 auto 12px;">
              <input type="password" id="gm-password-input" class="lock-input" placeholder="ENTER GM PASSWORD" autocomplete="off" autofocus>
              <button id="gm-password-submit" class="lock-submit-btn">UNLOCK</button>
            </div>
            ${this.pwError ? `<div class="lock-error" style="max-width: 380px; margin: 8px auto;">${this.pwError}</div>` : ''}
          </div>
        </div>
      `;
      return;
    }

    const s = gameState.data;
    const mins = Math.floor(s.timerSeconds / 60);
    const secs = s.timerSeconds % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    this.modal.innerHTML = `
      <div class="organizer-drawer-card">
        <div class="org-header">
          <div class="org-title">
            <span class="org-badge">GM CONTROL</span>
            <h2>ORGANIZER & EVENT MASTER PANEL — LIVE COMMAND CENTER</h2>
          </div>
          <button class="org-close-btn" id="close-org-modal">✕</button>
        </div>

        <div class="org-tab-row">
          <button class="org-tab-btn ${this.activeTab === 'allteams' ? 'active' : ''}" data-tab="allteams">👥 All Teams Dashboard</button>
          <button class="org-tab-btn ${this.activeTab === 'submissions' ? 'active' : ''}" data-tab="submissions">📑 Final Submissions & Reasoning</button>
          <button class="org-tab-btn ${this.activeTab === 'stage' ? 'active' : ''}" data-tab="stage">⚙ Station & Timer Control</button>
          <button class="org-tab-btn ${this.activeTab === 'log' ? 'active' : ''}" data-tab="log">🧾 Complete Audit Log</button>
        </div>

        <div class="org-body-tabs">
          ${this.activeTab === 'allteams' ? this.renderAllTeamsTab() : ''}
          ${this.activeTab === 'submissions' ? this.renderSubmissionsTab() : ''}
          ${this.activeTab === 'stage' ? this.renderStageTab(s, timeFormatted) : ''}
          ${this.activeTab === 'log' ? this.renderLogTab() : ''}
        </div>
      </div>
    `;

    if (['allteams', 'submissions', 'log'].includes(this.activeTab) && this.allTeamsData === null) {
      this.fetchAllTeams();
    }
    if (this.activeTab === 'log' && this.serverEvents === null) {
      this.fetchTeamEvents();
    }
    if (this.activeTab === 'stage' && !this.solutionKey && !this.solutionKeyLoading) {
      this.fetchSolutionKey();
    }
  }

  renderAllTeamsTab() {
    if (this.allTeamsData === null) {
      return `<div class="org-section"><p class="org-sub">Connecting to host server for live team status…</p></div>`;
    }
    if (this.allTeamsData === false) {
      return `<div class="org-section"><p class="org-sub">Could not load team sessions from the host server. Check the server connection and refresh.</p></div>`;
    }

    const teams = this.allTeamsData;
    const teamEntries = Object.entries(teams);

    return `
      <div class="org-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>🌐 LIVE TEAMS MONITORING & HALT RESUME CONTROL (${teamEntries.length} Active Station Sessions)</h3>
          <button class="org-ctrl-btn" id="refresh-teams-btn">🔄 Refresh Data</button>
        </div>
        ${this.teamActionError ? `<p class="org-team-action-error" role="alert">${escapeHtml(this.teamActionError)}</p>` : ''}
        
        <div class="gm-event-log-scroll" style="max-height: 520px;">
          <table class="cyber-table small-table">
            <thead>
              <tr>
                <th>Team ID</th>
                <th>Status</th>
                <th>Current Stage</th>
                <th>Halt Details</th>
                <th>Final Suspect</th>
                <th>Last Activity</th>
                <th>GM Action</th>
              </tr>
            </thead>
            <tbody>
              ${teamEntries.length === 0 ? `
                <tr><td colspan="7" style="text-align: center; padding: 20px;">No team sessions recorded yet. Launch participant browsers with <code>?team=TEAM01</code>.</td></tr>
              ` : renderTeamRows(teams)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderSubmissionsTab() {
    const teams = this.allTeamsData || {};
    const teamEntries = Object.entries(teams);

    return `
      <div class="org-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>📑 FINAL INVESTIGATION SUBMISSIONS & PARTICIPANT REASONING</h3>
          <button class="org-ctrl-btn" id="refresh-teams-btn">🔄 Refresh Data</button>
        </div>
        <p class="org-sub" style="margin-bottom: 14px;">Displays the exact suspect choice, full participant-written explanation, and submission timestamp for each team.</p>

        <div class="gm-event-log-scroll" style="max-height: 520px;">
          ${teamEntries.length === 0 ? `
            <div class="org-sub" style="text-align: center; padding: 20px;">No team submissions recorded yet.</div>
          ` : teamEntries.map(([id, t]) => {
            const hasSubmitted = !!t.finalMurderer;
            return `
              <div class="gm-submission-card" style="background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 10px;">
                  <div>
                    <span class="org-badge">TEAM ID: ${escapeHtml(id)}</span>
                    <strong style="margin-left: 10px; font-size: 15px; color: #fff;">${hasSubmitted ? `Final Suspect: <span style="color: var(--accent-amber);">${escapeHtml(t.finalMurderer)}</span>` : '<span style="color: var(--text-muted);">NOT SUBMITTED YET</span>'}</strong>
                  </div>
                  <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                    ${hasSubmitted ? `Submitted at: <strong style="color:var(--accent-cyan);">${escapeHtml(t.finalSubmissionTimestamp)}</strong>` : 'Status: In Progress'}
                  </div>
                </div>

                ${hasSubmitted ? `
                  <div class="gm-reasoning-full" style="background: #060b11; border: 1px solid #1e2e42; border-radius: 6px; padding: 12px; font-family: var(--font-sans); font-size: 13px; color: #e2e8f0; line-height: 1.5; white-space: pre-wrap;">
                    <div style="font-family: var(--font-mono); font-size: 10px; color: var(--accent-cyan); font-weight: 700; margin-bottom: 6px;">PARTICIPANT WRITTEN REASONING:</div>
                    ${escapeHtml(t.finalReasoning)}
                  </div>
                ` : `
                  <div style="font-style: italic; font-size: 12px; color: var(--text-muted);">Participant team has not completed their final accusation report.</div>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderStageTab(s, timeFormatted) {
    return `
      <div class="org-section">
        <h3>🏷 CURRENT STATION TEAM IDENTITY</h3>
        <div class="timer-control-bar">
          <input type="text" id="team-id-input" class="cyber-input" style="max-width:220px;" placeholder="e.g. TEAM01" value="${escapeHtml(gameState.teamId || '')}">
          <button class="org-ctrl-btn" id="set-team-id-btn">SET TEAM ID</button>
        </div>
      </div>

      ${s.disqualified ? `
      <div class="org-section violation-section" style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--accent-red); padding: 16px; border-radius: 8px;">
        <h3 style="color: #fca5a5;">🚨 TAB-SWITCH VIOLATION ACTIVE FOR THIS STATION</h3>
        <p class="org-sub">This team's game was halted at <strong>${escapeHtml(s.disqualifiedTimestamp || 'recently')}</strong> for: <strong>${escapeHtml(s.disqualifiedReason || 'TAB / WINDOW SWITCH')}</strong>.</p>
        <button id="clear-violation-btn" class="danger-reset-btn" style="margin-top: 10px;">✅ CLEAR VIOLATION & RESUME GAME</button>
      </div>
      ` : ''}

      <div class="org-section">
        <h3>⏱ REMOTE WIPE TIMER (60 MIN, SERVER-ANCHORED)</h3>
        <div class="timer-control-bar">
          <div class="org-timer-display">${timeFormatted}</div>
          <button class="org-ctrl-btn" id="org-pause-btn">${s.timerRunning ? '⏸ Pause Timer' : '▶ Resume Timer'}</button>
          <button class="org-ctrl-btn" id="org-add5-btn">+5 Minutes</button>
          <button class="org-ctrl-btn" id="org-sub5-btn">-5 Minutes</button>
          <button class="org-ctrl-btn" id="org-set60-btn">Reset to 60m</button>
        </div>
        <p class="org-sub">Timer is anchored to a start timestamp — refreshing the browser will NOT reset it.</p>
      </div>

      <div class="org-section">
        <h3>⚡ QUICK STAGE JUMP (FOR GM ASSISTANCE)</h3>
        <div class="stage-jump-grid">
          <button class="stage-btn" data-stage="RESET">RESET — Lock Screen</button>
          <button class="stage-btn" data-stage="SLOT1">Through: Slot 1 Finalized</button>
          <button class="stage-btn" data-stage="SLOT2">Through: Slot 2 Finalized</button>
          <button class="stage-btn" data-stage="NETTRACE_CCTV">Through: nettrace + CCTV</button>
          <button class="stage-btn" data-stage="SLOT3">Through: Slot 3 Finalized</button>
          <button class="stage-btn" data-stage="FINAL">Through: Final Unlocked</button>
          <button class="stage-btn" data-stage="SOLVED">Through: Case Solved</button>
        </div>
      </div>

      <div class="org-section">
        <h3>🔄 COMPLETE STATION RESET (FOR NEXT TEAM)</h3>
        <p class="org-sub">Clears all local progress and restarts from State 0 for this station.</p>
        <button id="org-full-reset-btn" class="danger-reset-btn">⚠ FULL GAME RESET FOR NEXT TEAM</button>
      </div>

      <div class="org-section">
        <h3>📑 SOLUTION KEY (ORGANIZER CONFIDENTIAL)</h3>
        <div id="gm-solution-key-content">${this.renderSolutionKey()}</div>
      </div>
    `;
  }

  renderLogTab() {
    const events = this.serverEvents
      ? [...this.serverEvents].sort((left, right) => (Number(right.ts) || 0) - (Number(left.ts) || 0))
      : [];
    const eventTypes = [...new Set(events.map((event) => event.type).filter(Boolean))].sort();
    const visibleEvents = events.filter((event) => this.eventLogTypeFilter === 'ALL' || event.type === this.eventLogTypeFilter);
    const teams = this.allTeamsData && this.allTeamsData !== false ? Object.keys(this.allTeamsData).sort() : [];
    const scope = this.eventLogTeamFilter === 'ALL' ? 'all teams (latest 500)' : `Team ${this.eventLogTeamFilter}`;
    const summary = this.eventLogError || (this.serverEvents
      ? `Showing ${visibleEvents.length} of ${events.length} recent event(s) for ${scope}.`
      : `Loading events for ${scope}…`);
    return `
      <div class="org-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <h3>🧾 EVENT LOG — ALL TEAMS</h3>
          <button class="org-ctrl-btn" id="refresh-log-btn">🔄 Refresh Log</button>
        </div>
        <div class="timer-control-bar">
          <label for="gm-log-team-filter">Team</label>
          <select id="gm-log-team-filter" class="cyber-input">
            <option value="ALL" ${this.eventLogTeamFilter === 'ALL' ? 'selected' : ''}>All teams (latest 500)</option>
            ${teams.map((id) => `<option value="${escapeHtml(id)}" ${id === this.eventLogTeamFilter ? 'selected' : ''}>${escapeHtml(id)}</option>`).join('')}
          </select>
          <label for="gm-log-type-filter">Event type</label>
          <select id="gm-log-type-filter" class="cyber-input">
            <option value="ALL">All event types</option>
            ${eventTypes.map((type) => `<option value="${escapeHtml(type)}" ${type === this.eventLogTypeFilter ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
          </select>
        </div>
        <p class="org-sub">${escapeHtml(summary)}</p>
        <div class="gm-event-log-scroll" style="max-height: 500px;">
          <table class="cyber-table small-table">
            <thead><tr><th>Time</th><th>Team ID</th><th>Type</th><th>Details</th></tr></thead>
            <tbody>
              ${!this.serverEvents
                ? '<tr><td colspan="4">Loading events…</td></tr>'
                : visibleEvents.length === 0
                  ? '<tr><td colspan="4">No matching events.</td></tr>'
                  : visibleEvents.map(ev => `
                <tr>
                  <td><code>${escapeHtml(ev.clock || getISTTimestamp(new Date(ev.ts)))}</code></td>
                  <td><strong>${escapeHtml(ev.teamId || gameState.teamId)}</strong></td>
                  <td><code>${escapeHtml(ev.type)}</code></td>
                  <td>
                    ${escapeHtml(ev.message)}
                    ${ev.meta && ev.meta.reasoning ? `<div class="gm-reasoning-block" style="margin-top:4px; font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:6px; border-radius:4px;">"${escapeHtml(ev.meta.reasoning)}"</div>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderSolutionKey() {
    if (this.solutionKeyError) return `<p class="org-sub">${escapeHtml(this.solutionKeyError)}</p>`;
    if (!this.solutionKey) return '<p class="org-sub">Loading solution key…</p>';
    return `
      <table class="cyber-table small-table">
        <thead><tr><th>Person</th><th>Verdict</th><th>Key Evidence</th></tr></thead>
        <tbody>${this.solutionKey.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.person)}</strong></td>
            <td>${escapeHtml(item.verdict)}</td>
            <td>${escapeHtml(item.evidence)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  async fetchAllTeams(silent = false) {
    try {
      const view = this.activeTab === 'submissions' ? '?view=submissions' : '';
      const res = await fetch(`/api/teams${view}`);
      if (res.status === 401) {
        this.lockExpiredSession();
        return;
      }
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}.`);
      const data = await res.json();
      this.allTeamsData = data;
    } catch (e) {
      this.allTeamsData = false;
    }
    if (!this.unlocked) return;
    if (!silent) {
      this.render();
      this.bindEvents();
    } else {
      // Refresh active tab views dynamically
      const activeTabContent = this.modal.querySelector('.org-body-tabs');
      if (activeTabContent && this.activeTab === 'allteams') {
        activeTabContent.innerHTML = this.renderAllTeamsTab();
        this.bindEvents();
      } else if (activeTabContent && this.activeTab === 'submissions') {
        activeTabContent.innerHTML = this.renderSubmissionsTab();
        this.bindEvents();
      } else if (activeTabContent && this.activeTab === 'log') {
        activeTabContent.innerHTML = this.renderLogTab();
        this.bindEvents();
      }
    }
  }

  async fetchTeamEvents(silent = false) {
    try {
      const endpoint = this.eventLogTeamFilter === 'ALL'
        ? '/api/events'
        : `/api/teams/${encodeURIComponent(this.eventLogTeamFilter)}/events`;
      const res = await fetch(endpoint);
      if (res.status === 401) {
        this.lockExpiredSession();
        return;
      }
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}.`);
      this.serverEvents = await res.json();
      this.eventLogError = '';
    } catch (error) {
      this.serverEvents = [];
      this.eventLogError = `Could not load the event log: ${error.message}`;
    }
    if (this.unlocked && this.activeTab === 'log') {
      if (silent) {
        const activeTabContent = this.modal.querySelector('.org-body-tabs');
        if (activeTabContent) activeTabContent.innerHTML = this.renderLogTab();
      } else {
        this.render();
      }
      this.bindEvents();
    }
  }

  async fetchSolutionKey() {
    this.solutionKeyLoading = true;
    try {
      const res = await fetch('/api/gm/solution');
      if (res.status === 401) {
        this.lockExpiredSession();
        return;
      }
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}.`);
      this.solutionKey = await res.json();
    } catch (error) {
      this.solutionKeyError = `Could not load the solution key: ${error.message}`;
    } finally {
      this.solutionKeyLoading = false;
      if (this.unlocked && this.activeTab === 'stage') {
        this.render();
        this.bindEvents();
      }
    }
  }

  lockExpiredSession() {
    this.unlocked = false;
    this.pwError = 'GM session expired. Sign in again.';
    this.allTeamsData = null;
    this.serverEvents = null;
    this.solutionKey = null;
    this.eventLogError = '';
    this.render();
    this.bindEvents();
  }

  async resumeTeamOnServer(teamId) {
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/resume`, { method: 'POST' });
      if (res.ok) {
        sound.playSuccess();
        // If resuming current station team, also clear local state
        if (teamId.toUpperCase() === (gameState.teamId || '').toUpperCase()) {
          gameState.clearViolation();
        }
        await this.fetchAllTeams();
      } else {
        sound.playError();
      }
    } catch (e) {
      sound.playError();
    }
  }

  async deleteTeamOnServer(teamId) {
    if (!confirm(`Delete Team ${teamId}'s server-side session and event history? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}.`);
      this.teamActionError = '';
      sound.playSuccess();
      await this.fetchAllTeams();
    } catch (error) {
      this.teamActionError = `Could not delete Team ${teamId}: ${error.message}`;
      sound.playError();
      this.render();
      this.bindEvents();
    }
  }

  bindEvents() {
    const closeBtn = this.modal.querySelector('#close-org-modal');
    if (closeBtn) closeBtn.onclick = () => this.hide();

    const pwSubmit = this.modal.querySelector('#gm-password-submit');
    const pwInput = this.modal.querySelector('#gm-password-input');
    if (pwSubmit && pwInput) {
      const doUnlock = async () => {
        pwSubmit.disabled = true;
        try {
          const res = await fetch('/api/gm/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwInput.value })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || `Server returned HTTP ${res.status}.`);
          this.unlocked = true;
          this.pwError = '';
          this.allTeamsData = null;
          this.serverEvents = null;
          this.solutionKey = null;
          this.solutionKeyError = '';
          this.eventLogTeamFilter = 'ALL';
          this.eventLogTypeFilter = 'ALL';
          sound.playSuccess();
        } catch (error) {
          this.pwError = escapeHtml(error.message || 'Could not reach the game server.');
          sound.playError();
        } finally {
          this.render();
          this.bindEvents();
        }
      };
      pwSubmit.onclick = doUnlock;
      pwInput.onkeydown = (e) => { if (e.key === 'Enter') doUnlock(); };
    }

    this.modal.querySelectorAll('.org-tab-btn').forEach(btn => {
      btn.onclick = () => {
        this.activeTab = btn.getAttribute('data-tab');
        if (this.activeTab === 'allteams' || this.activeTab === 'submissions') this.allTeamsData = null;
        if (this.activeTab === 'log') this.serverEvents = null;
        sound.playKeyClick();
        this.render();
        this.bindEvents();
      };
    });

    const refreshTeamsBtn = this.modal.querySelector('#refresh-teams-btn');
    if (refreshTeamsBtn) refreshTeamsBtn.onclick = () => { this.allTeamsData = null; this.fetchAllTeams(); };

    const refreshLogBtn = this.modal.querySelector('#refresh-log-btn');
    if (refreshLogBtn) refreshLogBtn.onclick = () => {
      this.serverEvents = null;
      this.render();
      this.bindEvents();
    };

    const logTeamFilter = this.modal.querySelector('#gm-log-team-filter');
    if (logTeamFilter) logTeamFilter.onchange = () => {
      this.eventLogTeamFilter = logTeamFilter.value;
      this.eventLogTypeFilter = 'ALL';
      this.serverEvents = null;
      this.render();
      this.bindEvents();
    };

    const logTypeFilter = this.modal.querySelector('#gm-log-type-filter');
    if (logTypeFilter) logTypeFilter.onchange = () => {
      this.eventLogTypeFilter = logTypeFilter.value;
      const activeTabContent = this.modal.querySelector('.org-body-tabs');
      if (activeTabContent) activeTabContent.innerHTML = this.renderLogTab();
      this.bindEvents();
    };

    // Multi-team GM Resume handler
    this.modal.querySelectorAll('.gm-resume-team-btn').forEach(btn => {
      btn.onclick = () => {
        const teamId = btn.getAttribute('data-teamid');
        if (teamId) this.resumeTeamOnServer(teamId);
      };
    });

    this.modal.querySelectorAll('.gm-delete-team-btn').forEach(btn => {
      btn.onclick = () => {
        const teamId = btn.getAttribute('data-teamid');
        if (teamId) this.deleteTeamOnServer(teamId);
      };
    });

    const setTeamIdBtn = this.modal.querySelector('#set-team-id-btn');
    const teamIdInput = this.modal.querySelector('#team-id-input');
    if (setTeamIdBtn && teamIdInput) {
      setTeamIdBtn.onclick = () => {
        gameState.setTeamId(teamIdInput.value);
        sound.playSuccess();
        this.render();
        this.bindEvents();
      };
    }

    this.modal.querySelectorAll('.stage-btn').forEach(btn => {
      btn.onclick = () => {
        const stage = btn.getAttribute('data-stage');
        if (stage === 'RESET') {
          gameState.resetGame();
        } else {
          gameState.forceUnlockThrough(stage);
        }
        sound.playSuccess();
        this.render();
        this.bindEvents();
      };
    });

    const pauseBtn = this.modal.querySelector('#org-pause-btn');
    if (pauseBtn) pauseBtn.onclick = () => {
      if (gameState.data.timerRunning) gameState.pauseTimer(); else gameState.resumeTimer();
      this.render(); this.bindEvents();
    };

    const add5Btn = this.modal.querySelector('#org-add5-btn');
    if (add5Btn) add5Btn.onclick = () => { gameState.addTime(300); this.render(); this.bindEvents(); };
    const sub5Btn = this.modal.querySelector('#org-sub5-btn');
    if (sub5Btn) sub5Btn.onclick = () => { gameState.addTime(-300); this.render(); this.bindEvents(); };
    const set60Btn = this.modal.querySelector('#org-set60-btn');
    if (set60Btn) set60Btn.onclick = () => { gameState.setTimerMinutes(60); this.render(); this.bindEvents(); };

    const resetBtn = this.modal.querySelector('#org-full-reset-btn');
    if (resetBtn) resetBtn.onclick = () => {
      if (confirm("Reset the entire escape game station for the next team? All progress will be wiped.")) {
        gameState.resetGame();
        sound.playSuccess();
        this.hide();
      }
    };

    const clearViolationBtn = this.modal.querySelector('#clear-violation-btn');
    if (clearViolationBtn) clearViolationBtn.onclick = () => {
      gameState.clearViolation();
      sound.playSuccess();
      this.render();
      this.bindEvents();
    };
  }
}
