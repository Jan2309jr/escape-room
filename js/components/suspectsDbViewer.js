import { gameState } from '../state.js';
import { sound } from '../audio.js';
import { executeSuspectsSql, SUSPECTS_SCHEMA } from './suspectsSql.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class SuspectsDbViewerComponent {
  constructor(container) {
    this.container = container;
    this.database = 'epochcorp';
    this.selectedId = null;
    this.entries = [];
    this.render();
    this.bindEvents();

    gameState.subscribe((event) => {
      if (['SUSPECT_FINALIZED', 'NETTRACE_SOLVED', 'CCTV_CAM_VIEWED', 'GAME_RESET'].includes(event)) {
        this.render();
        this.bindEvents();
      }
    });
  }

  render() {
    const count = gameState.getFinalizedCount();
    this.container.innerHTML = `
      <div class="sdb-sql-layout">
        <div class="sdb-sql-heading">
          <span class="folder-title-tag">/suspects_db — READ-ONLY MYSQL CONSOLE</span>
          <span class="sdb-stage-hint">SLOT ${Math.min(count + 1, 3)} OF 3</span>
        </div>

        <section class="sdb-schema-panel" aria-label="Suspect table schema">
          <div class="sdb-sql-section-title">TABLE SCHEMA — ${this.database}.suspects</div>
          <div class="sdb-schema-scroll">
            <table class="cyber-table sdb-schema-table">
              <thead><tr><th>FIELD</th><th>TYPE</th><th>NULL</th><th>KEY</th></tr></thead>
              <tbody>
                ${SUSPECTS_SCHEMA.map(column => `
                  <tr>
                    <td><code>${escapeHtml(column.name)}</code></td>
                    <td>${escapeHtml(column.type)}</td>
                    <td>${column.nullable ? 'YES' : 'NO'}</td>
                    <td>${column.key || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="sdb-schema-caption"><strong>TABLE NAME: suspects</strong> · 10 personnel records · read-only access</div>
        </section>

        <details class="sdb-sql-help">
          <summary>SQL COMMAND REFERENCE</summary>
          <div class="sdb-sql-help-content">
            <div><code>HELP;</code> · <code>SHOW DATABASES;</code> · <code>USE epochcorp;</code> · <code>SELECT DATABASE();</code></div>
            <div><code>SHOW TABLES;</code> · <code>DESCRIBE suspects;</code> · <code>SHOW COLUMNS FROM suspects;</code></div>
            <div><code>SHOW CREATE TABLE suspects;</code></div>
            <div><code>SELECT * FROM suspects;</code></div>
            <div><code>SELECT * FROM epochcorp.suspects;</code> (fully qualified)</div>
            <div><code>SELECT id, name, type FROM suspects WHERE type = 'MAIN';</code></div>
            <div><code>SELECT name, role FROM suspects WHERE name LIKE '%Ram%' ORDER BY name ASC LIMIT 5;</code></div>
            <small>SELECT supports column lists, WHERE comparisons (=, !=, &lt;&gt;, &gt;, &lt;, &gt;=, &lt;=, LIKE) joined with AND, ORDER BY, and LIMIT. Data-changing commands are disabled.</small>
          </div>
        </details>

        <section class="sdb-sql-terminal" aria-label="SQL command line">
          <div class="sdb-sql-terminal-bar">
            <span>mysql&gt; investigator@${escapeHtml(this.database)}</span>
            <span>CONNECTED · READ ONLY</span>
          </div>
          <div class="sdb-sql-output" aria-live="polite">
            ${this.entries.map(entry => `
              <div class="sdb-sql-entry">
                ${entry.command ? `<div class="sdb-sql-command">mysql&gt; ${escapeHtml(entry.command)}</div>` : ''}
                ${entry.message ? `<div class="${entry.error ? 'sdb-sql-error' : 'sdb-sql-message'}">${escapeHtml(entry.message)}</div>` : ''}
                ${entry.result ? this.renderResult(entry.result) : ''}
              </div>
            `).join('')}
          </div>
          <div class="sdb-sql-input-row">
            <label for="sdb-sql-input">mysql&gt;</label>
            <input id="sdb-sql-input" type="text" autocomplete="off" spellcheck="false"
              placeholder="Try: SELECT * FROM suspects;" aria-label="SQL command">
            <button id="sdb-sql-run" class="term-btn-small">RUN</button>
          </div>
          <div class="sdb-finalize-bar ${this.selectedId ? '' : 'hidden'}" id="sdb-finalize-bar">
            <span>Record selected — finalizing cannot be undone.</span>
            <button id="sdb-finalize-btn" class="sdb-finalize-btn">FINALIZE RECORD</button>
          </div>
        </section>
      </div>
    `;
  }

  renderResult(result) {
    if (!result.columns.length) return '';
    const selectable = result.selectable && result.rows.length > 0;
    return `
      <div class="sdb-sql-result-scroll">
        <table class="cyber-table sdb-sql-result-table">
          <thead>
            <tr>${selectable ? '<th>SELECT</th>' : ''}
              ${result.columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${result.rows.length ? result.rows.map(row => `
              <tr class="${selectable ? `sdb-selectable-row ${this.selectedId === row.suspectId ? 'selected' : ''}` : ''}"
                ${selectable ? `data-suspect-id="${escapeHtml(row.suspectId)}" tabindex="0" aria-label="Select ${escapeHtml(row.values.name || `record ${row.suspectId}`)}"` : ''}>
                ${selectable ? `<td><input type="radio" name="sdb-record-select" class="sdb-record-select" data-id="${escapeHtml(row.suspectId)}" aria-label="Select record ${escapeHtml(row.suspectId)}" ${gameState.isSuspectFinalized(row.suspectId) ? 'disabled title="Already finalized"' : ''} ${this.selectedId === row.suspectId ? 'checked' : ''}></td>` : ''}
                ${result.columns.map(column => `<td>${escapeHtml(row.values[column] ?? 'NULL')}</td>`).join('')}
              </tr>
            `).join('') : `<tr><td colspan="${result.columns.length + (selectable ? 1 : 0)}">Empty set (0 rows)</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  bindEvents() {
    const input = this.container.querySelector('#sdb-sql-input');
    const runButton = this.container.querySelector('#sdb-sql-run');
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this.execute(input);
      });
    }
    if (runButton && input) runButton.addEventListener('click', () => this.execute(input));

    this.container.querySelectorAll('.sdb-record-select').forEach(radio => {
      radio.addEventListener('change', () => {
        this.selectRecord(radio);
      });
    });

    this.container.querySelectorAll('.sdb-selectable-row').forEach(row => {
      const selectRow = () => {
        const radio = row.querySelector('.sdb-record-select');
        if (radio) this.selectRecord(radio);
      };
      row.addEventListener('click', selectRow);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRow();
        }
      });
    });

    const finalizeButton = this.container.querySelector('#sdb-finalize-btn');
    if (finalizeButton) {
      finalizeButton.addEventListener('click', () => {
        if (!this.selectedId) return;
        const result = gameState.finalizeSuspect(this.selectedId);
        if (result.success) {
          sound.playUnlockLevel();
          this.selectedId = null;
          this.entries.push({ command: '', message: result.message, error: false });
        } else if (result.alreadyFinalized) {
          this.selectedId = null;
          this.entries.push({ command: '', message: result.message, error: true });
          sound.playError();
        } else {
          this.entries.push({ command: '', message: result.message, error: true });
          sound.playError();
        }
        this.render();
        this.bindEvents();
      });
    }
  }

  selectRecord(radio) {
    if (radio.disabled) return;
    this.selectedId = radio.getAttribute('data-id');
    this.container.querySelectorAll('.sdb-record-select').forEach(choice => {
      choice.checked = choice === radio;
    });
    this.container.querySelectorAll('.sdb-selectable-row').forEach(row => {
      row.classList.toggle('selected', row.getAttribute('data-suspect-id') === this.selectedId);
    });
    const finalizeBar = this.container.querySelector('#sdb-finalize-bar');
    if (finalizeBar) finalizeBar.classList.remove('hidden');
  }

  execute(input) {
    const command = input.value.trim();
    if (!command) return;
    input.value = '';
    this.selectedId = null;

    try {
      const result = executeSuspectsSql(command, gameState.getAllSuspects(), this.database);
      this.database = result.database;
      this.entries.push({ command, message: result.message, result, error: false });
    } catch (error) {
      this.entries.push({ command, message: `ERROR: INVALID COMMAND — ${error.message}`, error: true });
      sound.playError();
    }

    this.entries = this.entries.slice(-12);
    this.render();
    this.bindEvents();
    const output = this.container.querySelector('.sdb-sql-output');
    if (output) output.scrollTop = output.scrollHeight;
    const nextInput = this.container.querySelector('#sdb-sql-input');
    if (nextInput) nextInput.focus();
    sound.playKeyClick();
  }
}
