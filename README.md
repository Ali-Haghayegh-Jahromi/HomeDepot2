# Aisle Guide: Home Depot kiosk + guide robot (n8n demo)

A customer presses a kiosk button, scans a QR code, describes a repair problem on their phone, and gets a list of items from this store. A robot leaves its dock beside the kiosk and leads them to each item; the item's shelf tag lights up when they get close. At the end they get repair steps and how-to videos, and the robot drives back to its dock.

Everything runs on this PC, and everything on the robot side is a simulation.

```
 kiosk + phone (demo pages)          n8n workflow                     robot side (Docker: hd_robot)
 ──────────────────────────          ────────────                     ─────────────────────────────
 http://localhost:8000/demo/  ──►  webhooks /help/...   ──► AI 1 relevancy (Gemini)
                                   sessions + history   ──► AI 2 understand + items (Gemini)
                                   in PostgreSQL        ──► AI 3 repair steps (Gemini)
                                   POST /tour/start ...  ─────────────►  robot service (FastAPI + rclpy)
                                   POST /robot/event    ◄─────────────   └► Nav2 (AMCL, planner, controller)
                                                                             └► simulated robot in the store
                                                                                 + RViz (3D store, shelf lights)
```

## What is in this folder

| Path | What it is |
|---|---|
| [start.sh](start.sh), [stop.sh](stop.sh) | start / stop the whole demo |
| [docker-compose.yml](docker-compose.yml), [.env](.env) | PostgreSQL + n8n in Docker; the demo passwords |
| [database/init/](database/init/) | the SQL: tables, 100 items, shelf positions, the AI's read-only user |
| [database/build_seed.py](database/build_seed.py) | the item list (edit here, re-run to regenerate the SQL) |
| [store/layout.py](store/layout.py) | the made-up store: one definition used by the map, the database and the robot |
| [store/map/](store/map/) | the Nav2 map (`store.pgm`, `store.yaml`) and a labelled picture |
| [robot/run.sh](robot/run.sh) | runs the robot side: `sim`, `service`, `mock` |
| [robot/sim/](robot/sim/) | the simulated robot and store, the Nav2 launch, the RViz layout |
| [robot/robot_service/service.py](robot/robot_service/service.py) | the robot service (the API n8n talks to) |
| [n8n/homedepot_guide_robot.json](n8n/homedepot_guide_robot.json) | **the workflow to import into n8n** |
| [n8n/setup.sh](n8n/setup.sh) | imports the workflow + credentials into the local n8n and switches it on |
| [n8n/build_workflow.py](n8n/build_workflow.py) | the workflow in readable form (regenerates the JSON) |
| [n8n/test/](n8n/test/) | a stand-in for Gemini (no API key needed) and the workflow variant that uses it |
| [ui/](ui/) | **the front end** (React 19 + Astryx): demo stage (kiosk, phone frame, live store map) and the phone page; see [The front end](#the-front-end) |
| [demo/](demo/) | the previous plain-HTML version of the same screens (served until the switch to `ui/dist/`) |
| [tools/full_flow_test.py](tools/full_flow_test.py) | plays a whole customer visit and checks every step |
| [tools/log_check.py](tools/log_check.py) | merges all logs into one time line per visit and checks them for bugs (see [Logs and finding bugs](#logs-and-finding-bugs)) |
| [API_CONTRACT.md](API_CONTRACT.md) | every webhook and endpoint: fields, types, examples |
| [WORKFLOW_EXPLAINED.md](WORKFLOW_EXPLAINED.md) | the workflow, node by node, in plain language |

## Words used here

- **n8n**: the tool that runs the workflow. A workflow is a chain of *nodes* (steps).
- **Webhook**: an address that starts the workflow when something calls it. The kiosk, the phone and the robot each call webhooks.
- **Credential**: a saved password or API key inside n8n, so nodes can log in to the database or to Gemini.
- **Docker / container**: a way to run a program in its own box without installing it on the PC.
- **Nav2**: the navigation software of ROS 2 (the robot framework). It plans the route and drives.
- **RViz**: the 3D viewer of ROS 2.
- **Robot service**: our small program between n8n and Nav2.

## First-time setup

You need Docker (already on this PC) and the `dingo-pc-humble` image (already built for the real Dingo; the robot image is built on top of it).

1. **Start everything** (the first run also builds the robot image, about a minute):
   ```bash
   ./start.sh
   ```
   It starts PostgreSQL and n8n, then the simulated robot with Nav2 and RViz, then the robot service. The database fills itself on the first start (100 items).
2. **Create your n8n login.** Open http://localhost:5678 and fill in the owner account form (this account exists only on this PC).
3. **Import the workflow and the credentials:**
   ```bash
   ./n8n/setup.sh
   ```
   This puts the workflow *Home Depot guide robot* into n8n, creates the three credentials below, and switches the workflow on.
4. **Add your Gemini API key.** Get a key at https://aistudio.google.com/apikey. In n8n: left menu **Credentials** → **HD Google Gemini API key** → replace `PASTE-YOUR-GEMINI-API-KEY-HERE` in **API Key** → **Save**.
5. **Open the demo stage:** http://localhost:8000/demo/

### Where each credential goes

`./n8n/setup.sh` creates these and connects them to the right nodes. If you import the JSON by hand instead (n8n → **Workflows** → **Import from file**), create them yourself with these values and pick them in the nodes listed.

| Credential (type) | Values | Used by nodes |
|---|---|---|
| **HD Postgres (workflow tables)** (Postgres) | host `localhost`, port `5432`, database `homedepot`, user `hd_app`, password `hd_app_demo_pw`, SSL disable | Save new session, Load session, Look up chosen items, Find idle visits, Save state, Write the log |
| **HD Postgres (AI read-only: store_items)** (Postgres) | same host/port/database, user `hd_llm_reader`, password `hd_reader_demo_pw` | Read item catalogue |
| **HD Google Gemini API key** (Google Gemini(PaLM) Api) | host `https://generativelanguage.googleapis.com`, your API key | AI 1: relevancy check, AI 2: understand the need, AI 3: repair steps and videos |

The passwords are demo values from [.env](.env). After an import by hand, switch the workflow on with the **Publish** button (top right of the workflow).

### Changing the AI model

Open the workflow, double-click the **Config** node. `relevancy_model` and `main_model` are the Gemini model names (`gemini-flash-latest` and `gemini-pro-latest`: Google's names for its newest fast and strongest models). For faster answers in a live demo, set `main_model` to `gemini-flash-latest` too. Robot address, messages, the 10-minute timeout and the phone link are in the same node.

### Running without a Gemini key (stand-in AI)

For trying the flow, or as a fallback if the internet is down during a demo, a stand-in answers the three AI calls with simple keyword rules. It understands nothing: it knows decks, toilets, wall holes, leaking faucets, painting and hanging things.

```bash
python3 n8n/test/fake_gemini.py
```
```bash
./n8n/setup.sh test/workflow_fake_ai.json
```

Go back to the real AI with `./n8n/setup.sh`.

## Every day

```bash
./start.sh
```
```bash
./stop.sh
```

`./start.sh norviz` skips the RViz window; `./start.sh mock` skips the robot simulation entirely (the robot service pretends to drive in straight lines), which is enough for working on n8n alone.

In RViz, the **Views** panel on the right has three saved cameras: *Whole store*, *Follow the robot* and *Top-down plan* (double-click one to switch).

## Giving the demo

1. `./start.sh`, then put two windows side by side: the demo stage (http://localhost:8000/demo/) and RViz.
2. Press **I'm here, I need help** on the kiosk. The QR code appears and the phone page opens in the phone frame.
3. On the phone: type something unrelated first ("tell me a joke") to show the relevancy gate, then a real problem ("one of the boards on my deck is cracked"). Answer the follow-up questions; add a photo or a voice recording if you like.
4. Tap **Add to route** on the items in the order you want them and press **Guide me**. Watch the robot leave its dock on the map and in RViz. The shelf light turns on 5 m before the shelf; **I am done** appears only on arrival.
5. After the last item choose **Yes, one more thing** for a second request, or **No** to get the repair steps and videos and watch the robot return to its dock.
6. The story strip at the top (problem → AI → robot → wrap-up) shows which step of the flow is active, and the live event log under the map shows each API call as it happens. To show the workflow itself, open n8n → the workflow → **Executions**: every call is one short run you can click through.

A real phone can scan the QR code only if it can reach this PC (same Wi-Fi, firewall open for port 8000) and the link uses the PC's address: in the **Config** node set `phone_link_base` to `http://<this PC's IP>:8000/demo/phone.html?s=`. The voice recorder needs `localhost` or https, so on a real phone use text and photos.

## The front end

The demo screens are a React 19 + TypeScript app in [ui/](ui/), built with Vite and Meta's Astryx design system (theme `aisle`: Neutral base, the store's orange as the accent, green for the robot and its light). Node 22 and npm are in `~/.local/bin`.

```bash
cd ui && npm install
```
```bash
cd ui && npm run dev
```
Opens http://localhost:5173/demo/ (stage) and http://localhost:5173/demo/phone.html?s=<session_id> (phone); `/webhook`, `/tour`, `/store`, `/health`, `/log` and `/logs` are proxied to the robot service on port 8000, so the running system must be up.

```bash
cd ui && npm run build
```
Type-checks (TypeScript strict) and writes `ui/dist/`: `index.html` (stage), `phone.html` (phone page) and `assets/`, all under the `/demo/` base, so the QR links n8n makes (`/demo/phone.html?s=...`) keep working.

| Path | What it is |
|---|---|
| `ui/src/stage/` | the demo stage: kiosk with a local QR code, phone frame, live store map, story strip, event log |
| `ui/src/phone/` | the phone page: one component per screen of API_CONTRACT.md part A, and `usePhoneSession.ts` (state, polling, actions) |
| `ui/src/shared/` | API calls, problem reports to `POST /log`, the store map, the theme root and `app.css` (token-only styles for the map, phone frame and kiosk) |
| `ui/themes/aisle/` | the Astryx theme source; change it with `npx astryx experimental theme editor set aisle ...` |

**Switching the robot service from `demo/` to `ui/dist/`:** run `npm run build` in `ui/`, then in [robot/robot_service/service.py](robot/robot_service/service.py) change `DEMO_DIR` to `os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'ui', 'dist')` and restart the robot service (the repository is mounted at `/hd` in the container, so `ui/dist` is visible there). Rebuild after every front-end change.

## Testing

### The whole visit in one go

```bash
python3 tools/full_flow_test.py
```

It presses the kiosk button, sends an unrelated message (must be refused), a real request, answers the follow-up questions, chooses two items, waits for the robot at each shelf (light on, then arrival), checks that "I am done" is refused before arrival, answers "no", prints the repair steps, and waits for the robot to dock. It ends with `ALL STEPS PASSED`. Pass your own sentence as an argument to try another request.

### Each webhook on its own (kiosk / phone → n8n)

Replace `SESSION` with the `session_id` from the first call.

```bash
curl -s -X POST localhost:5678/webhook/help/start -H 'Content-Type: application/json' -d '{}'
```
```bash
curl -s -X POST localhost:5678/webhook/help/request -H 'Content-Type: application/json' -d '{"session_id":"SESSION","text":"one of the boards on my deck is cracked","budget":80}'
```
```bash
curl -s "localhost:5678/webhook/help/status?session_id=SESSION"
```
```bash
curl -s -X POST localhost:5678/webhook/help/confirm -H 'Content-Type: application/json' -d '{"session_id":"SESSION","skus":["218-788","123-760"]}'
```
```bash
curl -s -X POST localhost:5678/webhook/help/next -H 'Content-Type: application/json' -d '{"session_id":"SESSION"}'
```
```bash
curl -s -X POST localhost:5678/webhook/help/anything-else -H 'Content-Type: application/json' -d '{"session_id":"SESSION","answer":"no"}'
```

A photo or voice recording goes in as base64 text:

```bash
curl -s -X POST localhost:5678/webhook/help/request -H 'Content-Type: application/json' -d "{\"session_id\":\"SESSION\",\"image_base64\":\"$(base64 -w0 photo.jpg)\",\"image_mime\":\"image/jpeg\"}"
```

`/webhook/...` addresses work only while the workflow is switched on (published). While editing a workflow, n8n's **Listen for test event** button uses `/webhook-test/...` instead, for one call.

### Each robot endpoint on its own (n8n → robot service)

```bash
curl -s localhost:8000/health
```
```bash
curl -s -X POST localhost:8000/tour/start -H 'Content-Type: application/json' -d '{"session_id":"test","index":1,"total":1,"stop":{"sku":"218-788","name":"Deck screws","aisle":3,"shelf":4,"x":14.8,"y":14.125,"yaw":0.0,"tag_code":"TAG-0304-015","light_x":15.75,"light_y":14.125,"light_z":1.4}}'
```
```bash
curl -s localhost:8000/tour/status
```
```bash
curl -s -X POST localhost:8000/tag/on -H 'Content-Type: application/json' -d '{"tag_code":"TAG-0304-015"}'
```
```bash
curl -s -X POST localhost:8000/tag/off -H 'Content-Type: application/json' -d '{"tag_code":"TAG-0304-015"}'
```
```bash
curl -s -X POST localhost:8000/tour/next -H 'Content-Type: application/json' -d '{"session_id":"test"}'
```
```bash
curl -s -X POST localhost:8000/tour/done -H 'Content-Type: application/json' -d '{"session_id":"test","reason":"done"}'
```

The robot's own messages to n8n (`near`, `arrived`, `home`) can be faked too:

```bash
curl -s -X POST localhost:5678/webhook/robot/event -H 'Content-Type: application/json' -d '{"session_id":"SESSION","event":"arrived","sku":"218-788","tag_code":"TAG-0304-015"}'
```

### The database

```bash
docker exec -it hd_postgres psql -U hd_app -d homedepot -c "select sku, item_name, price, aisle, shelf, tag_code from store_items order by aisle, shelf limit 20"
```
```bash
docker exec -it hd_postgres psql -U hd_app -d homedepot -c "select role, kind, relevant, left(content, 80) from messages order by message_id desc limit 20"
```

### The 10-minute timeout without waiting 10 minutes

Start a visit, then make it look old; within a minute the visit closes and the robot goes home:

```bash
docker exec hd_postgres psql -U hd_app -d homedepot -c "update sessions set last_input_at = now() - interval '11 minutes' where status = 'active'"
```

## Logs and finding bugs

Every part of the demo writes structured log entries with the same fields (`ts`, `source`, `level`, `session_id`, `event`, `details`, `duration_ms`), so one visit can be read as a single time line.

| Where | Written by | What is in it |
|---|---|---|
| table `event_log` in PostgreSQL ([05_event_log.sql](database/init/05_event_log.sql)) | the n8n workflow | per run: webhook, session, n8n execution id; `state_saved` (screen before → after, orders, input summary); `ai_call` (node, model, ms, HTTP/API error, parsed or not, the raw answer when unusable, relevancy verdict, AI 2's answer type, items kept/suggested, SKUs dropped, AI 3's step count); `call_refused` (every refusal of *Check the call*); `robot_event` (applied, or ignored and why); `robot_order` (each order and the HTTP status/state the robot service answered); `items_chosen`, `guide_to_item`, `item_done`, `anything_else`, `session_start`, `session_end`, `session_closed_by_new_visit`, `timeout_close` |
| `logs/robot_service.jsonl` | the robot service | `http` (each order from n8n, its body and the robot state after it), `state_change`, `nav_goal_sent` / `_succeeded` / `_failed` / `_gave_up` / `_cancelled`, `near` and `arrived` (with the robot pose and distance), `home`, `light`, `event_sent` (each event to n8n and its HTTP result), `pose_jump` (localization reset), `pick_ignored`, `proxy` (the pages' calls to n8n, except status polls that went fine) |
| `logs/robot_service.jsonl` (via `POST /log`) | the demo pages | `source` `phone` / `stage`: `js_error`, `fetch_failed`, `webhook_error`, `screen_drawn` (each screen the phone draws), `stage_screen` |
| `logs/robot_service.log`, `logs/sim.log` | robot service, simulation | the human-readable lines (and Nav2/AMCL output) |

Logging is best-effort everywhere: a failed log write never changes a reply. In n8n, *Save state* writes the entries in the same SQL statement as the visit (through `log_events()`, which never raises), and *Write the log* writes refusals and robot-order results after the reply has gone out.

**Read a visit and check it:**

```bash
python3 tools/log_check.py                         # the latest 3 visits: time line, then the checks
python3 tools/log_check.py --session SESSION       # one visit
python3 tools/log_check.py --last 10 --checks-only # only the problems
python3 tools/log_check.py --all --since 2h        # everything of the last 2 hours
python3 tools/log_check.py --follow                # keep watching; prints new warnings and problems
python3 tools/log_check.py --json                  # the same as JSON, for other tools and agents
```

Each time-line line is `time  level  source  webhook+execution  event  what happened`; `!` marks a warning, `!!` an error. The exit code is 1 when problems are found. The checks: phone on `arrived` without a robot `arrived` for that item; shelf light only after arrival (`near` missing); "I am done" accepted off the `arrived` screen; `/tour/start` with no arrival within 3 minutes; robot and phone disagreeing for more than 30 s (e.g. phone `guiding` while the robot waits at the shelf or is idle, or a finished visit with the robot still on tour); more than one active visit; AI failures, unparsable or incomplete answers, AI calls over 15 s; AI 2 questions with options or markdown in the text while `options` is empty; SKUs dropped as unknown; repair steps empty or more than 6; robot events ignored or refused; robot orders that failed; robot orders arriving out of order; events the robot could not deliver; Nav2 giving up; localization jumps; a visit that ended without the robot getting home; a visit still active after the timeout; JS errors and failed calls from the pages.

**Directly:**

```bash
docker exec hd_postgres psql -U hd_app -d homedepot -c "select ts, level, endpoint, event, left(details::text, 120) from event_log where session_id = 'SESSION' order by ts, id"
```
```bash
curl -s "localhost:8000/logs?session_id=SESSION&level=warn"     # also ?since=<line number or ISO time>&limit=N
```

The n8n execution id in each row (`x1234` in the time line) is the run to open in n8n → **Executions** for the full data of every node.

## How the robot side connects

- **Simulation instead of Gazebo.** [robot/sim/sim_robot.py](robot/sim/sim_robot.py) is the robot: it obeys Nav2's velocity commands, reports odometry and TF, and produces a 360° laser scan computed from the store map. Nav2 runs on top unchanged: AMCL localizes on the map (it starts at the dock, so no start pose has to be clicked), the planner finds the route, the controller drives at up to 1 m/s. The Nav2 settings are in [robot/sim/sim.launch.py](robot/sim/sim.launch.py).
- **Robot service ↔ Nav2.** [service.py](robot/robot_service/service.py) uses Nav2 Simple Commander: `BasicNavigator.waitUntilNav2Active()` at start, `goToPose()` for each item and for the way home. It reads the robot's position from TF (`map → base_link`), compares it with the stop (straight-line distance) and reports `near` at 5 m and `arrived` when Nav2 says the goal succeeded.
- **Shelf lights.** The service publishes RViz markers on `/shelf_lights`: grey lamp = off, pulsing green lamp with a beam = on.
- **Robot service ↔ n8n.** n8n calls `http://localhost:8000/...`; the service calls `http://localhost:5678/webhook/robot/event`. n8n runs with Docker's host networking, because this PC's firewall blocks containers from reaching services on the PC through Docker's own network.
- **Kept apart from the real Dingo.** The simulation uses its own ROS domain (42) and talks to this PC only (`ROS_LOCALHOST_ONLY=1`); the real robot is on domain 0. Nothing here can send it a command.
- **Using it with another robot later.** The service needs a Nav2 `navigate_to_pose` action, a `map → base_link` transform, and AMCL. The home pose and all shelf positions come from [store/layout.py](store/layout.py) and the `shelf_locations` table.

## Changing the store or the items

- Items: edit the list in [database/build_seed.py](database/build_seed.py), run `python3 database/build_seed.py`.
- Store layout (aisles, bays, dock, registers): edit [store/layout.py](store/layout.py), run `python3 store/build_map.py` and `python3 database/build_seed.py`.
- The database is filled only when it is created. To recreate it (this erases visits; n8n is kept):
  ```bash
  docker compose rm -sf postgres && docker volume rm homedepot_hd_pgdata && docker compose up -d postgres
  ```

## Things to know

- **The AI calls have not been run against the real Gemini API here** (no key was available): the whole flow was tested with the stand-in. The request format follows Google's `generateContent` API with JSON output; if the first real request fails, open the failed run in n8n → **Executions** and look at the *AI 1* node's error.
- Starting a new visit at the kiosk closes any visit still open: one robot, one customer.
- If Nav2 cannot reach a shelf after three attempts, the service reports it as reached so the visit can continue (robot failures are out of scope).
- The QR code picture comes from a public service (`api.qrserver.com`), so it needs internet; the link under it always works.
- No logins or security anywhere: the random session id in the phone link is the only key. n8n and PostgreSQL listen on this PC only.
