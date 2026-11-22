/**
 * THE EPOCH / EscapeServer - Central Game State Machine (v3)
 *
 * Suspect clearance is purely SLOT-based:
 * participants may finalize ANY suspect (main or witness) into slots 1, 2
 * and 3 of suspects_db. Slot 1 unlocks recovery_code. Slot 2 unlocks
 * nettrace. Slot 3 requires nettrace to be solved AND both CCTV camera
 * feeds to have been viewed at least once, and unlocks the Final
 * Investigation console. Correctness is judged manually by the GM — every
 * finalization (and every other key event) is timestamped and logged for
 * GM Control, per-team, with server sync for a live multi-team dashboard.
 */

import { SUSPECTS } from './data/dossiers.js';
import { sound } from './audio.js';

const BASE_STORAGE_KEY = 'EPOCH_GAME_STATE_V3';
const TEAM_ID_KEY = 'EPOCH_TEAM_ID';
const LOCK_PASSWORD = 'yayyougotthepassword';
const GAME_DURATION_SECONDS = 60 * 60; // 60 minutes

const DEFAULT_STATE = {
  currentLevel: 0, // 0: Lock, 1: Desktop / Investigation running, 6: Case Closed

  // Server-anchored timer
  startTime: null,
  timerRunning: true,
  timerExpired: false,
  timerSeconds: GAME_DURATION_SECONDS,
  lastGmCommandId: 0,

  // Recovered evidence tokens/fragments
  fragments: {
    3: null, // WS14 (nettrace)
    4: null  // NULLDEPT (final ledger)
  },

  // Suspect clearance: ordered list of finalization records.
  // Each: { id, name, type, timestamp, slot }
  finalizations: [],

  // Recovery code (recovery_code) debug puzzle
  debugScriptFixed: false,

  // CCTV: has each camera been opened/viewed at least once
  cctvCamsViewed: { CAM01: false, CAM02: false },

  // Final investigation
  finalMurderer: null,
  finalReasoning: null, // full un-truncated reasoning text
  finalSubmissionTimestamp: null,

  // Ram PC login + data wipe finale
  ramLoginSuccess: false,
  ramLoginTimestamp: null,
  wipeStopped: false,
  wipeStoppedTimestamp: null,

  // Anti-cheat: tab-switch / app-switch violation
  disqualified: false,
  disqualifiedTimestamp: null,
  disqualifiedReason: null,

  // Terminal
  terminalHistory: [],

};

export function getISTTimestamp(date = new Date()) {
  try {
    const timeStr = date.toLocaleTimeString('en-IN', {
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

function nowClock() {
  return getISTTimestamp();
}

class GameState {
  constructor() {
    this.listeners = [];
    this.timerInterval = null;
    this.pollInterval = null;
    this.teamId = this.loadTeamId();
    this.data = this.loadState();
    this.initTimer();
    this.initServerPoll();
  }

  // ---------------- Team Identity ----------------
  loadTeamId() {
    try {
      let id = localStorage.getItem(TEAM_ID_KEY);
      if (!id) {
        const params = new URLSearchParams(window.location.search);
        id = params.get('team') || '';
      }
      return (id || 'TEAM01').trim().toUpperCase();
    } catch (e) {
      return 'TEAM01';
    }
  }

  getStorageKey() {
    const team = (this.teamId || 'TEAM01').toUpperCase();
    return `${BASE_STORAGE_KEY}_${team}`;
  }

  setTeamId(id) {
    const clean = (id || '').trim().toUpperCase();
    if (!clean) return;
    this.teamId = clean;
    try { localStorage.setItem(TEAM_ID_KEY, clean); } catch (e) {}
    this.data = this.loadState();
    this.notify('TEAM_ID_SET', { teamId: clean });
    this.syncStatusToServer();
  }

  hasTeamId() {
    return !!this.teamId;
  }

  // ---------------- Persistence ----------------
  loadState() {
    try {
      const saved = localStorage.getItem(this.getStorageKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        const { eventLog, ...playerState } = parsed;
        if (Array.isArray(eventLog)) {
          localStorage.setItem(this.getStorageKey(), JSON.stringify(playerState));
        }
        return {
          ...DEFAULT_STATE,
          ...playerState,
          fragments: { ...DEFAULT_STATE.fragments, ...(playerState.fragments || {}) },
          finalizations: Array.isArray(playerState.finalizations) ? playerState.finalizations : [],
          cctvCamsViewed: { ...DEFAULT_STATE.cctvCamsViewed, ...(playerState.cctvCamsViewed || {}) }
        };
      }
    } catch (e) {
      console.warn("Could not load saved state, using default:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  saveState() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.data));
    } catch (e) {
      console.error("Failed to save state to localStorage", e);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(event, payload) {
    this.saveState();
    this.listeners.forEach(fn => fn(event, payload, this.data));
  }

  // ---------------- Server Synchronization ----------------
  addEvent(type, message, meta = {}) {
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      clock: nowClock(),
      teamId: this.teamId || 'UNASSIGNED',
      type,
      message,
      meta
    };
    this.notify('EVENT_LOGGED', entry);
    this.syncEventToServer(entry);
    return entry;
  }

  syncEventToServer(entry) {
    try {
      fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: entry.teamId,
          stage: this.data.currentLevel,
          gameHalted: this.data.disqualified,
          haltReason: this.data.disqualifiedReason,
          haltTimestamp: this.data.disqualifiedTimestamp,
          startTime: this.data.startTime,
          timerSeconds: this.data.timerSeconds,
          timerRunning: this.data.timerRunning,
          timerExpired: this.data.timerExpired,
          finalMurderer: this.data.finalMurderer,
          finalReasoning: this.data.finalReasoning,
          finalSubmissionTimestamp: this.data.finalSubmissionTimestamp,
          finalizations: this.data.finalizations,
          event: entry
        })
      }).catch(() => {});
    } catch (e) { /* offline / static hosting — ignore */ }
  }

  syncStatusToServer() {
    try {
      fetch(`/api/teams/${this.teamId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: this.data.currentLevel,
          gameHalted: this.data.disqualified,
          haltReason: this.data.disqualifiedReason,
          haltTimestamp: this.data.disqualifiedTimestamp,
          startTime: this.data.startTime,
          timerSeconds: this.data.timerSeconds,
          timerRunning: this.data.timerRunning,
          timerExpired: this.data.timerExpired,
          finalMurderer: this.data.finalMurderer,
          finalReasoning: this.data.finalReasoning,
          finalSubmissionTimestamp: this.data.finalSubmissionTimestamp,
          finalizations: this.data.finalizations,
          wipeStopped: this.data.wipeStopped
        })
      }).catch(() => {});
    } catch (e) {}
  }

  initServerPoll() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (!this.teamId) return;
      try {
        const res = await fetch(`/api/teams/${encodeURIComponent(this.teamId)}/status`);
        if (!res.ok) return;
        const serverTeam = await res.json();

        if (serverTeam.gmCommand && serverTeam.gmCommand.id > (this.data.lastGmCommandId || 0)) {
          this.applyGmCommand(serverTeam.gmCommand);
        }
        
        // If server says game is NOT halted, but local state IS disqualified -> GM Resumed!
        if (serverTeam.gameHalted === false && this.data.disqualified) {
          this.data.disqualified = false;
          this.data.disqualifiedTimestamp = null;
          this.data.disqualifiedReason = null;
          this.resumeTimer();
          this.notify('VIOLATION_CLEARED', {});
        }
        // If server says game IS halted, but local state is NOT -> Server/GM marked halted!
        else if (serverTeam.gameHalted === true && !this.data.disqualified) {
          this.data.disqualified = true;
          this.data.disqualifiedTimestamp = serverTeam.haltTimestamp || nowClock();
          this.data.disqualifiedReason = serverTeam.haltReason || 'TAB / WINDOW SWITCH';
          this.pauseTimer();
          this.notify('TAB_SWITCH_VIOLATION', { timestamp: this.data.disqualifiedTimestamp, reason: this.data.disqualifiedReason });
        }
      } catch (e) {}
    }, 2500);
  }

  applyGmCommand(command) {
    this.data.lastGmCommandId = command.id;
    this.saveState();

    if (command.type === 'stage') {
      if (command.action === 'RESET') this.resetGame();
      else this.forceUnlockThrough(command.action);
    } else if (command.type === 'timer') {
      if (command.action === 'pause') this.pauseTimer();
      else if (command.action === 'resume') this.resumeTimer();
      else if (command.action === 'add5') this.addTime(300);
      else if (command.action === 'sub5') this.addTime(-300);
      else if (command.action === 'reset60') this.setTimerMinutes(60);
    }

    this.data.lastGmCommandId = command.id;
    this.saveState();
    this.syncStatusToServer();
  }

  addLog(msg) {
    const timestamp = nowClock();
    this.data.terminalHistory.push(`[${timestamp}] ${msg}`);
    if (this.data.terminalHistory.length > 100) this.data.terminalHistory.shift();
    this.notify('LOG_ADDED', { msg });
  }

  // ---------------- Timer ----------------
  initTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.data.startTime && this.data.timerRunning && this.data.currentLevel > 0 && this.data.currentLevel < 6) {
        const elapsed = Math.floor((Date.now() - this.data.startTime) / 1000);
        const remaining = Math.max(0, GAME_DURATION_SECONDS - elapsed);
        this.data.timerSeconds = remaining;

        if (remaining === 600 || remaining === 300 || remaining <= 60) {
          if (remaining % 10 === 0) sound.playAlarm();
        }

        if (remaining <= 0 && !this.data.timerExpired) {
          this.data.timerExpired = true;
          this.data.timerRunning = false;
          sound.playError();
          this.addEvent('TIMER_EXPIRED', 'Remote wipe timer expired.');
          this.notify('TIMER_EXPIRED', {});
        } else {
          this.notify('TIMER_TICK', { seconds: remaining });
        }
      }
    }, 1000);
  }

  pauseTimer() {
    if (this.data.startTime && this.data.timerRunning) {
      const elapsed = Math.floor((Date.now() - this.data.startTime) / 1000);
      this.data.timerSeconds = Math.max(0, GAME_DURATION_SECONDS - elapsed);
      this.data.startTime = Date.now() - (GAME_DURATION_SECONDS - this.data.timerSeconds) * 1000;
    }
    this.data.timerRunning = false;
    this.notify('TIMER_PAUSED', {});
  }

  resumeTimer() {
    if (!this.data.timerExpired) {
      this.data.timerRunning = true;
      this.notify('TIMER_RESUMED', {});
    }
  }

  addTime(seconds) {
    const remaining = this.data.startTime
      ? Math.max(0, GAME_DURATION_SECONDS - Math.floor((Date.now() - this.data.startTime) / 1000))
      : this.data.timerSeconds;
    this.data.timerSeconds = Math.max(0, remaining + seconds);
    this.data.startTime = Date.now() - (GAME_DURATION_SECONDS - this.data.timerSeconds) * 1000;
    this.data.timerExpired = this.data.timerSeconds <= 0;
    this.addEvent('TIMER_ADJUSTED', `GM adjusted timer by ${seconds >= 0 ? '+' : ''}${Math.round(seconds / 60)} minute(s).`);
    this.notify('TIMER_CHANGED', { seconds: this.data.timerSeconds });
  }

  setTimerMinutes(mins) {
    this.data.startTime = Date.now() - (GAME_DURATION_SECONDS - mins * 60) * 1000;
    this.data.timerSeconds = mins * 60;
    this.data.timerExpired = false;
    this.addEvent('TIMER_SET', `GM set timer to ${mins} minute(s).`);
    this.notify('TIMER_CHANGED', { seconds: this.data.timerSeconds });
  }

  rejectIfExpired() {
    if (!this.data.timerExpired) return null;
    sound.playError();
    return { success: false, message: "TIME EXPIRED. The remote wipe has completed; ask your Game Master for an override." };
  }

  rejectIfDisqualified() {
    if (!this.data.disqualified) return null;
    return { success: false, message: "GAME HALTED. Ask your Game Master to resume." };
  }

  // ---------------- Stage Progression ----------------
  setLevel(level) {
    this.data.currentLevel = level;
    if (level === 6) {
      this.data.timerRunning = false;
      sound.playCaseClosed();
    } else {
      sound.playUnlockLevel();
    }
    this.notify('LEVEL_CHANGED', { level });
    this.syncStatusToServer();
  }

  // ---------------- Authentication (Meera's Laptop) ----------------
  submitLoginPassword(password) {
    const clean = (password || '').trim();

    if (!clean) {
      sound.playError();
      return { success: false, message: "PLEASE ENTER AUTHENTICATION PASSWORD." };
    }

    if (clean !== LOCK_PASSWORD) {
      sound.playError();
      return { success: false, message: "INVALID AUTHENTICATION PASSWORD." };
    }

    if (!this.data.startTime) {
      this.data.startTime = Date.now();
    }
    this.data.currentLevel = 1;
    this.saveState();
    this.syncStatusToServer();
    sound.playSuccess();
    this.addLog("SYSTEM: Authentication successful. Session decrypted.");
    this.addEvent('LOGIN_SUCCESS', 'Team authenticated into the laptop.', { startTime: this.data.startTime });
    this.notify('LOGIN_SUCCESS', {});
    this.notify('LEVEL_CHANGED', { level: 1 });
    return { success: true, message: "ACCESS GRANTED." };
  }

  // ---------------- Anti-cheat: tab switch / app switch ----------------
  triggerTabSwitchViolation() {
    this.triggerGameplayViolation(
      'TAB / WINDOW SWITCH',
      'TAB_SWITCH_VIOLATION',
      (timestamp) => `Team switched tabs or minimized the browser at ${timestamp}. Game halted pending GM review.`
    );
  }

  triggerFullscreenExitViolation() {
    this.triggerGameplayViolation(
      'FULLSCREEN EXIT',
      'FULLSCREEN_EXIT_VIOLATION',
      (timestamp) => `Team exited fullscreen at ${timestamp}. Game halted pending GM review.`
    );
  }

  triggerGameplayViolation(reason, eventType, messageForTimestamp) {
    if (this.data.disqualified) return;
    if (this.data.currentLevel < 1 || this.data.currentLevel >= 6) return; // only during active play
    const timestamp = nowClock();
    this.data.disqualified = true;
    this.data.disqualifiedTimestamp = timestamp;
    this.data.disqualifiedReason = reason;
    this.pauseTimer();
    sound.playError();
    this.addLog(`VIOLATION: ${reason} detected at ${timestamp}. Game halted.`);
    this.addEvent(eventType, messageForTimestamp(timestamp), {
      timestamp,
      reason,
      stage: this.getStageLabel(this.data.currentLevel),
      statusBefore: 'ACTIVE',
      statusAfter: 'GAME HALTED'
    });
    this.syncStatusToServer();
    this.notify('TAB_SWITCH_VIOLATION', { timestamp, reason });
  }

  getStageLabel(level) {
    const count = this.getFinalizedCount();
    if (level === 0) return 'LOCK SCREEN';
    if (level === 6) return 'CASE CLOSED';
    if (count >= 3) return 'FINAL INVESTIGATION';
    if (count === 2 && this.isNettraceComplete()) return 'CCTV REVIEW';
    if (count === 2) return 'TRACE (NETTRACE)';
    if (count === 1) return 'DEBUG (RECOVERY_CODE)';
    return 'ACCESS (SUSPECTS_DB)';
  }

  // GM-only: clear a violation and resume play
  clearViolation() {
    if (!this.data.disqualified) return;
    const clearedReason = this.data.disqualifiedReason || 'gameplay';
    this.data.disqualified = false;
    this.data.disqualifiedTimestamp = null;
    this.data.disqualifiedReason = null;
    this.resumeTimer();
    this.addEvent('VIOLATION_CLEARED', `GM cleared the ${clearedReason} violation and resumed the game.`, { organizerAction: 'RESUME_GAME' });
    this.syncStatusToServer();
    
    // Also notify server via resume endpoint
    fetch(`/api/teams/${this.teamId}/resume`, { method: 'POST' }).catch(() => {});
    this.notify('VIOLATION_CLEARED', {});
  }

  // ---------------- Suspects DB helpers ----------------
  getSuspect(id) {
    const suspect = SUSPECTS.find(s => s.id === id);
    if (!suspect) return null;
    const finalization = this.data.finalizations.find(f => f.id === id) || null;
    return { ...suspect, finalization };
  }

  getAllSuspects() {
    return SUSPECTS.map(s => this.getSuspect(s.id));
  }

  isSuspectFinalized(id) {
    return this.data.finalizations.some(f => f.id === id);
  }

  getFinalizedCount() {
    return this.data.finalizations.length;
  }

  isNettraceComplete() { return !!this.data.fragments[3]; }
  isRecoveryCodeSolved() { return !!this.data.debugScriptFixed; }
  isCctvFullyViewed() { return !!(this.data.cctvCamsViewed.CAM01 && this.data.cctvCamsViewed.CAM02); }

  isRecoveryCodeLocked() { return this.getFinalizedCount() < 1; }
  isNettraceLocked() { return this.getFinalizedCount() < 2; }
  isCctvLocked() { return !this.isNettraceComplete(); }
  isFinalStageLocked() { return this.getFinalizedCount() < 3; }

  canFinalizeThirdSlot() {
    return this.isNettraceComplete() && this.isCctvFullyViewed();
  }

  markCctvCamViewed(camId) {
    if (this.data.cctvCamsViewed[camId]) return;
    this.data.cctvCamsViewed[camId] = true;
    this.addEvent('CCTV_CAM_VIEWED', `${camId} viewed at least once.`, { camId });
    this.notify('CCTV_CAM_VIEWED', { camId });
  }

  finalizeSuspect(id) {
    const expiredOrHalted = this.rejectIfExpired() || this.rejectIfDisqualified();
    if (expiredOrHalted) return expiredOrHalted;

    const suspect = SUSPECTS.find(s => s.id === id);
    if (!suspect) return { success: false, message: 'Unknown suspect record.' };

    if (this.isSuspectFinalized(id)) {
      return { success: false, alreadyFinalized: true, message: `${suspect.name} has already been finalized and cannot be changed.` };
    }

    const count = this.getFinalizedCount();
    if (count >= 3) {
      return { success: false, message: 'All 3 clearance slots are already finalized. Continue to the Final Investigation console.' };
    }

    // Suspect-specific progression gates (checked before the generic slot
    // gate below so their messaging always takes priority): Divya requires
    // recovery_code solved in at least one language; Ram requires nettrace
    // + both CCTV cameras viewed. All other suspects are unaffected.
    if (id === '05' && !this.isRecoveryCodeSolved()) {
      sound.playError();
      this.addEvent('SUSPECT_FINALIZE_BLOCKED', 'Attempted to finalize Divya Mehta before recovery_code was solved.', { id, timestamp: nowClock() });
      return { success: false, message: 'LEVEL LOCKED\nComplete the recovery code before finalizing this suspect.' };
    }
    if (id === '01' && !this.canFinalizeThirdSlot()) {
      sound.playError();
      this.addEvent('SUSPECT_FINALIZE_BLOCKED', 'Attempted to finalize Ram Sharma before nettrace + both CCTV cameras were complete.', { id, timestamp: nowClock() });
      return { success: false, message: 'INSUFFICIENT EVIDENCE\nComplete the required investigation before finalizing this suspect.' };
    }

    if (count === 2 && !this.canFinalizeThirdSlot()) {
      return { success: false, message: 'Solve nettrace in SERVER and watch BOTH CCTV camera feeds at least once before finalizing your 3rd suspect.' };
    }

    const timestamp = nowClock();
    const slot = count + 1;
    const isCorrect = suspect.type === 'MAIN';
    const record = { id, name: suspect.name, type: suspect.type, timestamp, slot, isCorrect };
    this.data.finalizations.push(record);
    sound.playUnlockLevel();

    this.addLog(`SUSPECTS_DB: Slot ${slot} finalized — ${suspect.name} (${suspect.type}) at ${timestamp}.`);
    this.addEvent('SUSPECT_FINALIZED', `Slot ${slot} finalized: ${suspect.name} (${suspect.type})`, {
      id,
      name: suspect.name,
      type: suspect.type,
      slot,
      timestamp,
      isCorrect,
      stage: this.getStageLabel(this.data.currentLevel)
    });
    this.notify('SUSPECT_FINALIZED', { id, slot, timestamp });

    if (slot === 1) {
      return { success: true, message: `${suspect.name} finalized (Slot 1 of 3).\nFinalized at: ${timestamp}\n\nACCESS GRANTED\nA new recovery file is now available.\nOpen recovery_code inside the SERVER folder.` };
    }
    if (slot === 2) {
      return { success: true, message: `${suspect.name} finalized (Slot 2 of 3).\nFinalized at: ${timestamp}\n\nnettrace is now accessible inside the SERVER folder.` };
    }
    if (slot === 3) {
      return { success: true, message: `${suspect.name} finalized (Slot 3 of 3).\nFinalized at: ${timestamp}\n\nAll clearance slots are complete.\nOpen the Final Investigation console to identify the person responsible.` };
    }
    return { success: true, message: `${suspect.name} finalized at ${timestamp}.` };
  }

  markRecoveryCodeSolved() {
    if (this.data.debugScriptFixed) return;
    this.data.debugScriptFixed = true;
    this.addLog('RECOVERY_CODE: All faults corrected. Archive replay complete.');
    this.addEvent('RECOVERY_CODE_SOLVED', 'recovery_code debugging puzzle solved — replay archive reconstructed.');
    this.notify('RECOVERY_CODE_SOLVED', {});
  }

  markNettraceComplete() {
    if (this.data.fragments[3]) return;
    this.data.fragments[3] = 'WS14';
    this.addLog('NETTRACE: Trace complete — origin workstation identified as WS-14.');
    this.addEvent('NETTRACE_SOLVED', 'nettrace / IP game solved — origin WS-14 identified. CCTV unlocked.');
    sound.playUnlockLevel();
    this.notify('NETTRACE_SOLVED', {});
  }

  submitFinalAccusation(murdererName, reasoning) {
    const blocked = this.rejectIfExpired() || this.rejectIfDisqualified();
    if (blocked) return blocked;
    if (this.isFinalStageLocked()) {
      return { success: false, message: 'Finalize all 3 clearance slots in suspects_db before submitting your final report.' };
    }
    const clean = (murdererName || '').trim();
    const cleanReasoning = (reasoning || '').trim();
    if (!clean) {
      return { success: false, message: 'Select the person you believe is responsible.' };
    }
    if (cleanReasoning.length < 20) {
      return { success: false, message: 'Please provide all 3 reasons with a bit more detail before submitting.' };
    }

    const timestamp = nowClock();
    this.data.finalMurderer = clean;
    this.data.finalReasoning = cleanReasoning;
    this.data.finalSubmissionTimestamp = timestamp;
    this.data.fragments[4] = clean.toUpperCase().includes('VERMA') ? 'NULLDEPT' : 'UNVERIFIED';

    this.addLog(`FINAL INVESTIGATION: Report submitted at ${timestamp} — accused: ${clean}.`);
    this.addEvent('FINAL_ACCUSATION_SUBMITTED', `Final suspect submitted: ${clean}`, {
      murderer: clean,
      reasoning: cleanReasoning,
      timestamp,
      submissionStatus: 'SUBMITTED'
    });
    sound.playSuccess();
    this.notify('FINAL_ACCUSATION_SUBMITTED', { murderer: clean, timestamp });
    return { success: true, timestamp };
  }

  submitRamPcLogin(username, password) {
    const blocked = this.rejectIfExpired() || this.rejectIfDisqualified();
    if (blocked) return blocked;
    const u = (username || '').trim().toLowerCase();
    const p = (password || '').trim();
    if (u === 'ramsharma@epoch' && p === 'ramsharma123') {
      const timestamp = nowClock();
      this.data.ramLoginSuccess = true;
      this.data.ramLoginTimestamp = timestamp;
      sound.playSuccess();
      this.addLog(`WS-14 LOGIN: ram.sharma authenticated at ${timestamp}.`);
      this.addEvent('RAM_PC_LOGIN_SUCCESS', `WS-14 (Ram Sharma) login successful at ${timestamp}.`, { timestamp });
      this.notify('RAM_PC_LOGIN_SUCCESS', { timestamp });
      return { success: true, message: 'LOGIN SUCCESSFUL. Welcome, ram.sharma.' };
    }
    sound.playError();
    this.addEvent('RAM_PC_LOGIN_FAILED', 'Incorrect WS-14 login attempt.', {});
    return { success: false, message: 'ACCESS DENIED. Invalid username or password.' };
  }

  stopDataWipe() {
    if (this.data.wipeStopped) return { success: true, alreadyStopped: true };
    const timestamp = nowClock();
    this.data.wipeStopped = true;
    this.data.wipeStoppedTimestamp = timestamp;
    this.setLevel(6);
    this.addLog(`CASE CLOSED: DATA WIPE STOPPED AT ${timestamp}. DATA RECOVERING.`);
    this.addEvent('WIPE_STOPPED', `Data wipe stopped at ${timestamp}. Recovery initiated.`, { timestamp });
    this.notify('WIPE_STOPPED', { timestamp });
    return { success: true, timestamp };
  }

  getWipePercent() {
    if (this.data.wipeStopped) return 0;
    if (this.data.finalSubmissionTimestamp) return 92;
    const count = this.getFinalizedCount();
    if (count >= 3) return 78;
    if (this.isNettraceComplete() && count >= 2) return 70;
    if (count >= 2) return 68;
    if (this.isNettraceComplete()) return 63;
    if (count >= 1) return 55;
    if (this.data.currentLevel >= 1) return 47;
    return 0;
  }

  forceUnlockThrough(stageKey) {
    const order = ['SLOT1', 'SLOT2', 'NETTRACE_CCTV', 'SLOT3', 'FINAL', 'SOLVED'];
    const idx = order.indexOf(stageKey);
    if (idx < 0) return;
    if (!this.data.startTime) this.data.startTime = Date.now();
    this.data.currentLevel = 1;
    this.data.finalizations = [];
    if (idx >= 0) this.data.finalizations.push({ id: '02', name: 'Prof. Anand Rao', type: 'MAIN', timestamp: nowClock(), slot: 1, isCorrect: true });
    if (idx >= 1) { this.data.finalizations.push({ id: '05', name: 'Divya Mehta', type: 'MAIN', timestamp: nowClock(), slot: 2, isCorrect: true }); this.data.debugScriptFixed = true; }
    if (idx >= 2) { this.data.fragments[3] = 'WS14'; this.data.cctvCamsViewed = { CAM01: true, CAM02: true }; }
    if (idx >= 3) this.data.finalizations.push({ id: '01', name: 'Ram Sharma', type: 'MAIN', timestamp: nowClock(), slot: 3, isCorrect: true });
    if (idx >= 5) {
      this.data.finalMurderer = 'GM TEST';
      this.data.finalReasoning = '1) GM test shortcut. 2) GM test shortcut. 3) GM test shortcut.';
      this.data.finalSubmissionTimestamp = nowClock();
      this.data.ramLoginSuccess = true;
      this.data.ramLoginTimestamp = nowClock();
      this.stopDataWipe();
    }
    this.addEvent('GM_FORCE_STAGE', `GM force-unlocked through stage: ${stageKey}`);
    this.notify('GAME_RESET', {});
  }

  resetGame() {
    this.addEvent('GAME_RESET', 'GM reset the station for the next team.');
    this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.saveState();
    this.syncStatusToServer();
    this.notify('GAME_RESET', {});
    this.initTimer();
  }
}

export const gameState = new GameState();

