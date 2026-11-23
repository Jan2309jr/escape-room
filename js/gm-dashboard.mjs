function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatStageName(stage) {
  if (stage === 0 || stage === null) return 'LOCK SCREEN';
  if (stage === 6) return 'CASE CLOSED';
  if (typeof stage === 'string') return stage;
  return `STAGE ${stage}`;
}

function formatTimer(team) {
  let seconds = Number(team.timerSeconds);
  if (team.timerRunning && Number.isFinite(team.startTime)) {
    seconds = Math.max(0, 3600 - Math.floor((Date.now() - team.startTime) / 1000));
  }
  if (!Number.isFinite(seconds)) seconds = 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function isRecentlySeen(team) {
  if (!Number.isFinite(team.lastSeenMs)) return false;
  return Date.now() - team.lastSeenMs < 15000;
}

export function renderTeamRows(teams) {
  return Object.entries(teams).map(([id, team]) => {
    const isHalted = team.gameHalted || (team.lastEvent && ['TAB_SWITCH_VIOLATION', 'FULLSCREEN_EXIT_VIOLATION'].includes(team.lastEvent.type));
    const statusBadge = isHalted
      ? '<span class="gm-status-badge halted">🚨 GAME HALTED</span>'
      : (team.stage === 6 || team.wipeStopped
        ? '<span class="gm-status-badge completed">✔ COMPLETED</span>'
        : '<span class="gm-status-badge active">🟢 ACTIVE</span>');
    const haltInfo = isHalted
      ? `<div class="halt-reason-text"><strong>${escapeHtml(team.haltReason || 'TAB / WINDOW SWITCH')}</strong><br><small>Halted at: ${escapeHtml(team.haltTimestamp || (team.lastEvent ? team.lastEvent.clock : '—'))}</small></div>`
      : '<span style="color:var(--text-muted);">None</span>';
    const suspectInfo = team.finalMurderer
      ? `<strong style="color:var(--accent-amber);">${escapeHtml(team.finalMurderer)}</strong><br><small style="color:var(--text-muted);">${escapeHtml(team.finalSubmissionTimestamp || 'Submitted')}</small>`
      : '<span style="color:var(--text-muted);">NOT SUBMITTED</span>';
    const liveInfo = isRecentlySeen(team)
      ? `<span style="color:var(--accent-green);">● LIVE</span><br><small>${escapeHtml(team.lastSeen || team.lastUpdate || '—')}</small>`
      : `<span style="color:var(--text-muted);">● OFFLINE / INACTIVE</span><br><small>${escapeHtml(team.lastSeen || team.lastUpdate || '—')}</small>`;

    return `
      <tr class="${isHalted ? 'row-halted' : ''}">
        <td><strong style="font-size: 14px; color: #fff;">${escapeHtml(id)}</strong></td>
        <td>${statusBadge}</td>
        <td><code>${escapeHtml(formatStageName(team.stage))}</code></td>
        <td><code>${escapeHtml(formatTimer(team))}</code><br><small>${team.timerRunning === false ? 'PAUSED' : 'RUNNING'}</small></td>
        <td><strong>${Number(team.finalizationCount) || 0} / 3</strong></td>
        <td>${liveInfo}</td>
        <td>${haltInfo}</td>
        <td>${suspectInfo}</td>
        <td><code>${escapeHtml(team.lastUpdate || (team.lastEvent ? team.lastEvent.clock : '—'))}</code></td>
        <td>
          ${isHalted
            ? `<button class="org-ctrl-btn gm-resume-team-btn" data-teamid="${escapeHtml(id)}">▶ RESUME GAME</button>`
            : '<span style="color: var(--accent-green); font-size: 11px;">Running normally</span>'}
          <button class="org-ctrl-btn gm-delete-team-btn" data-teamid="${escapeHtml(id)}">🗑 DELETE TEAM</button>
        </td>
      </tr>
    `;
  }).join('');
}
