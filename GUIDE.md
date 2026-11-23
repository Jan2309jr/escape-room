# THE EPOCH — Organizer Guide

This document contains the complete implementation walkthrough and solutions. It is for event organizers and volunteers only. Do not give it to participants.

## Scope

THE EPOCH was created exclusively for the SWExPRESIDENCY UNIVERSITY EVENT. All names, organizations, records, and incidents are fictional.

## Organizer Runbook

### Before the Event

1. Install dependencies with `npm install`.
2. Set a unique `GM_PASSWORD` in the server environment.
3. Optionally set `TEAM_IDS`, `MAX_TEAMS`, and `DATA_DIR`.
4. Start the server with `npm start` or `START_GAME.bat`.
5. Confirm `GET http://localhost:3000/api/status` returns `status: "online"`.
6. Open `http://localhost:3000` and use **GAME MASTER CONTROL** on the organizer device.
7. Assign one unique team ID per station.
8. Give each team the matching URL, for example `http://<host-lan-ip>:3000/?team=TEAM01`.
9. Distribute only the physical props intended for participants. Do not distribute this guide.

### During the Event

Use the GM panel to:

- Watch team stage and wipe status
- Review final suspect and written reasoning
- Halt a team for a rule violation
- Resume only after verifying the situation
- Adjust or reset a selected team when needed
- Filter event history by team and event type

A team ID is not a secure authentication mechanism. Use distinct IDs and monitor duplicate activity.

### After the Event

Export or back up the configured `DATA_DIR`. Runtime team state is written to `data/teams.json` by default and is ignored by Git.

## Implementation Truth

- The public in-game lock password is `yayyougotthepassword`.
- Physical prop P04 prints `Password Token: [LUCKY NUMBER] + [CAT'S NAME] = '8MOCHI'`. This does not match the implemented lock password. Use the implemented password unless the prop and code are updated together before the event.
- Suspect finalization is slot-based, not identity-based. Any three records can occupy slots 1, 2, and 3. The terminal reports slot status only, never the chosen names. Organizers must judge whether the final reasoning is evidence-based.
- The final accusation implementation accepts any selected suspect as long as the combined reasoning is at least 20 characters. It sets the fraud fragment to `NULLDEPT` only when the accused name contains `VERMA`; otherwise it sets `UNVERIFIED`.
- Once `wipeStopped` is true, the final screen remains solved after refresh.
- Event logs and GM views are server-side and require GM authentication.

## Player Flow and Unlocks

```text
Login -> Slot 1 finalized -> recovery_code -> Slot 2 finalized
      -> nettrace -> both CCTV feeds viewed -> Slot 3 finalized
      -> Final Investigation -> WS-14 login -> stop wipe
```

The `recovery_cli` terminal shows the current status and next step:

- Slot 1: open `suspects_db` and finalize one record.
- Recovery code: open `SERVER -> recovery_code` and fix five faults.
- Slot 2: finalize a second record.
- Nettrace: open `SERVER -> nettrace` and identify the source.
- CCTV: review both camera feeds.
- Slot 3: finalize a third record.
- Final: open the Final Investigation console.

## Solution Walkthrough

### 1. Access

At the lock screen, enter:

```text
yayyougotthepassword
```

### 2. Suspect Database

Useful read-only SQL console commands:

```sql
SHOW DATABASES;
USE epochcorp;
SHOW TABLES;
DESCRIBE suspects;
SELECT * FROM suspects;
SELECT id, name, role, type FROM suspects WHERE type = 'MAIN' ORDER BY name ASC LIMIT 2;
SELECT id, name, role FROM suspects WHERE name LIKE '%Verma%';
```

The database uses one table, `epochcorp.suspects`, with columns:

```text
id, code, name, role, type, status, last_seen, alibi, motive, notes
```

`type` values such as `MAIN` and `DECOY` are organizer metadata; they are not the game's correctness check.

Evidence-backed clearance candidates:

- Divya Mehta: deployment audit P06 shows the pipeline failed and rolled back with zero permission elevations; PR #104 P07 shows Meera rejected the permission expansion; internal chat S04 confirms the failed dry run.
- Prof. Anand Rao: physical access log S02 shows departure at 02:44 AM and no re-entry.
- Ram Sharma: nettrace and CCTV show WS-14 use by someone struggling with the workstation; recovery replay shows a foreign session attached with his credentials, not that he authored the crime.
- Kavya Sethi, Sana Iqbal, Nikhil Batra, Rohan Malhotra, Arjun Nair, Priya Menon: witness and decoy records that help reconstruct movement and access.

Because the app only counts finalizations, teams may choose different defensible records for slots 1 and 2. Organizers should evaluate reasoning at final submission.

### 3. Recovery Code

Open `SERVER -> recovery_code`. Any of four language tabs can be used; all encode the same five faults and any tab with all five fixed clears the stage. Use **run replay** after editing. **restore archive** reloads the damaged original. **hint** reveals the next unfaulted item and increments the visible hint count.

#### Python fixes

1. Add the colon to the function header:

```python
def revoke_excess(granted, required):
```

2. Indent the append under the `if`:

```python
        removed.append(user)
```

3. Scan from zero through the full table length:

```python
for i in range(len(tables)):
```

4. Compare with double equals:

```python
if integrity == 39:
```

5. Print the variable that was created:

```python
print("REVOKED:", revoked)
```

#### C fixes

1. Add the missing standard I/O header:

```c
#include <stdio.h>
```

2. End the declaration:

```c
int revoked = 0;
```

3. Stop before the array end:

```c
for (int i = 0; i < ACCOUNTS; i++)
```

4. Use a string format placeholder:

```c
printf("REVOKE -> %s\n", granted[i]);
```

5. Compare with double equals:

```c
if (integrity == 39)
```

#### C++ fixes

1. Bring the standard namespace into scope:

```cpp
using namespace std;
```

2. End the declaration:

```cpp
int integrity = 39;
```

3. Stop before the array end:

```cpp
for (int i = 0; i < ACCOUNTS; i++)
```

4. Spell the stream manipulator correctly and end the output line:

```cpp
cout << "    " << tables[i] << " -> " << access_mode(tables[i]) << endl;
```

5. Compare with double equals:

```cpp
if (integrity == 39)
```

#### Java fixes

1. Use the exact Java entry point:

```java
public static void main(String[] args)
```

2. Use the capitalized `String` type:

```java
String[] granted = {"r.sharma", "a.rao", "n.batra",
                    "k.verma", "p.menon", "s.iqbal"};
```

3. End the declaration:

```java
int integrity = 39;
```

4. Stop before the array end:

```java
for (int i = 0; i < granted.length; i++)
```

5. Use lowercase `println`:

```java
System.out.println("REVOKE -> " + granted[i]);
```

#### Replay takeaways

The replay establishes:

- Six accounts had write permission; two were required.
- The four excess accounts were `n.batra`, `p.menon`, `s.iqbal`, and `k.verma`.
- `GRANT_LEDGER` was not read or written by Divya's session.
- Divya was repairing her own earlier permissions mistake.
- At 03:21 a foreign session attached from workstation `LAB-03` using `r.sharma` credentials.
- An external wipe process held the write lock; rollback aborted at 97% and shutdown was initiated at 03:41.

### 4. Nettrace

Open `SERVER -> nettrace`. The interface uses `DB_IP = 192.168.14.100` and first-match firewall rules:

| Rule | Rule text |
| --- | --- |
| 1 | Allow `192.168.14.10` any -> `DB_IP` dport `80` TCP |
| 2 | Allow `192.168.14.50` any -> `DB_IP` dport `22` TCP |
| 3 | Deny `192.168.14.190` any -> any any any |
| 4 | Allow any any -> `DB_IP` dport `53` UDP |
| 5 | Allow `192.168.14.18` any -> `DB_IP` dport `443` TCP |
| 6 | Allow `192.168.14.50` any -> `DB_IP` dport `443` TCP |
| 7 | Deny any any -> any any any |

The successful intrusion source is:

```text
Source IP: 192.168.14.18
Destination port: 443
Protocol: TCP
Workstation: WS-14
```

`WS-14` is assigned to Ram Sharma in prop P15. Prop P18 shows a WS-14 session at 03:39, port 443, with accepted credentials and no failed attempts.

### 5. CCTV and Corroboration

Open the CCTV hub after nettrace is solved. Both feeds must be viewed:

- CAM 01: corridor/office footage involving WS-14
- CAM 02: executive parking lot image

The boarding/arrival gate evidence is displayed alongside the feeds. Key props:

- P21: Verma boarding pass for Flight QA-402, seat 04B, status pending validation
- P22: official manifest shows `NO SHOW / NOT BOARDED (NO GATE SCAN)` for Verma
- P23: Verma's car remained in Slot B-14 during the incident window
- P24: CAM 02 clock runs 13 minutes slow, so recorded 03:28:15 means true 03:41:15

### 6. Final Investigation

Submit:

```text
K. Verma
```

A reasoning string matching the automated test is:

```text
1) Grant funds went to NULLDEPT. 2) The car was in Slot B-14. 3) WS-14 traces connect the wipe to the incident.
```

The GM solution records:

- Ram Sharma: not culprit; WS-14 authenticated and CCTV shows an operator struggling with a machine they do not own.
- Divya Mehta: not culprit; the wipe session traces to WS-14, not her login, and her session never touched the ledger.
- K. Verma: culprit; grant funds were routed to `NULLDEPT`, and the car was in Slot B-14 during the wipe window.

Final evidence chain:

1. P26 shows grant `GR-8899`, `$1,480,000`, department `NULLDEPT`, approved by `K. VERMA`.
2. `NULLDEPT` does not exist in any institutional directory.
3. P22 disproves Verma's flight alibi.
4. P23 places Verma's car in Slot B-14 during the incident.
5. P18 and nettrace tie the wipe session to WS-14 and port 443.
6. The recovery replay clears Divya's session and identifies an external attachment.

### 7. Stop the Wipe

After submitting the report, open the WS-14 login screen and enter:

```text
Username: ramsharma@epoch
Password: ramsharma123
```

Then select **STOP WIPE**. The completion screen reports data recovery in progress and the game is marked solved.

## Verification Commands

```bash
npm test
```

Expected result: 12 tests pass.

```text
GET http://localhost:3000/api/status
```

Expected JSON includes `status: "online"`, game `THE EPOCH - EscapeServer`, and version `2.0.0`.
