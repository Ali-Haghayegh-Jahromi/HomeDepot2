# API formats

Everything is JSON over HTTP. Two sets:

- **A. Phone / kiosk → n8n** (webhooks; base `http://localhost:5678/webhook`)
- **B. n8n ↔ robot service** (base `http://localhost:8000`)

`?` after a field name means optional.

---

## A. Phone / kiosk → n8n

### The "screen" reply

Every phone webhook answers with the same shape, which tells the phone page what to show next. The phone page only has to draw the screen named in `screen`.

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | the visit |
| `screen` | string | one of the screens below |
| `message` | string | text to show the customer |
| `data` | object | the content of that screen |
| `trace` | object | what the n8n run behind this reply decided (below, "The decision trace") |

| `screen` | Phone shows | `data` |
|---|---|---|
| `input` | text box, photo upload, voice recorder | `{}` |
| `sorry` | the sorry message, then the input page again | `{}`, or `{question, options}` when a follow-up question is still waiting for an answer |
| `question` | a follow-up question + the same input options | `{question: string, options: string[], understood: string}` (`options` may be empty; they are tap-to-answer suggestions; the question is plain text, no markdown, no choices inside it) |
| `items` | the suggested items, to add to the route in pick-up order | `{items: Item[], understood: string}` (at most 8; `main` items first, each `alternative` right after the item it can replace, `tool`s last) |
| `guiding` | "Follow the robot" + the item it is heading to | `{item: Item, index: int, total: int, light_on: bool}` |
| `arrived` | the same item + the **I am done** button | same as `guiding`, plus `robot_reached: bool` (false: the robot could not get all the way to the shelf; `message` then says where the item is) |
| `anything_else` | "Is there anything else I can help you with?" Yes / No | `{}` |
| `finished` | repair steps and videos for every request; visit over | `{requests: Summary[]}` |
| `timed_out` | "Session ended" + the same steps and videos, if any (after 10 minutes without input, or when a new customer pressed the kiosk button) | `{requests: Summary[]}` |

**`understood`** (on every `question` and `items` reply that came from the AI, also when n8n asks the budget): one short plain sentence (at most 25 words), no question, saying what the AI understood of the job so far, for the phone's "Here's what I see". After a photo it starts with "I can see", for example `"I can see a cracked pressure-treated deck board with rusty nails."`; later in the same request it keeps what the photo showed (`"A cracked deck board, about $80 to fix it."`). It is `""` when the AI gave nothing usable for it. A retry reply (below) keeps the `understood` of the screen it repeats.

**"Please send it again"** (any `/help/request`): when the AI did not answer in time or gave an unusable answer, nothing changes for the visit. The reply is the screen the phone is already on, with the same `data` plus `retry: true`, and `message` is the retry text ("Sorry, I couldn't process that just now. Please send it again."). On a `question` screen the question and its options stay; the phone should show `message` as a note and let the customer send the same answer again. A `/help/request` is answered within about 25 seconds, this way if need be. Before giving up, n8n tries every AI model of its chain that time allows (several free Gemini models, then Claude if a key is set). When the message was only a voice recording and no Gemini model could answer (Claude cannot listen), the retry reply's `message` is instead "Sorry, I can't listen to voice notes right now. Please type your message instead (you can add a photo too)." (same `retry: true`, same screen).

**Not relevant on the item list**: an unrelated message sent while the phone shows `items` gets the sorry text as `message`, but the screen stays `items` with the same list (so the customer can still choose).

`Item`:

```json
{
  "sku": "218-788",
  "item_name": "Deckmate #9 x 3 in. Star-Drive Tan Deck Screws (1 lb.)",
  "brand": "Deckmate",
  "price": 11.97,
  "item_url": "https://www.homedepot.com/s/Deckmate%20%239%20x%203%20in.%20Star-Drive%20Tan%20Deck%20Screws%20%281%20lb.%29",
  "description": "Star drive resists stripping; approved for treated lumber.",
  "specs": "outdoor; coated; Torx T-25 bit included",
  "department": "Fasteners",
  "aisle": 3,
  "shelf": 4,
  "role": "main",
  "reason": "Holds the new deck board to the joists; fits your budget."
}
```

`reason` (string) is the AI's one-line "why this item"; `role` (string) is what the item is for in the job:

| `role` | Meaning |
|---|---|
| `main` | a first-choice item that fixes the problem, including the other materials the job needs (one per need) |
| `alternative` | another option (cheaper or better) for the `main` item just before it in the list |
| `tool` | a tool the job needs (always a Tools department item of the catalogue) |

The budget counts the `main` items only: the alternatives are other options, and the tools are shown apart because the customer may already own them. n8n never leaves out a tool the job needs: every `tool`'s `reason` ends with "Skip it if you already own one.", and when the main items and the tools together come to more than the budget, n8n swaps each tool for the cheapest tool of the same kind in the catalogue (a lower quality tier; never a special-purpose one such as masonry bits), whose `reason` then says so. The `items` screen's `message` is the Config `items_message` plus a budget line with the main items against the budget and the tools apart, for example:

"Here's what I recommend. Add the items you want to your route, in the order you'd like to collect them. Main items: $33.94 of your $80 budget. Tools: $128 more (skip any you already own)."

(over the budget: "Main items: $93.50, over your $80 budget."; with no amount: "Main items: $33.94."; with no tools the tools part is left out). Both `reason` and `role` are only present in the `items` screen (not in `guiding` / `arrived`).

`Summary`:

```json
{
  "request": "Replace a cracked deck board",
  "items": ["Deckmate #9 x 3 in. Star-Drive Tan Deck Screws (1 lb.)", "WeatherShield 5/4 in. x 6 in. x 8 ft. Pressure-Treated Decking Board"],
  "repair_steps": ["Pry up the cracked board with the claw of a hammer.", "Measure the gap and cut the new board to length.", "..."],
  "videos": [
    {"title": "how to replace a deck board", "url": "https://www.youtube.com/results?search_query=how%20to%20replace%20a%20deck%20board"}
  ]
}
```

### The decision trace

Every reply of the n8n webhooks (the phone's, the kiosk's, the robot's, and the errors below) carries `trace`: the decision nodes the n8n run went through, in order, and the branch each one took, named exactly as on the canvas of the workflow **Home Depot guide robot**.

```json
"trace": {
  "execution_id": "440",
  "decisions": [
    {"question": "Which call is this?", "answer": "phone or robot"},
    {"question": "Is this a known visit?", "answer": "yes"},
    {"question": "Is it a customer action?", "answer": "yes"},
    {"question": "Is the visit still open?", "answer": "yes"},
    {"question": "Does the call fit the current step?", "answer": "yes"},
    {"question": "Is the input complete and valid?", "answer": "yes"},
    {"question": "Route the call", "answer": "customer input"},
    {"question": "Did AI 1 answer?", "answer": "yes"},
    {"question": "Relevant to home repair?", "answer": "yes"},
    {"question": "Did AI 2 answer?", "answer": "yes"},
    {"question": "Did AI 2 ask a question or pick items?", "answer": "picked items"},
    {"question": "Budget known?", "answer": "no"},
    {"question": "Did the save apply?", "answer": "yes"},
    {"question": "Any orders for the robot?", "answer": "no"}
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `execution_id` | string | the n8n execution of the main workflow; open it at `http://localhost:5678/workflow/hdGuideRobot00001/executions/<execution_id>` (n8n paints the path the run took) |
| `decisions[].question` | string | the If / Switch node's name on the canvas |
| `decisions[].answer` | string | the branch it took: `yes` / `no` for an If node, the output's name for a Switch node (for example `customer input`, `picked items`, `near (5 m)`) |

It is read from the run itself (the "Build the reply" Code node asks n8n which decision nodes ran and which output their item left by), not inferred. It lists the decisions before the reply (not AI 3's, which run after it). The AI model chain's own decisions (Gemini or Claude?, Out of quota or busy?, ...) are in its own execution of **Ask an AI model (Gemini → Claude fallback)**, linked from the "AI 1: relevancy check" / "AI 2: understand the need" node of the main execution; the event log's `ai_call` rows carry its `sub_execution_id`.

On `GET /help/status` (A6) `trace` is the trace of the **last run of the main workflow that saved something for the visit**: the kiosk button that started it, a customer action, a robot event (`near` / `arrived`, also one that only logged), or the timeout. That run's trace ends with `Did the save apply? → yes` and `Any orders for the robot?`. It is `null` only for visits saved before this version.

Errors (any webhook): HTTP 400 `{"error": "empty_request" or "bad_request", ...}` when required content is missing; HTTP 404 `{"error": "unknown_session", "message": "..."}`; HTTP 409 `{"error": "session_ended", ...}` or `{"error": "wrong_step", "message": "...", "screen": "<current screen>"}` when a call does not fit the current screen (for example `/help/next` before the robot has arrived).

### A1. `POST /help/start` — kiosk button (new)

Input: `{}` (nothing needed).

Output:

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | random id of the new visit |
| `link` | string | the page the customer opens |
| `qr_image_url` | string | a PNG of the QR code for `link`; the kiosk shows it |
| `screen` | string | always `input` |
| `message` | string | the welcome text for the input page |
| `trace` | object | the decisions of this run (`Which call is this?` → `kiosk button`, ...) |

```json
{
  "session_id": "k7m2x9qa4h",
  "link": "https://help.example.com/s/k7m2x9qa4h",
  "qr_image_url": "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https%3A%2F%2Fhelp.example.com%2Fs%2Fk7m2x9qa4h",
  "screen": "input",
  "message": "Tell us what you need help with. Type it, add a photo, or record your voice."
}
```

`https://help.example.com/s/` stands for the phone site's address. It is one setting in the workflow (`phone_link_base` in the Config node); in this demo it is `http://localhost:8000/demo/phone.html?s=`, the demo phone page.

### A2. `POST /help/request` — customer input

Used for the first description, every follow-up answer, and new requests after "anything else?".

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | required |
| `text?` | string | typed text |
| `image_base64?` | string | a photo, base64 |
| `image_mime?` | string | e.g. `image/jpeg` (default) |
| `audio_base64?` | string | a voice recording, base64 |
| `audio_mime?` | string | e.g. `audio/webm` (default), `audio/mp4` |
| `budget?` | number | total budget for the job in dollars, more than 0; if given, the AI does not ask for it |

At least one of text, image, audio is needed. A `budget` that is not a positive number: HTTP 400 `bad_request`.

The workflow always learns the budget before it shows items: if the AI recommends items while no budget is known (neither `budget`, nor said by the customer), the phone gets a budget question instead (once per request; if the customer gives no amount, the AI recommends good-value items).

```json
{"session_id": "k7m2x9qa4h", "text": "one of the boards on my deck is cracked, how do I fix it"}
```

Output: a screen reply with `screen` = `sorry`, `question` or `items`.

```json
{
  "session_id": "k7m2x9qa4h",
  "screen": "question",
  "message": "Is the deck made of wood or composite?",
  "data": {"question": "Is the deck made of wood or composite?", "options": ["Wood", "Composite", "Not sure"],
           "understood": "You want to replace a cracked deck board."}
}
```

With a photo (`image_base64`) and no text, the AI works from the photo: it says what it sees and asks only what the photo cannot show. The budget is asked by n8n (the `budget_question` of the Config node), with the AI's `understood`:

```json
{
  "session_id": "k7m2x9qa4h",
  "screen": "question",
  "message": "Before I pick the items: roughly how much would you like to spend on this job in total?",
  "data": {"question": "Before I pick the items: roughly how much would you like to spend on this job in total?",
           "options": ["About $25", "About $50", "About $100", "No fixed budget"],
           "understood": "I can see a cracked pressure-treated deck board with rusty nails."}
}
```

```json
{
  "session_id": "k7m2x9qa4h",
  "screen": "sorry",
  "message": "Sorry, we can't help with that. Your request isn't related to what this service helps with.",
  "data": {}
}
```

### A3. `POST /help/confirm` — the item choice

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | required |
| `skus` | string[] | the chosen SKUs **in the customer's order**; may be empty. Only SKUs of the current `items` list count; others and repeats are left out (the `message` says so), at most 8 |

```json
{"session_id": "k7m2x9qa4h", "skus": ["218-788", "123-760"]}
```

Output: screen `guiding` for the first item (the robot has been sent), or `anything_else` if `skus` is empty. If none of the SKUs is on the list: HTTP 400 `bad_request` (the phone stays on `items`). The answer comes at once: the repair steps and videos are written in the background and appear in the `finished` / `timed_out` summary.

```json
{
  "session_id": "k7m2x9qa4h",
  "screen": "guiding",
  "message": "Follow the robot to aisle 3, bay 4.",
  "data": {"item": {"sku": "218-788", "item_name": "Deckmate #9 x 3 in. Star-Drive Tan Deck Screws (1 lb.)", "price": 11.97, "aisle": 3, "shelf": 4, "...": "..."}, "index": 1, "total": 2, "light_on": false}
}
```

### A4. `POST /help/next` — the "I am done" tap

Input: `{"session_id": "k7m2x9qa4h"}`

Only accepted on the `arrived` screen. Output: screen `guiding` for the next item, or `anything_else` after the last one.

### A5. `POST /help/anything-else` — answer to "anything else?" (new)

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | required |
| `answer` | string | `"yes"` or `"no"` |

Output for `yes`: screen `input` (same session, same link). Output for `no`: screen `finished`; the robot is sent home and the visit ends.

`"no"` is accepted on the `anything_else` screen, and also on `input`, `sorry` and `question` once the visit has a completed request with chosen items (the customer said "yes, one more thing" and then changed their mind: the phone's **No, I'm done** button). A request started since is left unfinished and is not in the summary. Elsewhere: HTTP 409 `wrong_step`.

```json
{
  "session_id": "k7m2x9qa4h",
  "screen": "finished",
  "message": "Thanks for visiting! Here are your repair steps and videos.",
  "data": {"requests": [{"request": "Replace a cracked deck board", "items": ["..."], "repair_steps": ["...", "..."], "videos": [{"title": "how to replace a deck board", "url": "https://www.youtube.com/results?search_query=how%20to%20replace%20a%20deck%20board"}]}]}
}
```

### A6. `GET /help/status?session_id=k7m2x9qa4h` — what should the phone show now? (new)

The phone calls this every 1 to 2 seconds (the old demo page: 1.2 s, the React phone page: 1.5 s). It returns the current screen reply (same shape as above). This is how the phone learns things the robot causes: the light coming on (`light_on: true`) and the arrival (`guiding` → `arrived`), and a timeout (`timed_out`). It does not count as customer input for the 10-minute timeout. This reply has one extra field, `status`: `active`, `ended` or `timed_out`; its `trace` is the one of the last real run of the visit (see "The decision trace"). Unknown `session_id`: HTTP 404 `unknown_session`.

It is answered by its own small n8n workflow, **Phone screen (status poll)** (Webhook → Postgres read → Respond), whose successful runs are not saved, so the main workflow's Executions list shows only real steps. It only reads; the screen and its trace are written by the main workflow.

---

## B. n8n ↔ robot service

### B1. `POST /tour/start` — drive to ONE item

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | sent back with every robot event |
| `index` | int | which item of the customer's list this is (1-based) |
| `total` | int | how many items are on the list |
| `stop.sku` | string | |
| `stop.name` | string | item name |
| `stop.short_name` | string | the item's kind, at most 16 characters, for the RViz label (for example `Deck board`, `Cordless drill`) |
| `stop.aisle`, `stop.shelf` | int | |
| `stop.x`, `stop.y`, `stop.yaw` | number | where to stop, map frame, metres / radians |
| `stop.tag_code` | string | the item's shelf tag |
| `stop.light_x`, `stop.light_y`, `stop.light_z` | number | where that tag's light is (for drawing it) |

```json
{
  "session_id": "k7m2x9qa4h", "index": 1, "total": 2,
  "stop": {"sku": "218-788", "name": "Deckmate #9 x 3 in. Star-Drive Tan Deck Screws (1 lb.)",
           "aisle": 3, "shelf": 4, "x": 14.8, "y": 14.125, "yaw": 0.0,
           "tag_code": "TAG-0304-015", "light_x": 15.75, "light_y": 14.125, "light_z": 1.4}
}
```

Output: the status object (B3), with `state: "navigating"`.

### B2. `POST /tour/next` — the customer has picked up the item

Input: `{"session_id": "k7m2x9qa4h"}`. The robot leaves `waiting_for_pick` and waits (`idle`) for the next `/tour/start` or `/tour/done`. Output: the status object.

### B3. `GET /tour/status`

| Field | Type | Meaning |
|---|---|---|
| `state` | string | `idle`, `navigating`, `waiting_for_pick`, `returning_home`, `done` (back home after a visit) |
| `session_id` | string or null | |
| `index`, `total` | int | as given in `/tour/start` (0 when idle) |
| `current_item` | object or null | the `stop` from `/tour/start` |
| `distance_m` | number or null | straight-line distance to the stop |
| `pose` | object | `{x, y, yaw}` of the robot on the map |
| `lights_on` | string[] | tag codes whose light is on |

```json
{"state": "navigating", "session_id": "k7m2x9qa4h", "index": 1, "total": 2,
 "current_item": {"sku": "218-788", "name": "Deckmate ...", "aisle": 3, "shelf": 4, "x": 14.8, "y": 14.125, "yaw": 0.0, "tag_code": "TAG-0304-015", "light_x": 15.75, "light_y": 14.125, "light_z": 1.4},
 "distance_m": 9.42, "pose": {"x": 9.7, "y": 6.2, "yaw": 1.2}, "lights_on": []}
```

### B4. `POST /tour/done` — go home

Input: `{"session_id": "k7m2x9qa4h", "reason": "done"}` (`reason`: `"done"`, `"timeout"`, or `"new_visit"` when the kiosk button closed a visit that was still open). All lights go off, the robot drives to its starting point. Output: the status object with `state: "returning_home"`.

### B5. `POST /tag/on` and `POST /tag/off` — shelf-tag light

Input: `{"tag_code": "TAG-0304-015"}`. Output: `{"ok": true, "tag_code": "TAG-0304-015", "light": "on"}` (or `"off"`).

### B6. `GET /health`

Output: `{"ok": true, "mode": "ros", "nav2_ready": true}` (`mode` is `ros` or `mock`; mock = no robot, it pretends to drive, for testing n8n alone).

### B6b. Extras for the demo screens (not used by n8n)

- `GET /demo/` : the demo stage (kiosk, phone, live map); `GET /demo/phone.html?s=<session_id>` : the phone page.
- `GET /store/layout` : the store's floor plan as JSON, for drawing the map.
- `GET /n8n/health` : `{"ok": true}` when n8n answers its own `/healthz` (`{"ok": false}` otherwise); the stage's n8n status pill uses it.
- `GET|POST /webhook/<path>` : passed on unchanged to n8n (`http://localhost:5678/webhook/<path>`), so the demo pages need only one address.
- `/tag/on` and `/tag/off` also accept optional `x`, `y`, `z` (where to draw a light for a tag that was never part of a tour; for testing).
- `GET /logs?since=&session_id=&level=&limit=` : the robot service's structured log (`logs/robot_service.jsonl`), oldest first: `{"entries": [{ts, source, level, session_id, event, details, duration_ms?, line}], "last_line": n}`. `since` is a line number (entries after it; pass the previous `last_line` to poll) or an ISO time; `level` is `info`, `warn` or `error` (that level and worse); `limit` defaults to 500.
- `POST /log` : how the demo pages (or a tool) add an entry to the same log: `{"source": "phone" | "stage" | "tool", "level": "info" | "warn" | "error", "session_id": "...", "event": "js_error", "details": {...}}`. Always answers `{"ok": true}` (or `{"ok": false}` for a body that is not JSON); it never fails.
- n8n's orders carry two extra headers, `X-HD-Execution` (the n8n execution id) and `X-HD-Order` (the order's place in that run), which only go into the robot service's log.

### B7. Robot service → n8n: `POST http://localhost:5678/webhook/robot/event` (new)

| Field | Type | Meaning |
|---|---|---|
| `session_id` | string | |
| `event` | string | `near` (within 5 m, straight line), `arrived` (stopped at the item), `home` (back at the start) |
| `sku?`, `tag_code?` | string | the item, for `near` and `arrived` |
| `distance_m?` | number | distance to the item (or, for `home`, to the dock) when the event was sent |
| `reached?` | bool | `arrived` / `home`: false when Nav2 gave up more than 2 m (`HD_REACHED_M`) from the stop; the visit goes on anyway (robot failures are out of scope) |

```json
{"session_id": "k7m2x9qa4h", "event": "near", "sku": "218-788", "tag_code": "TAG-0304-015", "distance_m": 4.96}
```

Output: `{"ok": true, "trace": {...}}` (the decisions of that run). What n8n does: `near` → calls `/tag/on` and sets `light_on: true` on the phone (only while the phone is still guiding to that item: `near` never changes the screen); `arrived` → phone screen becomes `arrived` (a `near` that never came is made up for here, so the light is always on at arrival; with `reached: false` the message says where the item is instead of "you have arrived"); `home` → nothing to do but record it.

The service sends its events one at a time, in the order they happened (one sender thread; n8n answers after it has saved), so `near` is always handled before `arrived`, even when both happen in the same second.

---

## Order and overlapping calls

- n8n sends one run's robot orders strictly one after the other (for example `/tag/off` → `/tour/next` → `/tour/start`), each after the previous one was answered.
- Each call is its own n8n run (load → decide → save). Runs for the same visit can overlap (a double tap, the timeout while the AI is still answering, a new visit at the kiosk). A run saves only if the visit is still active and unchanged since it was loaded (`sessions.rev`); otherwise it changes nothing, sends no robot orders, and answers with the visit as it is now. A double "I am done" is therefore applied once.
- Customer calls (`/help/request`, `/help/confirm`, `/help/next`, `/help/anything-else`) count as activity for the 10-minute timeout as soon as they arrive.

## Changes from the brief's starting API, and why

1. **`/tour/start` carries one stop, not a list** (`stop` instead of `stops`), with `index`/`total` beside it: the robot gets one item at a time in the customer's order, so n8n calls it once per item.
2. **`/tour/start` also carries `session_id`, `tag_code` and the light position**: the robot needs the session to report events, and the tag's position to draw its light.
3. **`/tour/next` now means "item picked up"** rather than "drive to the next stop": the next stop arrives with the next `/tour/start`.
4. **New `/tour/done`, `/tag/on`, `/tag/off`, `/health`**: the "done" message, the light, and a quick check that the service is alive.
5. **New `/robot/event`**: the robot tells n8n it is near / has arrived, instead of n8n asking over and over.
6. **`/help/request` gained `session_id`, `image_mime`, `audio_base64`, `audio_mime`**: session, voice recordings, and the file type the AI needs to read them.
7. **`/help/confirm`, `/help/next` gained `session_id`.**
8. **New `/help/start`, `/help/anything-else`, `/help/status`**: the kiosk button, the "anything else?" answer, and the phone's way to pick up robot-driven changes.
9. **`/tour/status` gained `session_id`, `distance_m`, `pose`, `lights_on`**: useful for testing and for the phone's progress display.
10. **`trace` on every reply** (and on `/help/status`, for the visit's last real run): the n8n decisions, so a screen can show what n8n decided and link to the execution.
11. **`POST /webhook/timeout`** (internal): the workflow **Timeout check (every minute)** calls it only when a visit has been idle for 10 minutes; the main workflow then closes it. Answer: `{"ok": true, "trace": {...}}`. Calling it by hand is harmless (it closes only visits that really are idle).
