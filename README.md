# THE EPOCH — Tech Investigation Escape Room

> **A story-driven, technology-themed escape room combining web-based investigation, coding, networking, CCTV analysis, physical evidence, and real-time team gameplay.**
>
> **SWExPRESIDENCY UNIVERSITY EVENT ONLY:** This project was created exclusively for the SWExPRESIDENCY UNIVERSITY EVENT. It is not intended for any other event, product, or independent use.

---

## 🕵️ Overview

**THE EPOCH** is an interactive technology investigation and escape-room experience designed around a fictional digital security incident.

Players enter the role of an **Emergency Recovery Squad** tasked with investigating a compromised computer system before an automated data wipe permanently destroys the evidence.

The experience combines a **browser-based interactive computer environment** with **physical investigation props**, requiring participants to move between digital interfaces, physical clues, programming challenges, networking puzzles, CCTV footage, and evidence-based decision making.

The game was designed to be:

- Technical, but accessible to non-experts
- Story-driven rather than purely puzzle-based
- Collaborative and team-oriented
- A combination of physical and digital gameplay
- Suitable for simultaneous participation by multiple teams
- Manageable by organizers during a live event

---

## 🏆 Created for the SWExPRESIDENCY UNIVERSITY EVENT

**THE EPOCH was developed specifically for the SWExPRESIDENCY UNIVERSITY EVENT.** The experience is intended only as part of this event.

The goal is to create an **interactive investigation** combining technical challenges with a connected story, rather than a conventional coding or quiz competition.

Participants investigate the incident, solve interconnected challenges, collect evidence, and reach a final conclusion within the event's scheduled play period.

### Event Format

```text
Event        : SWExPRESIDENCY UNIVERSITY EVENT
Experience   : THE EPOCH
Format       : Tech Investigation Escape Room
Participation: Team-based
Gameplay     : Digital + Physical
Use          : This event only
```

---

## 🎬 The Story

The investigation begins with **Meera Kapoor**.

Meera discovers suspicious irregularities in sensitive grant records stored within her system. Shortly afterward, her computer is compromised and an automated system wipe begins.

**The evidence is at risk.**

Participants are brought in as an emergency recovery team with one objective:

> Investigate the system, recover the evidence, determine what happened, and stop the wipe before it is too late.

The investigation gradually moves from simple system access into programming, networking, surveillance, and evidence correlation.

---

## 🧩 Gameplay

The complete experience follows a progressive investigation pipeline:

```text
┌─────────┐
│ ACCESS  │
└────┬────┘
     ↓
┌─────────┐
│ DEBUG   │
└────┬────┘
     ↓
┌─────────┐
│ TRACE   │
└────┬────┘
     ↓
┌─────────┐
│ RECOVER │
└────┬────┘
     ↓
┌─────────┐
│ RESTORE │
└─────────┘
```

Each stage unlocks information required for the next stage, creating a connected investigation rather than a collection of independent puzzles.

### 1. ACCESS — Enter Meera's System

Players begin at Meera's computer authentication screen.

After successfully accessing the system, players enter an interactive desktop environment that becomes the central hub for the investigation.

From the desktop, teams can access different digital tools, databases, and evidence.

### 2. INVESTIGATE — Suspect Database

The investigation begins with a digital suspect database containing multiple dossiers.

Participants must examine the available information and correlate it with physical evidence supplied during the event.

The database contains:

- Main investigation subjects
- Witnesses
- Decoy dossiers
- Statements
- Supporting information

Players are required to make evidence-based decisions rather than simply guessing.

Certain suspects can only be finalized after completing the relevant investigation requirements.

### 3. DEBUG — Programming Challenge

Progressing through the investigation unlocks a corrupted recovery-code challenge.

Participants must inspect the code, identify intentional programming errors, and correct them.

The challenge was designed to be approachable for participants with different programming backgrounds and can be solved using one of multiple supported programming languages.

The intentionally introduced errors involve concepts including:

- Indentation
- Equality comparison
- Variable naming
- Range and indexing
- Program logic

The challenge demonstrates how programming knowledge can become part of an investigation rather than existing as an isolated coding question.

### 4. TRACE — Network Investigation

After the debugging stage, players gain access to a network tracing interface.

Teams must analyze the available network information and determine which workstation is relevant to the investigation.

The network investigation leads to:

**WS-14**

Successfully solving the network challenge unlocks the surveillance stage.

### 5. RECOVER — CCTV & Travel Evidence

The next stage introduces surveillance evidence.

Players investigate multiple sources, including:

- Building corridor/office footage
- Executive parking footage
- Boarding/gate information

The objective is not simply to watch the footage, but to correlate timestamps, locations, and other available evidence with information discovered earlier in the investigation.

This creates a chain between the digital investigation, network analysis, and physical evidence.

### 6. FINAL INVESTIGATION — Build the Case

Once the required investigation stages have been completed, teams must make their final submission.

The system records:

- Final suspect
- Written reasoning
- Submission timestamp

The written reasoning is an important part of the investigation because participants must explain why their conclusion follows from the evidence they discovered.

### 7. RESTORE — Stop the System Wipe

The final objective is to access the recovery environment and stop the automated system wipe.

Successfully completing the final stage results in:

- **EVIDENCE RESTORED**
- **DATA WIPE STOPPED**
- **SYSTEM SECURED**

The team has successfully completed the investigation.

---

## 🧠 Physical + Digital Investigation

A major feature of THE EPOCH was its hybrid gameplay model.

The experience was intentionally designed so that participants could not rely exclusively on the website.

Alongside the digital game, teams were provided with physical investigation props that formed part of the evidence chain.

These included physical documents, clue materials, dossiers, and other investigation resources prepared specifically for the event.

Participants had to:

- Examine physical evidence
- Search for relevant information
- Compare physical and digital clues
- Correlate information across sources
- Discuss findings with teammates
- Use evidence to progress through the digital system

This created a physical-digital bridge:

```text
       PHYSICAL EVIDENCE
              │
              ▼
       CLUE / INFORMATION
              │
              ▼
      DIGITAL INVESTIGATION
              │
              ▼
       TECHNICAL CHALLENGE
              │
              ▼
        NEW EVIDENCE
              │
              └───────────────┐
                              ▼
                    PHYSICAL + DIGITAL
                       CORRELATION
```

---

## 📄 Physical Props Documentation

Physical materials prepared for the SWExPRESIDENCY UNIVERSITY EVENT can be included in this repository as supplementary documentation.

Recommended structure:

```text
docs/
└── THE_EPOCH_Physical_Props.pdf
```

The PDF can contain the physical documents, clue cards, dossiers, and other materials created for the live event.

> ⚠️ **Warning:** The physical props may contain clues, answers, or investigation information. They are therefore intended as project documentation and should not be distributed to participants before gameplay.

---

## ⏱️ Time-Based Gameplay

THE EPOCH was designed around a **60-minute investigation window**.

The time constraint adds urgency to the investigation while requiring teams to decide how to divide their effort between:

- Physical clues
- Digital investigation
- Programming
- Networking
- Surveillance
- Evidence correlation

The objective was to make time management and team communication meaningful parts of the experience.

---

## 🖥️ Interactive Game Environment

Rather than presenting the challenges as separate webpages, THE EPOCH simulates a computer environment.

The player interacts with different components through the system interface, including:

- Desktop environment
- Suspect database
- Code editor
- Network tracing interface
- Server/recovery interface
- CCTV viewer
- Restore interface

The application uses progression-based unlocking so that completing one stage can reveal or enable the next part of the investigation.

---

## 🧑‍💼 Organizer Control

A dedicated organizer control system was implemented to help manage the live event.

The organizer interface can track team-specific information such as:

- Current stage
- Timer
- Game status
- Halt state
- Halt reason
- Suspect finalizations
- Final suspect
- Final reasoning
- Submission timestamp
- Wipe status
- Event logs

Organizer controls also support:

- Monitoring teams
- Selecting one active team for station jumps, timer adjustments, and full reset
- Reviewing submissions
- Halting a team session
- Resuming a halted session
- Deleting a team's server-side session and event history from the All Teams dashboard
- Reviewing game events

This was particularly important for the live event because multiple teams were playing simultaneously.

Open **GAME MASTER CONTROL** on the lock screen from the host laptop to monitor teams without starting a player session. All player devices must connect to that same server (for example, `http://<host-lan-ip>:3000/?team=TEAM01`) and use a unique team ID.

### Concurrent Teams & Event Logs

The server was load-tested with 50 simultaneous team event submissions and, separately, 50 concurrent status polls. Use a unique team ID for each team; game progress is stored in each team's browser, so teams sharing one ID across multiple devices do not share full puzzle progress. This is a single Node.js server with JSON-file persistence, not a horizontally scaled or database-backed deployment.

The GM event log can show the latest 500 events across all teams or filter by team and event type. Team summaries and submissions are fetched separately from event history to keep dashboard refreshes small.

---

## 🔒 Anti-Cheating & Fair Play System

The game includes a dedicated fair-play system to help organizers protect the integrity of the live investigation.

### Fullscreen & Tab-Switch Detection

On the first click or keypress, the game requests fullscreen, and it retries after successful login. Browsers require a user gesture for this and let players leave fullscreen (for example with Esc); a website cannot enter fullscreen automatically on page load or disable tab/app switching, operating-system shortcuts, or browser developer tools. Use managed kiosk mode if a station must start in fullscreen.

When the browser reports that the game tab is hidden during active play:

- The session is **immediately halted**
- A **GAME HALTED** screen is displayed, along with the exact timestamp of the violation
- The team's on-screen timer is paused until an authenticated Game Master resumes the session

Exiting fullscreen during active gameplay triggers the same halt, records `FULLSCREEN EXIT` in the server event log, and appears in the GM team dashboard. Other devices using that team ID receive the halted state through server polling.

This is a best-effort visibility check, not a way to prevent switching or prove intent; browser and operating-system behavior can limit what a page detects.

### Organizer-Controlled Resume

Halted sessions can only be resumed by an organizer through the password-protected **GM Control** panel, keeping the decision to continue or penalize a team entirely in the hands of the event organizers rather than automated logic alone.

### Context-Menu Deterrent

Right-click and context-menu access is disabled as a usability deterrent. It cannot prevent screenshots, image search, or inspection of content already delivered to the browser.

### Violation Logging

Event logs and team submissions are served only through Game Master-authenticated APIs and are no longer persisted in player browser storage. The server and its operators remain trusted; browser-delivered game clues and client code are still inspectable by a determined player.

---

## 🏗️ Technical Architecture

```text
                         PLAYER COMPUTERS
                    ┌─────────┬─────────┬─────────┐
                    │ Team 01 │ Team 02 │ Team .. │
                    └────┬────┴────┬────┴────┬────┘
                         │         │         │
                         └─────────┼─────────┘
                                   │
                                   ▼
                        ┌────────────────────┐
                        │   EXPRESS SERVER   │
                        │      Node.js       │
                        └─────────┬──────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
          Game Components     REST APIs       Team State
                 │                                 │
                 │                                 ▼
                 │                            teams.json
                 │
                 ▼
        ┌──────────────────────────────────────┐
        │                                      │
        │ ACCESS → DEBUG → TRACE → RECOVER     │
        │                          → RESTORE   │
        │                                      │
        └──────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend

- HTML5
- CSS3
- JavaScript
- Modular JavaScript components
- Interactive browser UI

### Backend

- Node.js
- Express.js
- REST APIs

### Data Management

- JSON-based team state
- `data/teams.json` is private runtime data and is ignored by Git; prior commits may still contain historical records
- Event logging
- Team progression tracking
- Investigation timestamps
- Final submission tracking

### Development & Deployment

- Git
- GitHub
- Render
- Node Package Manager (npm)

---

## 📁 Project Structure

```text
escape-room/
│
├── assets/
│   ├── boarding_gate_list.png
│   ├── cam_cctv.mp4
│   ├── parking.jpeg
│   └── recovery_code_console.html
│
├── css/
│   ├── components.css
│   └── style.css
│
├── data/
│   └── teams.json
│
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
│   │
│   ├── data/
│   │   ├── dossiers.js
│   │   └── props.js
│   │
│   ├── app.js
│   ├── audio.js
│   ├── fullscreen-controller.mjs
│   ├── gm-dashboard.mjs
│   └── state.js
│
├── test/
│   ├── fullscreen.test.mjs
│   ├── load.test.mjs
│   └── suspects-sql.test.mjs
│
├── Dockerfile
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── server.js
├── START_GAME.bat
└── .gitignore
```

---

## 🧪 Testing & Event Validation

Run the automated checks with `npm test`. Before the event, organizers should also verify the full player flow on the actual host, network, and devices.

Testing covered:

- Authentication flow
- Desktop navigation
- Suspect database
- Investigation progression
- Code debugging
- Network tracing
- CCTV functionality
- Evidence progression
- Final suspect submission
- Written reasoning submission
- Timer behaviour
- Team-specific state
- Organizer controls
- Halt/resume functionality
- System wipe sequence
- Final restoration
- Deployment and hosted gameplay

The application is designed for event-hosted gameplay. Validate the selected host, network, and Game Master access before the SWExPRESIDENCY UNIVERSITY EVENT.

---

## 🚀 Run Locally

### Prerequisites

#### For players

- The game URL from the event organizers and a modern browser with JavaScript enabled
- A unique team ID for the team's station; teams on separate stations must not share IDs
- The in-game authentication password and any physical evidence/props provided by the event organizers

#### To host the game

- **Node.js 22** (the version used by the included Dockerfile) and its bundled **npm**
- A host machine with port **3000** available, or configure the `PORT` environment variable
- A unique **`GM_PASSWORD`** environment variable; it is required to start the server and access Game Master controls
- For multiple player stations, a shared local network and the host machine's LAN address
- Internet access if the browser needs to download the Google Fonts used by the interface

Obtain the repository URL from the SWExPRESIDENCY UNIVERSITY EVENT organizers, clone it, and open the resulting project folder before proceeding.

### Install Dependencies

```bash
npm install
```

### Start the Application

Set a Game Master password in the server environment before starting. Do not put it in client-side JavaScript or commit it to the repository.

PowerShell:

```powershell
$env:GM_PASSWORD = "use-a-unique-event-password"
npm start
```

For bash:

```bash
GM_PASSWORD="use-a-unique-event-password" npm start
```

For Render, set `GM_PASSWORD` in the service's environment variables. `START_GAME.bat` also requires this variable to be set in the environment from which it is launched.
Use HTTPS for remote hosting: the built-in LAN server uses HTTP, which does not encrypt the GM password or session cookie in transit. To truly lock stations against switching, use an operating-system/browser kiosk configuration; a web page cannot enforce that restriction.

### Open

```text
http://localhost:3000
```

---

## 🌐 Deployment

THE EPOCH was deployed as a Node.js web service using **Render**.

The deployment workflow was:

```text
LOCAL DEVELOPMENT
       ↓
     TESTING
       ↓
       GIT
       ↓
    GITHUB
       ↓
     RENDER
       ↓
   LIVE EVENT
```

The project repository is connected to the deployment environment, allowing updates to be developed locally, committed through Git, pushed to GitHub, and deployed to the hosted application.

---

## 🎯 Design Philosophy

THE EPOCH was designed around several principles.

### Technical Accessibility

The game introduces programming, networking, digital systems, and investigation concepts without requiring participants to be cybersecurity experts.

### Connected Puzzles

Challenges are connected to the overall investigation instead of functioning as unrelated questions.

### Evidence Over Guessing

Participants are encouraged to build their conclusion by correlating multiple pieces of evidence.

### Physical + Digital Integration

Physical props and digital interfaces were designed to complement one another.

### Team-Based Problem Solving

Different team members can investigate different evidence sources simultaneously and combine their findings.

### Live Event Scalability

The application was designed to support multiple teams playing simultaneously during a college event.

### Immersion

The interface, story, evidence, surveillance footage, system messages, and physical materials were designed to make participants feel like they were actually investigating a compromised system.

---

## 📊 Project Outcome

THE EPOCH was successfully taken from initial ideation to a live, deployed event experience.

The project involved:

```text
IDEATION
   ↓
GAME DESIGN
   ↓
STORY & PUZZLE DEVELOPMENT
   ↓
PHYSICAL PROP CREATION
   ↓
WEB DEVELOPMENT
   ↓
TESTING
   ↓
DEPLOYMENT
   ↓
LIVE EVENT
```

The project is prepared as the digital component of the SWExPRESIDENCY UNIVERSITY EVENT.

This project therefore involved not only software development, but also:

- Event-oriented product design
- Interactive experience design
- Puzzle design
- Physical material creation
- Full-stack development
- Testing
- Deployment
- Live technical operations

---

## 🔮 Future Improvements

Potential future versions of THE EPOCH could include:

- Persistent cloud database
- Real-time organizer dashboard
- Real-time team monitoring
- Advanced event analytics
- Automatic scoring
- More branching investigation paths
- Dynamic difficulty
- Additional programming challenges
- More networking challenges
- Expanded CCTV investigation
- More sophisticated evidence correlation
- Improved authentication and authorization
- Dedicated event administration backend
- Cloud-based state persistence
- Automated team performance reports
- Additional physical-digital puzzle interactions

---

## 📜 Disclaimer

THE EPOCH is a fictional investigation and escape-room experience created exclusively for the SWExPRESIDENCY UNIVERSITY EVENT. It is not intended for use outside this event.

The characters, organizations, records, incidents, and investigation scenario presented within the game are fictional.

---

