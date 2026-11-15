# Aisle Guide: Home Depot kiosk + guide robot (n8n demo)

A customer presses a kiosk button, scans a QR code, describes a repair problem on their phone, and gets a list of items from this store. A robot leaves its dock beside the kiosk and leads them to each item; the item's shelf tag lights up when they get close. At the end they get repair steps and how-to videos, and the robot drives back to its dock.

Everything runs on one computer (Ubuntu, or a Mac with Apple Silicon or Intel) in Docker, and everything on the robot side is a simulation. **Not an engineer? Read [QUICKSTART.md](QUICKSTART.md) instead of this page.**

```
 kiosk + phone (demo pages)          n8n workflow                     robot side (container hd_robot)
 ──────────────────────────          ────────────                     ─────────────────────────────
 http://localhost:8000/demo/  ──►  webhooks /help/...   ──► AI 1 relevancy        (Gemini models,
                                   sessions + history   ──► AI 2 understand + items  then Claude
                                   in PostgreSQL        ──► AI 3 repair steps         as the fallback)
                                   POST /tour/start ...  ─────────────►  robot service (FastAPI + rclpy)
                                   POST /robot/event    ◄─────────────   └► Nav2 (AMCL, planner, controller)
                                                                             └► simulated robot in the store
                                                                                 + RViz (3D store, shelf lights)
```

## What is in this folder

| Path | What it is |
|---|---|
| [QUICKSTART.md](QUICKSTART.md) | one page for presenters: install Docker, start, give the demo, stop, common problems |
| [start.sh](start.sh), [stop.sh](stop.sh), [status.sh](status.sh), [reset.sh](reset.sh) | start / stop the whole demo, check its health, clear all visits |
| `Start Demo.command`, `Stop Demo.command` | the same for a double-click in the Mac Finder |
| [tools.sh](tools.sh) | the test and log tools, run inside the robot container (`test`, `check`, `logs`, `psql`, `shell`) |
| [docker/compose.yaml](docker/compose.yaml) | the Docker Compose project: postgres, n8n, robot, fake-ai (stand-in AI) on one network |
| [docker/robot.Dockerfile](docker/robot.Dockerfile), [docker/robot/](docker/robot/) | the robot image (ROS 2 Humble + Nav2 + RViz + noVNC + the robot service + the built front end) and its start script |
| [docker/lib.sh](docker/lib.sh), [docker/env.template](docker/env.template) | the scripts' shared code; the template of `.env` (settings, passwords, API key: made by `./start.sh`, never committed) |
| [database/init/](database/init/) | the SQL: tables, 100 items, shelf positions, the AI's read-only user |
| [database/build_seed.py](database/build_seed.py) | the item list (edit here, re-run to regenerate the SQL) |
| [store/layout.py](store/layout.py) | the made-up store: one definition used by the map, the database and the robot |
| [store/map/](store/map/) | the Nav2 map (`store.pgm`, `store.yaml`) and a labelled picture |
| [robot/sim/](robot/sim/) | the simulated robot and store, the Nav2 launch, the RViz layout |
| [robot/robot_service/service.py](robot/robot_service/service.py) | the robot service (the API n8n talks to) |
| [n8n/homedepot_guide_robot.json](n8n/homedepot_guide_robot.json) | **the main workflow** (`./start.sh` imports it), with its helpers [n8n/homedepot_ai_model.json](n8n/homedepot_ai_model.json) (sub-workflow: the Gemini → Claude model chain), [n8n/homedepot_status_poll.json](n8n/homedepot_status_poll.json) (`GET /help/status`, runs not saved) and [n8n/homedepot_timeout_check.json](n8n/homedepot_timeout_check.json) (every minute, runs not saved); all four built by `n8n/build_workflow.py` |
| [n8n/setup.sh](n8n/setup.sh) | rebuilds the workflow, imports it + the credentials into n8n and switches it on (`./start.sh setup`) |
| [n8n/build_workflow.py](n8n/build_workflow.py) | the workflow in readable form (regenerates the JSON) |
| [n8n/test/](n8n/test/) | a stand-in for Gemini and Claude (no API key needed) and the workflow variant that uses it |
| [ui/](ui/) | **the front end** (React 19 + Astryx): demo stage (kiosk, phone frame, live store map) and the phone page; see [The front end](#the-front-end) |
| [demo/](demo/) | the previous plain-HTML version of the same screens (served until the switch to `ui/dist/`) |
| [tools/full_flow_test.py](tools/full_flow_test.py) | plays a whole customer visit and checks every step |
| [tools/edge_case_test.py](tools/edge_case_test.py) | the awkward cases (double taps, timeouts, AI failures, the model chain, photos), against the stand-in AI |
| [tools/photo_test.py](tools/photo_test.py), [tools/make_test_photos.py](tools/make_test_photos.py) | sends a photo or voice note like the phone does and prints what the AI understood and picked; draws five test photos |
| [tools/log_check.py](tools/log_check.py) | merges all logs into one time line per visit and checks them for bugs (see [Logs and finding bugs](#logs-and-finding-bugs)) |
| [API_CONTRACT.md](API_CONTRACT.md) | every webhook and endpoint: fields, types, examples |
| [WORKFLOW_EXPLAINED.md](WORKFLOW_EXPLAINED.md) | the workflow, node by node, in plain language |

## Words used here

- **n8n**: the tool that runs the workflow. A workflow is a chain of *nodes* (steps).
- **Webhook**: an address that starts the workflow when something calls it. The kiosk, the phone and the robot each call webhooks.
- **Credential**: a saved password or API key inside n8n, so nodes can log in to the database, to Gemini or to Claude.
- **Docker / container**: a way to run a program in its own box without installing it on the PC.
- **Nav2**: the navigation software of ROS 2 (the robot framework). It plans the route and drives.
- **RViz**: the 3D viewer of ROS 2.
- **Robot service**: our small program between n8n and Nav2.

## First-time setup

The only thing to install is Docker: **Docker Engine** (with the Compose plugin) on Ubuntu, **Docker Desktop** on a Mac (Apple Silicon or Intel; every image is native on both, no Rosetta). Plan for 8 GB of memory, 10 GB of disk and 10 to 20 minutes for the first start. No Python, Node or ROS is needed on the computer.

```bash
./start.sh
```

(Mac: or double-click `Start Demo.command`.) The first run, step by step:

1. **Checks Docker** (installed, running, usable by this user; on a Mac it starts Docker Desktop if it is closed) and says what to do if not.
2. **Creates `.env`** from [docker/env.template](docker/env.template) with generated database passwords and an n8n login, and **asks once for the Gemini API key** (hidden input; get one at https://aistudio.google.com/apikey). The key is checked with Google and stored in `.env` only. Press Enter to skip: the demo then runs in **offline mode** with the stand-in AI (see below). Then it **asks once for an optional Anthropic key** (Claude, the backup AI: see [The AI: Gemini models, then Claude](#the-ai-gemini-models-then-claude)); Enter skips it.
3. **Downloads** PostgreSQL 16 and n8n (pinned versions) and **builds the robot image** (`hd-demo-robot`, about 4 minutes on a fast connection): official multi-arch `ros:humble-ros-base` + Nav2 + RViz + Xvfb/x11vnc/noVNC, the robot service, and the front end (`ui/` is built with Node 22 inside the build; without `ui/package.json` the plain `demo/` pages are used).
4. **Starts** the Compose project `homedepot` ([docker/compose.yaml](docker/compose.yaml)). The database fills itself on the first start (100 items).
5. **Sets up n8n**: creates the owner account (`demo@aisleguide.local` + the generated password from `.env`), builds the workflow from [n8n/build_workflow.py](n8n/build_workflow.py) inside the robot image (robot at `http://robot:8000`, the phone link, Gemini or the stand-in), imports the credentials below and the workflow, and switches it on. It also creates the table `ai_model_status` (the model chain's memory) if the database is older than it.
6. **Waits** until Nav2 is ready, prints the addresses and the n8n login, and opens the demo stage in the browser.

Later starts take about a minute: images are rebuilt only when a file that goes into them changed, and n8n is set up again only when the workflow source or a setting changed.

### Where each credential goes

`./start.sh` (and `./n8n/setup.sh`) creates these and connects them to the right nodes. If you import the JSON by hand instead (n8n → **Workflows** → **Import from file**), create them yourself with these values and pick them in the nodes listed.

| Credential (type) | Values | Used by nodes |
|---|---|---|
| **HD Postgres (workflow tables)** (Postgres) | host `postgres` (the Compose service), port `5432`, database `homedepot`, user `hd_app`, password `POSTGRES_PASSWORD` from `.env`, SSL disable | Save new session, Load session, Look up chosen items, Find idle visits, Save state, Write the log |
| **HD Postgres (AI read-only: store_items)** (Postgres) | same host/port/database, user `hd_llm_reader`, password `HD_LLM_READER_PASSWORD` from `.env` | Read item catalogue |
| **HD Google Gemini API key** (Google Gemini(PaLM) Api) | host `https://generativelanguage.googleapis.com`, `GEMINI_API_KEY` from `.env` | AI 1: relevancy check (Gemini), AI 2: understand the need (Gemini), Gemini: first model, Gemini: second model |
| **HD Anthropic API key (optional)** (Anthropic) | `ANTHROPIC_API_KEY` from `.env` (empty if none), base URL `https://api.anthropic.com` | AI 1: relevancy check (Claude), AI 2: understand the need (Claude), Claude: main model |

In offline mode the Gemini and Claude nodes use **HD Gemini stand-in (no key)** and **HD Claude stand-in (no key)** instead (address `http://fake-ai:8010`, dummy keys), so a real key never goes to the stand-in. If `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in `.env` is empty, a key already saved in n8n is kept (a key pasted in the n8n website keeps working; after pasting a Claude key there, run `./start.sh setup` so the workflow knows one is set). After an import by hand, switch the workflow on with the **Publish** button (top right of the workflow).

### Settings (.env)

| Setting | Default | What it does |
|---|---|---|
| `HD_AI` | asked on the first start | `gemini` or `offline` (stand-in AI). Change with `./start.sh key` |
| `GEMINI_API_KEY` | asked | the Gemini key (never printed by the scripts) |
| `ANTHROPIC_API_KEY` | asked once (optional) | the Claude key for the backup AI (never printed). Add or change it with `./start.sh claude-key` |
| `HD_CLAUDE_ASKED` | | `yes` once `./start.sh` has asked for the Claude key (so it asks only once) |
| `HD_AI_PROVIDER` | `gemini` | `claude`: Claude answers first and the Gemini models are the backup (needs a Claude key) |
| `HD_GEMINI_MODELS` | the workflow's list | the Gemini models to try, in order, comma-separated |
| `N8N_OWNER_EMAIL`, `N8N_OWNER_PASSWORD` | `demo@aisleguide.local`, generated | the n8n login created on the first start |
| `HD_LAN` | `no` | `yes`: the demo port listens on the network and the QR code uses this computer's address, so real phones on the same Wi-Fi can open it (`./start.sh lan`; `./start.sh local` switches it off) |
| `HD_HTTPS` | `no` | `yes`: also https on `HD_HTTPS_PORT` with a self-signed certificate, and the QR code uses it, so the phone's voice recorder works (implies `HD_LAN=yes`; `./start.sh https`) |
| `HD_PUBLIC_HOST` | found automatically | the address used in the QR code (and the certificate) in LAN mode (`ip route` on Linux, the default interface on a Mac) |
| `HD_RVIZ` | `yes` | `no` skips RViz (saves 1 to 2 CPU cores) |
| `HD_RVIZ_VIEW` | `top` | `top`: the whole store from above, framed for recording ([docker/robot/record.rviz](docker/robot/record.rviz)); `3d`: the 3D store camera ([docker/robot/record-3d.rviz](docker/robot/record-3d.rviz)) |
| `HD_DEMO_PORT`, `HD_N8N_PORT`, `HD_RVIZ_PORT`, `HD_HTTPS_PORT` | 8000, 5678, 6080, 8443 | ports on this computer (127.0.0.1 only, except the demo and https ports in LAN mode) |
| `HD_IMAGE` | `hd-demo-robot:latest` | the robot image's name (another one for a second, test copy of the stack) |
| `HD_MODE` | `ros` | `mock`: no simulation, the robot service pretends to drive (for working on n8n alone) |
| `HD_DEV` | `no` | `yes`: the robot container uses the source folders instead of the copies in the image ([docker/compose.dev.yaml](docker/compose.dev.yaml)); after a change: `docker restart hd_robot` |
| `POSTGRES_*`, `HD_LLM_READER_PASSWORD`, `TZ` | generated / found | database and time zone |

### The AI: Gemini models, then Claude

A free Gemini key has a small quota **per model** (a few dozen calls a day for some models, a few per minute for others), and Google sometimes answers "overloaded" (503) or slowly. So every AI call runs through a **model chain**, all of it visible on the n8n canvas:

1. **Which AI models are resting?** reads the table `ai_model_status`.
2. **pick the next model**: the Gemini models of `gemini_models` in order (default `gemini-3.1-flash-lite, gemini-flash-lite-latest, gemini-3-flash-preview, gemini-3.5-flash-lite, gemini-3.5-flash, gemini-3.6-flash`), then Claude. Models that rest are skipped (they stay at the very end of the list as a last resort).
3. **Gemini or Claude?** → the call. Claude only if **Claude key set?** says yes, and never for a voice note alone (**Can Claude read it?**: Claude cannot listen; the customer is then asked to type).
4. **Out of quota or busy?** A 429 (quota), 503 / 529 (overloaded) or a timeout makes the model **rest** (**Remember: the model rests**): 60 minutes for a daily quota, about a minute for a per-minute limit or "busy". Later calls skip it, so the customer does not wait for a model that is known to be out.
5. **Another model to try?** while models and time are left (the customer never waits more than about 25 s: AI 1 has 11 s, AI 2 the rest of 23 s). Otherwise the phone shows "please send it again" (or "please type it" for a voice note), and the log says which models were tried and why they failed.

AI 3 (repair steps, after the reply) uses n8n's Basic LLM Chain with the first two Gemini models that are not resting, then a Claude chain if they fail.

**Claude** (Anthropic's Messages API) is the last fallback for all three AIs, used only with a key: `claude-haiku-5-5` for AI 1 (yes/no, fast) and `claude-sonnet-5-5` for AI 2 and AI 3 (photo + catalogue), adaptive thinking at low effort, JSON through structured outputs, the photo as a base64 image block. Get a key at https://console.anthropic.com/settings/keys (paid per use; a visit costs well under a cent with Haiku, a few cents with Sonnet) and add it with `./start.sh claude-key`. To make Claude the first choice instead, set `HD_AI_PROVIDER=claude` in `.env` and run `./start.sh setup`.

`./status.sh` shows which AIs have a key and which models are resting right now, and why. To see which model answered each call: `python3 tools/log_check.py` (the `ai_call` lines name the provider and model; `ai_gave_up` means every model failed).

All of this is in the **Config** node (open the workflow, double-click it): `ai_provider`, `gemini_models`, `claude_fast_model`, `claude_main_model`, the rest times (`model_rest_*`) and the time limits. Changes made there are replaced by the next `./start.sh setup`; for lasting changes use `.env` (`HD_AI_PROVIDER`, `HD_GEMINI_MODELS`) or [n8n/build_workflow.py](n8n/build_workflow.py). Robot address, messages, the 10-minute timeout and the phone link are in the same node.

Measured on the free key (15 Nov 2026): `gemini-3.1-flash-lite` and `gemini-flash-lite-latest` answer a photo request in 2 to 5 s; `gemini-3.5-flash` and `gemini-3.6-flash` work but take about 9 s even for a tiny request (last in the list); `gemini-3.7-flash` and `gemini-3.8-flash` reject the "minimal" thinking level, and `gemini-2.5-*` are no longer offered to new keys.

### Running without a Gemini key (stand-in AI)

For trying the flow, or as a fallback if the internet is down during a demo, a stand-in answers the three AI calls with simple keyword rules, in Gemini's format and in Claude's. It understands nothing: it knows decks, toilets, wall holes, leaking faucets, painting and hanging things. Test words in a message make it fail on purpose (out of quota, overloaded: see [n8n/test/fake_gemini.py](n8n/test/fake_gemini.py)), which is how `tools/edge_case_test.py` exercises the model chain.

It runs as the Compose service `fake-ai` (profile `offline`, from the robot image; n8n calls `http://fake-ai:8010`). Switch between the real AI and the stand-in with:

```bash
./start.sh key
```

Paste a key for Gemini, or press Enter for the stand-in (a key already in `.env` stays there; `HD_AI=gemini` switches back to it). The workflow is rebuilt and imported automatically.

## Every day

```bash
./start.sh
```
```bash
./stop.sh
```
```bash
./status.sh
```

`./status.sh` (also `./start.sh status`) checks each part in plain words (Docker, database, n8n, workflow switched on, Gemini key saved or stand-in running, Claude key saved or not, AI models resting after "out of quota" or "busy", robot and Nav2, RViz) and prints the fix for each problem. `./reset.sh` deletes all visits and logs and sends the robot back to its dock (keeps the items, the key and the n8n login). `./stop.sh remove` also removes the containers and their network; the data volumes `homedepot_hd_pgdata` and `homedepot_hd_n8ndata` stay until you delete them yourself (`docker volume rm ...`).

**RViz** runs inside the robot container on a virtual 1920x1080 screen and is shown in the browser at http://localhost:6080: a clean page (no noVNC controls, no password) that connects by itself, scales the picture to the window in 16:9 and reconnects after a restart; `?view_only=1` ignores the mouse, and the full noVNC page is still at `/vnc.html`. The entrypoint starts the simulation with `rviz:=false` and runs `rviz2` itself, full screen (F11 through `xdotool`: no menu, toolbar, panels or status bar), with [docker/robot/record.rviz](docker/robot/record.rviz) (`HD_RVIZ_VIEW=top`: a TopDownOrtho view framing the whole 60 x 40 m store like the web map, x to the right and y to the back, so the entrance and registers are at the bottom and aisle 1 on the left; planned route bright and thick, laser scan faint, map dim, background the theme's dark neutral, 12 frames a second) or [docker/robot/record-3d.rviz](docker/robot/record-3d.rviz) (`HD_RVIZ_VIEW=3d`: the *Whole store* camera of `robot/sim/store.rviz`). It renders in software (no GPU needed), which costs 1 to 2 CPU cores; `HD_RVIZ=no` in `.env` skips it.

## Giving the demo

1. `./start.sh`, then put two browser windows side by side: the demo stage (http://localhost:8000/demo/) and RViz (http://localhost:6080).
2. Press **I'm here, I need help** on the kiosk. The QR code appears and the phone page opens in the phone frame.
3. On the phone: type something unrelated first ("tell me a joke") to show the relevancy gate, then a real problem ("one of the boards on my deck is cracked"). Answer the follow-up questions; add a photo or a voice recording if you like.
4. Tap **Add to route** on the items in the order you want them and press **Guide me**. Watch the robot leave its dock on the map and in RViz. The shelf light turns on 5 m before the shelf; **I am done** appears only on arrival.
5. After the last item choose **Yes, one more thing** for a second request, or **No** to get the repair steps and videos and watch the robot return to its dock.
6. The story strip at the top (problem → AI → robot → wrap-up) shows which step of the flow is active, and the live event log under the map shows each API call as it happens, with the **n8n decision nodes** each step went through, named as on the canvas ("Relevant to home repair? → yes", "Budget known? → no", "Near or arrived? → near (5 m)", ...). The stage reads them off each screen change (every screen change has exactly one path through the workflow: `decisionsFor()` in [ui/src/stage/useStage.ts](ui/src/stage/useStage.ts)), plus Gemini's one-sentence reading of the customer's message when the reply carries `data.understood`. To show the workflow itself, open n8n → the workflow → **Executions**: every call is one short run you can click through.

The 3-minute recording plan, with the exact taps and what to say, is [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

**What the phone shows from the AI.** A photo gets a scan line while the AI looks at it, then the AI's reading of it as a *Here's what I see* bubble (`data.understood` of the question or items reply; *Here's what I heard* for a voice note), repeated with the photo above the item list. Items carry the AI's `role`: `main` items under *Fixes it*, each `alternative` indented right under the item it replaces ("Or instead of the item above"), `tool`s under *Tools you'll need*; a reply without roles is one plain list. The footer total and budget bar count the ticked items only. When n8n answers a request without taking it in (the AI was busy: "please send it again"), the message stays marked *Not sent* with **Try again**, which resends it as it was, photo or voice note included.

### A real phone on the same Wi-Fi

A real phone can scan the QR code only if it can reach this computer and the link uses the computer's address: `./start.sh lan` (saves `HD_LAN=yes` in `.env`). The demo port then listens on all network interfaces (n8n and RViz stay on 127.0.0.1), and the workflow is rebuilt with `phone_link_base` = `http://<this computer's address>:8000/demo/phone.html?s=` (the build-time `HD_PHONE_LINK`; the address is found automatically, set `HD_PUBLIC_HOST` if the guess is wrong, e.g. with several network cards). The demo stage draws the QR code from the `link` n8n returns and keeps it as it is when it names a network address (a `localhost` link is rewritten to the stage's own address, for `npm run dev`). Anyone on that network can then use the demo pages (and through them the workflow's webhooks), so use it on a trusted Wi-Fi.

**Voice notes need https** (browsers allow the microphone only on https or localhost): `./start.sh https` (saves `HD_HTTPS=yes`, implies LAN mode). The robot container then makes a self-signed certificate on its first start (openssl, inside the container, for `HD_PUBLIC_HOST` + localhost; kept in the volume `<project>_hd_tls`, made again only when the address changes) and serves the same pages on `https://<address>:8443` ([docker/robot/tls_proxy.py](docker/robot/tls_proxy.py): TLS in front of the robot service, byte for byte, so the live mirror's event stream passes too); the QR code uses that. Each phone shows a "not private" warning once: iPhone Safari *Show Details → visit this website → Visit Website*, Android Chrome *Advanced → Proceed to … (unsafe)*. Photos work over plain http as well: the composer has *Take a photo* (`<input type=file accept=image/* capture=environment>`, opens the camera) and *Choose a photo* (the photo library).

**Firewall.** `./status.sh` (and `./start.sh` in LAN mode) checks, without sudo, whether a firewall may keep phones out (Ubuntu: `systemctl is-active ufw` + `/etc/ufw/ufw.conf`, or firewalld; Mac: `socketfilterfw --getglobalstate`) and prints the commands to run yourself, with this computer's subnet and ports, e.g. `sudo ufw allow from 192.168.2.0/24 to any port 8000 proto tcp` (Docker's published ports usually get past ufw anyway; the `ufw route allow` line it prints covers the forwarded traffic), or on a Mac where to allow Docker. The scripts never change the firewall.

### The customer's phone, live on the stage

When a real phone scans the QR code, the stage's *Customer's phone* frame shows exactly what that phone shows, live: chat bubbles, the typed draft, ticked items and their order, loading states, the photo thumbnail, the screen and its scroll position, with a green *Live from the customer's phone* label. Before that (and again when the phone has been silent for more than 10 s) the frame is the stage's own, interactive phone page, so a presenter can run the whole visit from the stage alone.

How: the phone page (`ui/src/phone/mirror.ts`) publishes a compact JSON snapshot of its local UI state (photos as JPEG thumbnails of at most 360 px), with a client id and an increasing version, to `POST /mirror/{session_id}` whenever it changes (debounced 150 ms), and a heartbeat every 3 s. The robot service keeps only the latest snapshot per visit in memory ([robot/robot_service/mirror.py](robot/robot_service/mirror.py): at most 512 kB each, dropped 30 minutes after the phone was last heard from) and streams it as Server-Sent Events (`GET /mirror/{session_id}/stream`; `GET /mirror/{session_id}` for polling). The stage loads `phone.html?s=<id>&view=mirror` in the phone frame next to its own phone page: it draws the same phone components read-only from the snapshot, at the same 390 px width and scale. The stage's own phone page says `role=stage` and never publishes; with several phones on one visit the latest to change something is shown. The mirror is a display relay only: it makes no decisions, never calls n8n, and a failure of it does not touch the visit. The router is switched on by two lines in `service.py` (after `app = FastAPI(...)`): `from mirror import router as mirror_router` and `app.include_router(mirror_router)`.

### Recording: the studio view

http://localhost:8000/demo/?view=studio (or the *Studio view* button on the stage) is one calm 1920 x 1080 picture: kiosk, the (mirrored) phone, RViz's live top view (an iframe of the noVNC page on port `HD_RVIZ_PORT` of the host the stage was opened from: the robot container writes that port into `/demo/runtime.json` at start) with the robot's status and the live event log under it, and the story strip on top. A switch shows the web store map instead of RViz; when RViz is switched off or cannot be reached, the web map is shown with a short note and a retry. Open it from this computer (RViz listens on 127.0.0.1 only). After `./reset.sh` the stage and studio go back to the kiosk's start screen by themselves (their visit no longer exists) and the RViz frame reconnects; no reload needed.

**RViz's top view** ([docker/robot/record.rviz](docker/robot/record.rviz)) is drawn for a recording, in the web UI's colours: dark aisle numbers on white signs at both ends of each aisle, department names in front, the help kiosk, the robot dock, registers and entrance labelled ([robot/sim/sim_robot.py](robot/sim/sim_robot.py), `top_view_signs`, only with `HD_RVIZ_VIEW=top`); a green robot footprint with a dark heading arrow around the robot model (frame-locked to `base_footprint`); the planned route bold green. For the stop being guided to, the robot service ([robot/robot_service/service.py](robot/robot_service/service.py), `_draw_markers`, 10 Hz on `/shelf_lights`) fills the bay orange with a dark outline (bright green once lit), turns that aisle's signs orange, puts the item and its aisle/bay on a label, and draws the 5 m ring in which the light turns on; a lit shelf tag is a big pulsing green lamp.

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

**In Docker:** the robot image builds `ui/` itself (`npm ci && npm run build` in a `node:22` build stage of [docker/robot.Dockerfile](docker/robot.Dockerfile)) and puts the result where the robot service serves `/demo` from (both `/hd/demo` and `/hd/ui/dist` in the image), so nothing has to be built on the computer. `./start.sh` rebuilds the image whenever a file in `ui/` changed. Build argument `HD_FRONTEND` (`.env`): `auto` (default: `ui/` if it has a `package.json`, else `demo/`), `ui` or `demo`.

## Testing

### The whole visit in one go

```bash
./tools.sh test
```

(`./tools.sh` runs the Python tools inside the robot container, pointed at the Compose network, so the computer needs no Python. With Python 3 on the computer, `python3 tools/full_flow_test.py` works too: n8n and the robot service are published on localhost:5678 and :8000.) It presses the kiosk button, sends an unrelated message (must be refused), a real request, answers the follow-up questions, chooses two items, waits for the robot at each shelf (light on, then arrival), checks that "I am done" is refused before arrival, answers "no", prints the repair steps, and waits for the robot to dock. It ends with `ALL STEPS PASSED`. Pass your own sentence as an argument to try another request.

### The awkward cases and the model chain (stand-in AI)

`python3 tools/edge_case_test.py` (about 4 minutes) plays the cases that are hard to show by hand: AI failures, sloppy questions, double taps, a slow answer for a visit that was closed meanwhile, the timeout, and the model chain (the first Gemini model out of quota → the next one, and it rests; every Gemini model out of quota → Claude, for AI 1, AI 2 with a photo, and AI 3; every model down → "please send it again" within 25 s; a voice note alone → "please type it"; photo-first replies with `understood` and `role`). It needs the stand-in AI (`./start.sh key`, Enter) and, for the Claude cases, any dummy `ANTHROPIC_API_KEY` in `.env` (offline, Claude's calls go to the stand-in too); `HD_EXPECT_CLAUDE=no` checks the no-key behaviour instead. Best run on a second copy of the stack: set `HD_N8N_URL`, `HD_ROBOT_URL` and `HD_PG_CONTAINER` (see the top of the file).

### Photos and voice notes against the real AI

```bash
python3 tools/make_test_photos.py                      # draws 5 photos into tools/photos/ (needs Pillow)
python3 tools/photo_test.py tools/photos/drywall_hole.jpg "help"
python3 tools/photo_test.py --audio my_voice_note.wav
python3 tools/photo_test.py --all --first              # every photo, first reply only (fewer AI calls)
```

Each run is a real visit: it prints what the AI understood (`understood`), what it asked, and the items with their `role`, with the time each answer took. With a free key, mind the quota: a photo to the item list is about 4 AI calls.

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
curl -s -X POST localhost:5678/webhook/help/request -H 'Content-Type: application/json' -d "{\"session_id\":\"SESSION\",\"image_base64\":\"$(base64 < photo.jpg | tr -d '\n')\",\"image_mime\":\"image/jpeg\"}"
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

`./tools.sh psql` opens a database prompt. One-off queries (the container keeps its old name `hd_postgres`; PostgreSQL is not published on a host port):

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
./tools.sh check                         # the latest 3 visits: time line, then the checks
./tools.sh check --session SESSION       # one visit
./tools.sh check --last 10 --checks-only # only the problems
./tools.sh check --all --since 2h        # everything of the last 2 hours
./tools.sh check --follow                # keep watching; prints new warnings and problems
./tools.sh check --json                  # the same as JSON, for other tools and agents
```

(`./tools.sh check` runs [tools/log_check.py](tools/log_check.py) in the robot container, reading PostgreSQL over the Compose network. With Python 3.11+ on the computer, `python3 tools/log_check.py ...` works the same.) The human-readable output of each part: `./tools.sh logs robot` (or `n8n`, `postgres`, `fake-ai`); the robot's files are also in `logs/` (`sim.log`, `robot_service.log`, `robot_service.jsonl`).

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
- **Robot service ↔ n8n.** All containers are on the Compose project's own network and reach each other by service name: n8n calls `http://robot:8000/...` (the `robot_url` in the workflow's Config node), the service calls `http://n8n:5678/webhook/robot/event` (`HD_N8N_URL`), n8n's database credentials use host `postgres`, the stand-in AI is `http://fake-ai:8010`. Nothing uses host networking, so it works the same on Linux and in Docker Desktop on a Mac, and a host firewall that blocks containers from reaching the host does not matter. Only 5678 (n8n), 8000 (demo), 6080 (RViz) and 8443 (https for phones, only answering with `HD_HTTPS=yes`) are published, on 127.0.0.1 (the demo and https ports on all interfaces in LAN mode).
- **One robot container.** [docker/robot/entrypoint.sh](docker/robot/entrypoint.sh) starts Xvfb + x11vnc + noVNC (RViz's screen), `ros2 launch robot/sim/sim.launch.py rviz:=false` (simulated robot, Nav2), RViz with the recording config, the robot service and (with `HD_HTTPS=yes`) the https relay, all sharing ROS 2 DDS inside the container. If the simulation or the service stops, the container stops and Docker restarts it; RViz and the https relay restart by themselves.
- **Kept apart from the real Dingo.** The simulation uses its own ROS domain (42) and talks only inside its container (`ROS_LOCALHOST_ONLY=1`, no host networking); the real robot is on domain 0. Nothing here can send it a command.
- **Using it with another robot later.** The service needs a Nav2 `navigate_to_pose` action, a `map → base_link` transform, and AMCL. The home pose and all shelf positions come from [store/layout.py](store/layout.py) and the `shelf_locations` table.

## Changing the store or the items

- Items: edit the list in [database/build_seed.py](database/build_seed.py), run `python3 database/build_seed.py`.
- Store layout (aisles, bays, dock, registers): edit [store/layout.py](store/layout.py), run `python3 store/build_map.py` and `python3 database/build_seed.py`.
- No Python on the computer? Run them in the robot image, e.g. `docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work --entrypoint python3 hd-demo-robot database/build_seed.py`
- Then `./start.sh` (the robot image is rebuilt because `store/` changed). The database is filled only when it is created. To recreate it (this erases visits; n8n is kept):
  ```bash
  ./stop.sh && docker rm -f hd_postgres && docker volume rm homedepot_hd_pgdata && ./start.sh
  ```

## Things to know

- **The AI** was tested against the real Gemini API on a free key (photos, a voice note, the whole visit) and, for the model chain and every failure path, against the stand-in. **Claude has not been called for real** (no Anthropic key was available): its requests follow Anthropic's Messages API documentation and were checked against the stand-in, which answers in the same format. If the first real Claude call fails, open the failed run in n8n → **Executions** and look at the **Ask Claude** node's error in the linked run of the sub-workflow **Ask an AI model**.
- Starting a new visit at the kiosk closes any visit still open: one robot, one customer.
- If Nav2 cannot reach a shelf after three attempts, the service reports it as reached so the visit can continue (robot failures are out of scope).
- The demo stage draws the QR code itself (no internet needed); the link under it always works.
- No logins or security anywhere: the random session id in the phone link is the only key. n8n and RViz listen on this computer only (127.0.0.1), PostgreSQL only inside the Compose network; the demo port too unless `HD_LAN=yes`.
- `.env` holds the passwords and the API keys: it is in `.gitignore`; never commit or share it. The scripts never print a key.
- The robot image is built for the computer's own CPU (x86_64 or arm64). Every base image (`ros:humble-ros-base-jammy`, `node:22`, `postgres:16.16`, `n8n:2.47.7`) is multi-arch, and every apt package and Python wheel in the image exists for arm64; the full stack has been run on Ubuntu x86_64 only so far.
- The scripts are written for macOS's bash 3.2 and BSD tools (checked with bash 3.2.57). On a Mac, keep the demo folder in your home folder (Docker Desktop shares it with containers by default).
