# THE EPOCH — Tech Investigation Escape Room

> **A story-driven, technology-themed escape room combining web-based investigation, coding, networking, CCTV analysis, physical evidence, and real-time team gameplay.**
>
> **SWExPRESIDENCY UNIVERSITY EVENT ONLY:** This project was created exclusively for the SWExPRESIDENCY UNIVERSITY EVENT. It is not intended for any other event, product, or independent use.

For the full implementation walkthrough, puzzle answers, and organizer runbook, see [GUIDE.md](GUIDE.md). That document contains spoilers and must not be distributed to participants.

## Overview

THE EPOCH is a browser-based investigation experience with a physical evidence layer. Players act as an Emergency Recovery Squad investigating a compromised computer after suspicious grant-ledger activity. An automated wipe is destroying data while teams work through a connected chain of access, code debugging, network tracing, CCTV review, and final accusation.

The experience was designed for:

- Team-based, collaborative play
- Simultaneous participation by multiple teams
- A mix of digital interfaces and physical props
- Technical puzzles that remain accessible to non-specialists
- Live organizer monitoring and intervention

## Gameplay Pipeline

```text
ACCESS
  |
  v
INVESTIGATE suspects_db
  |
  v
DEBUG recovery_code
  |
  v
TRACE nettrace
  |
  v
REVIEW CCTV / travel / parking evidence
  |
  v
FINAL INVESTIGATION
  |
  v
STOP THE WIPE
```

Progress is stored per team. The interface unlocks later stages only after the required earlier actions are recorded.

## Requirements

### Players

- A modern browser with JavaScript enabled
- A unique team ID supplied by the organizers
- The in-game access password and the physical prop set for the event

### Host

- Node.js 22 and npm
- Port `3000` available, or a different `PORT` value configured
- A writable directory for team state
- A shared local network for multiple player stations
- A strong `GM_PASSWORD` for organizer access
- Internet access if the browser must fetch the configured Google Fonts

## Quick Start

```bash
npm install
```

PowerShell:

```powershell
$env:GM_PASSWORD = "use-a-unique-event-password"
npm start
```

Bash:

```bash
GM_PASSWORD="use-a-unique-event-password" npm start
```

Open `http://localhost:3000`.

`START_GAME.bat` can also be used on Windows, but it requires `GM_PASSWORD` to be set first. If `GM_PASSWORD` is not set, the server still starts and the public game remains available, but GM login and GM APIs return a configuration error.

## Team URLs

Open one browser per team at:

```text
http://<host-lan-ip>:3000/?team=TEAM01
```

Examples:

```text
http://localhost:3000/?team=TEAM01
http://192.168.1.20:3000/?team=TEAM02
```

Each team must use a unique ID. If `TEAM_IDS` is configured, only listed IDs are accepted. Teams sharing one ID do not share full browser-side puzzle progress; they share only server-visible status and events.

## Game Master Control

From the lock screen, open **GAME MASTER CONTROL** on the organizer device. The GM panel supports:

- Team monitoring and status badges
- Per-team control actions
- Halt and authenticated resume
- Timer adjustments
- Full reset
- Final submission review
- Event log filtering
- Team deletion from the server-side state

GM APIs require a password-backed session cookie. The session lasts eight hours.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `GM_PASSWORD` | unset | Enables GM login and authenticated GM APIs |
| `TEAM_IDS` | unset | Optional comma-separated team allowlist |
| `MAX_TEAMS` | `500` | Maximum retained team records |
| `DATA_DIR` | repository `data` | Writable directory containing `teams.json` |

For remote hosting, use HTTPS. The built-in LAN server uses HTTP and does not encrypt the GM password or session cookie in transit.

## Health Check

```text
GET /api/status
```

A running server returns JSON containing `status: "online"`, the game name, version, and an IST timestamp.

## Tests

```bash
npm test
```

The suite runs 12 tests covering fullscreen behavior, the complete player flow through the wipe, suspects-db SQL behavior, and a 75-team concurrent load/GM-control scenario. Before an event, also run the full flow on the actual host, network, and player devices.

## Docker

The included `Dockerfile` uses `node:22-alpine`, exposes port `3000`, declares `/app/data` as a volume, and checks `/api/status` for health.

Example:

```bash
docker build -t the-epoch .
docker run --rm -p 3000:3000 -e GM_PASSWORD="use-a-unique-event-password" -v the-epoch-data:/app/data the-epoch
```

## Data and Persistence

- Team state is stored in `data/teams.json`.
- `data/teams.json` is runtime data and is ignored by Git.
- The server is a single Node.js process with JSON-file persistence, not a horizontally scaled database-backed service.
- Use persistent storage for `DATA_DIR` when hosting; ephemeral filesystems lose team state on restart or redeploy.
- Event logs and GM-only views are served through authenticated APIs rather than player browser storage.

## Architecture

```text
Player browsers
      |
      v
Express server
      |
      +-- Static browser app
      +-- Status/event APIs
      +-- Team state APIs
      +-- GM-authenticated APIs
      |
      v
data/teams.json
```

The server is CommonJS (`require`). Browser modules use native ES module imports. The package intentionally has no `"type": "module"`; Node may print a `MODULE_TYPELESS_PACKAGE_JSON` warning when tests import browser ES modules, but the suite passes.

## Project Structure

```text
escape-room/
├── assets/
│   ├── boarding_gate_list.png
│   ├── cam_cctv.mp4
│   ├── parking.jpeg
│   └── recovery_code_console.html
├── css/
│   ├── components.css
│   └── style.css
├── data/
│   └── teams.json
├── js/
│   ├── components/
│   │   ├── cctvViewer.js
│   │   ├── codeEditor.js
│   │   ├── networkViewer.js
│   │   ├── organizerModal.js
│   │   ├── restoreViewer.js
│   │   ├── serverFolderViewer.js
│   │   ├── suspectsDbViewer.js
│   │   ├── suspectsSql.mjs
│   │   └── terminal.js
│   ├── data/
│   │   ├── dossiers.js
│   │   └── props.js
│   ├── app.js
│   ├── audio.js
│   ├── fullscreen-controller.mjs
│   ├── gm-dashboard.mjs
│   └── state.js
├── test/
│   ├── fullscreen.test.mjs
│   ├── game-flow.test.mjs
│   ├── load.test.mjs
│   └── suspects-sql.test.mjs
├── Dockerfile
├── GUIDE.md
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── server.js
├── START_GAME.bat
└── .gitignore
```

## Fair Play Behavior

The game requests fullscreen on the first player interaction and retries after login. During active play, tab hiding and fullscreen exit can halt the session and log a violation; an authenticated GM must resume it.

These are best-effort browser signals. A webpage cannot force fullscreen on load, block OS shortcuts, prevent screenshots, or stop a determined player from inspecting content already delivered to the browser. Use managed kiosk mode where strict station control is required.

## Disclaimer

THE EPOCH is a fictional investigation and escape-room experience created exclusively for the SWExPRESIDENCY UNIVERSITY EVENT. All characters, organizations, records, incidents, and investigation scenarios are fictional. It is not intended for use outside this event.
