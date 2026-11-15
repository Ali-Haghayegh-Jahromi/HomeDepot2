# The workflow, node by node

The workflow is one n8n workflow called **Home Depot guide robot** (132 nodes, built by `n8n/build_workflow.py`). n8n is the backbone: it receives every call, holds every decision, and tells the other parts what to do.

```
phone / kiosk ──► n8n (the brain: every decision on the canvas)
                    ├── Gemini / Claude  advice: AI 1 relevant?, AI 2 question or items, AI 3 repair steps
                    │                    (several free Gemini models in turn, Claude as the last fallback)
                    ├── PostgreSQL       memory: visits, requests, conversation, the store catalogue
                    └── robot service    hands: drive to a shelf, shelf-tag lights, go home
```

## How to read the canvas

- **Left to right.** Each call from the kiosk, the phone or the robot is one short run: who is calling → load the visit → check the call → the call's own lane → save → tell the robot → reply.
- **Decisions are If / Switch nodes named as questions** ("Relevant to home repair?", "Budget known?"). Every outcome is its own node you can follow with your eyes.
- **Edit Fields (Set) nodes** write the phone's next screen (`save.screen`, `save.message`, `save.data`) and the robot's orders (`save.orders`).
- **Code nodes only shape data**: write a prompt, read and clean the AI's JSON, unpack a database row, package a save, build the reply. No business decision is hidden in them.
- **Coloured notes** group the sections: grey = who is calling / status poll, purple = load and check / the shared ending, blue = the AIs, green = item choice, guiding and robot events, orange = timeout. Key nodes have a one-line note under them.

The AI never acts: it advises, n8n decides. Nothing reaches the main AI without passing the relevancy AI, every SKU the AI suggests is checked against the catalogue, and the robot only moves when n8n sends it an order.

## The idea in four sentences

1. The kiosk, the phone and the robot each call a **webhook** (an address that starts the workflow).
2. Each call is one **short run**: it loads what the workflow remembers about the visit from PostgreSQL, does one step, saves, and answers. Nothing waits inside n8n, so nothing is lost if n8n restarts.
3. The answer to the phone is always a **screen**: which page to show (`input`, `question`, `sorry`, `items`, `guiding`, `arrived`, `anything_else`, `finished`, `timed_out`) and its content. The phone also asks "what should I show now?" every second or so, which is how it learns what the robot did.
4. Every path that changes the visit ends in the same nodes: save (only if nothing else changed the visit meanwhile), tell the robot (one order at a time), build the reply, reply.

Node types you will see: **Webhook** (start on a call), **Schedule Trigger** (start on a timer), **Edit Fields** (set values), **If** / **Switch** (decide), **Postgres** (run SQL), **Code** (shape data), **HTTP Request** (call another service), **Split Out** + **Loop Over Items** (one robot order at a time), **Basic LLM Chain** + **Google Gemini Chat Model** / **Anthropic Chat Model** + **Structured Output Parser** (n8n's AI nodes, for AI 3), **Respond to Webhook** (send the answer).

## 1. Who is calling?

| Node | What it does |
|---|---|
| **Kiosk button** | Webhook `POST /help/start`. The kiosk's "I'm here, I need help" button. |
| **Phone: customer input** | Webhook `POST /help/request`. Text, photo and/or voice: the first description, every follow-up answer, and new requests later. |
| **Phone: item choice** | Webhook `POST /help/confirm`. The SKUs the customer ticked, in their order. |
| **Phone: I am done** | Webhook `POST /help/next`. The customer has the item. |
| **Phone: anything else?** | Webhook `POST /help/anything-else`. Yes or no. |
| **Phone: what to show now** | Webhook `GET /help/status`. The phone's regular question; it does not count as customer activity. |
| **Robot event** | Webhook `POST /robot/event`. The robot service reports `near`, `arrived` or `home`. |
| **Every minute** | Schedule Trigger. Starts the timeout check once a minute. |
| **Config** | Edit Fields. **All settings in one place**: the AI providers (`ai_provider`: Gemini first or Claude first; `gemini_models`: the Gemini models to try, in order; `claude_key_set`, `claude_fast_model`, `claude_main_model`, their effort and API version), how long a model rests after "out of quota" or "busy" (`model_rest_*`), how much the Gemini models may "think", the time limits (`ai_wait_ms`: the customer never waits longer than about this; `relevancy_budget_ms` and `relevancy_timeout_ms` for AI 1, `main_try_ms` per AI 2 try, `min_try_ms`), the robot service address, the phone link, every message shown to the customer, the timeout (10 minutes), the maximum list length (8). It also works out which webhook started this run (`endpoint`). To swap the AI models, change them here (or in `.env`: `HD_AI_PROVIDER`, `HD_GEMINI_MODELS`). |
| **Which call is this?** | Switch: *kiosk button* → section 2, *every minute* → section 8, *phone or robot* → section 3. |

## 2. Kiosk button: a new visit (top lane)

| Node | What it does |
|---|---|
| **Make a session id** | Edit Fields. A random 10-character id. |
| **Make the phone link and QR code** | Edit Fields. The phone link containing the id, the address of a QR-code picture of it, and the welcome text. |
| **Save new session** | Postgres (top right, next to the shared ending). Closes any visit that is still open (one robot serves one customer): its phone gets the `timed_out` screen with the repair steps and videos of its requests, and if it used the robot, the robot gets "done" (go home, all lights off) through the normal orders path. Then it stores the new visit with the phone on the `input` screen. It goes straight to **Any orders for the robot?**. |

## 3. Load the visit and check the call

| Node | What it does |
|---|---|
| **Load the visit** | Postgres. Reads everything remembered about this visit in one go: the visit (with its revision number `rev`), its requests, and the whole conversation. A customer call counts as activity for the timeout right here, so a slow AI answer cannot let the visit time out meanwhile. |
| **Unpack the visit** | Code. Puts the row and the call into one item for the nodes after it: the request the customer is in the middle of, the summaries (repair steps and videos of every finished request), the time the call arrived (`t_start`, for the AI time budget) and a short log-safe summary of the input. |
| **Is this a known visit?** | If. No → **Refuse: unknown visit (404)**. |
| **Is it a customer action?** | If. No (a status poll or a robot event) → straight to **Route the call**: those are answered or logged even after a visit ended. |
| **Is the visit still open?** | If. No → **Refuse: visit has ended (409)**. |
| **Check what this call needs** | Edit Fields. Two fields the next two decisions read: `allowed_screens` (on which phone screens this call makes sense: "I am done" only on `arrived`, an item choice only on `items`; "No, I'm done" also on the input page once a request of this visit is complete) and `input_problem` (empty text, a budget that is not a positive number, `skus` not a list or none of them suggested, an answer that is not yes/no). |
| **Does the call fit the current step?** | If. No → **Refuse: wrong step (409)**. |
| **Is the input complete and valid?** | If. No → **Refuse: bad input (400)**. |
| **Refuse: …** → **Reply with the error** → **Log the refusal** | Edit Fields + Respond to Webhook + Postgres. The caller gets the error of API_CONTRACT.md at once; the `call_refused` log entry is written after the reply. |
| **Route the call** | Switch: *customer input* (4), *item choice* (5), *I am done* and *anything else?* (6), *robot event* (7), *status poll* (**Show the current screen** → **Reply with the screen**: answered at once, nothing saved). |

## 4. Customer input: two AIs, decided by n8n

Steps 2 to 5 of the brief. Nothing reaches the main AI without passing the relevancy AI.

### The model chain (the same nodes for AI 1 and for AI 2)

A free Gemini key has a small quota per model, and Google is sometimes overloaded or slow, so no AI call depends on one model. Each AI call goes through the same visible loop (the node names end in "(AI 1)" or "(AI 2)"):

| Node | What it does |
|---|---|
| **Which AI models are resting?** | Postgres, once per customer input. The models that recently answered "out of quota" or "busy", and until when they rest (table `ai_model_status`). |
| **AI 1: pick the next model** / **AI 2: pick the next model** | Code (the loop's start). The next model of the chain: the Gemini models of `gemini_models` in order, then Claude (`ai_provider = claude`: Claude first), without the ones already tried in this call and the resting ones (those stay at the very end, as a last resort). Builds that model's request and its time limit: AI 1 until `relevancy_budget_ms` after the call arrived (at most `relevancy_timeout_ms` per try), AI 2 until `ai_wait_ms` (at most `main_try_ms` per try). |
| **Gemini or Claude?** | Switch. *Gemini* → the HTTP Request **AI 1: relevancy check (Gemini)** / **AI 2: understand the need (Gemini)** (`generateContent`, JSON with a response schema). *Claude* → **Claude key set?** |
| **Claude key set?** | If (`claude_key_set`, set when `./start.sh` imports a key). No → **Skip Claude: no key**. |
| **Can Claude read it?** | If. Claude cannot listen to voice recordings: for a voice note alone → **Skip Claude: voice note**. Otherwise → **AI 1: relevancy check (Claude)** / **AI 2: understand the need (Claude)** (Anthropic Messages API: the photo as a base64 image block, JSON through structured outputs, `claude_fast_model` for AI 1, `claude_main_model` for AI 2). |
| **Read the relevancy answer** / **Read the main answer** | Code. Reads either provider's answer (below), or why the call failed: `quota_day` / `quota` (HTTP 429), `busy` (503 / 529 / 5xx), `timeout`, `model` (404: a wrong model name), `key` (401 / 403), `request` (another 400), `bad_answer` (no JSON, a garbled question). With it, how long the model should rest (`rest_s`): an hour for a daily quota, the "retry in N s" Google gives (at least 20 s) for a rate limit, 90 s when busy or too slow (a timeout counts only if the model had a full try), 2 hours for a wrong model name; nothing for a bad answer. |
| **Did AI 1 answer?** / **Is AI 2's answer usable?** | If. Yes → on to the decisions below. No → **Out of quota or busy?** |
| **Out of quota or busy?** | If (`rest_s > 0`). Yes → **Remember: the model rests** (Postgres: `resting_until` in `ai_model_status`, so later calls skip it). |
| **Another model to try?** | If: models left in the chain, and at least `min_try_ms` of the time left. Yes → back to **pick the next model**. No → **A voice note Claude could not hear?** → yes: **Ask to type it instead** ("Sorry, I can't listen to voice notes right now. Please type your message instead"); no: **Ask to send it again** ("Sorry, I couldn't process that just now. Please send it again."). Either way nothing changes for the visit; the phone stays where it was (a waiting question stays), and the log lists every model tried and why it failed. |

So with Gemini's first model out of quota the customer waits a quarter of a second longer (a 429 comes back at once), and the next call does not even try that model. With every Gemini model out, Claude answers (if a key is set); with nothing left, the customer gets "please send it again" within the time limit.

### The decisions

| Node | What it does |
|---|---|
| **Write the relevancy prompt** | Code. The request for AI 1, for Gemini and for Claude: the customer's text, photo and voice recording exactly as sent, plus one piece of context: if the assistant just asked a follow-up question, the AI is told that question, so a short answer like "about $30" is not judged unrelated. A photo of something broken in or around a home counts as relevant even with no text. It may only answer `{"relevant": true}` or `{"relevant": false}`; attempts to change the AI's instructions count as not relevant. |
| **Relevant to home repair?** | If. No → **Say sorry** (Edit Fields): the sorry message; the input page again in the same visit, or the item list if that is what the phone shows; a follow-up question that was waiting stays on screen. The message is stored in the history, marked not relevant. |
| **Read the item catalogue** | Postgres, **with the read-only user**. Reads the 100 store items. This user can read the item table and nothing else, which is how the AI is limited to this database: the AI never talks to the database itself, it only sees these rows. |
| **Write the main prompt** | Code. The request for AI 2 (Gemini and Claude): its rules, the catalogue, the whole conversation of this visit (earlier requests included, refused messages marked), the budget if known, and the new input with its photo/voice. The rules: recommend only catalogue items; **a photo first**: say what it shows (the item, the damage, roughly its material and size) and use it as if the customer had said it, never ask about what it shows, at most one question after a photo; assume as little as possible otherwise; one short question at a time; never ask the budget itself (n8n does, below); give every item a role (`main`, `alternative`, `tool`) and keep the main items and tools within the budget; `understood`: one sentence on what it understood ("I can see a cracked deck board..."). |
| **Read the main answer** | Code. Checks the answer instead of trusting it: every SKU against the catalogue (an invented item can never reach the phone), each item's role (a Tools-department item is a `tool`; an alternative with no main item before it becomes `main`), tools moved to the end, the list cut to 8; full-width punctuation made plain, markdown removed from a question, choices written into the question text turned into tap-to-answer options; a garbled question (leaked notes, another script, loops) counts as unusable; `understood` cleaned (a question inside it is left out); a missing title is filled in. Works out the budget (known, or stated now), whether the main items and tools fit it, and what to remember. |
| **Did the AI ask a question or pick items?** | Switch: *asked a question* → **Ask the follow-up question**; *picked items* → **Budget known?**; *no usable item* (every SKU was invented) → **Say no matching items**. |
| **Budget known?** | If (known, or asked once already). No → **Ask for the budget** (the Config node's `budget_question`, with the AI's `understood`): the brief's rule "always learn the budget before recommending". The AI is told not to ask about the budget itself (its own budget questions sometimes rambled), so this is the usual path; the next answer goes to the AI again, now with the budget. Yes → **Main items and tools within the budget?** |
| **Main items and tools within the budget?** | If (the alternatives do not count). Yes → **Show the item list**. No → **Leave out tools over the budget** (Code: the most expensive tools are left out until it fits; the main items always stay) → **Show the item list**, whose message then names what was left out. |
| **Package the answer for saving** | Code. The chosen screen plus what to remember: the customer's message (for a photo or recording, what the AI understood from it), the assistant's reply, the request's title and budget, the suggested items. Every `question` and `items` screen carries `understood` (the phone's "Here's what I see"). |

The loop "question → answer → relevancy → main AI" repeats as often as needed, because every answer is simply a new `/help/request` call.

## 5. Item choice: the robot sets off, then the repair steps

Steps 6 and 7 of the brief, and the start of step 8.

| Node | What it does |
|---|---|
| **Look up the chosen items** | Postgres. The chosen items in the customer's order, each with its shelf position on the robot's map (aisle + shelf → x, y, direction, and where the shelf-tag light is). |
| **Plan the trip** | Code. Keeps the customer's order (no route optimisation), and only items of this request's list, each once, at most 8 (the phone's message says if some were left out). Writes the prompt for AI 3. |
| **Any items chosen?** | If. Yes → **Start the tour**: the phone shows `guiding` for the first item and the robot gets "drive to item 1". No → **Ask anything else (nothing chosen)**. |
| **Repair steps to write?** → **Which AI models are resting? (AI 3)** → **AI 3: pick the models** → **Claude first? (AI 3)** → **AI 3: repair steps (Gemini)** or **(Claude)** → **Steps written?** → **Keep the repair steps** → **Save the repair steps** | After the reply has gone out (bottom right): the customer does not wait for them. AI 3 is n8n's **Basic LLM Chain**: the Gemini one has two **Google Gemini Chat Model** nodes (the first two models of `gemini_models` that are not resting), the Claude one an **Anthropic Chat Model** (`claude_main_model`); each has a **Structured Output Parser** (a JSON schema: `steps`, `video_queries`). Claude goes first only with `ai_provider = claude`. If the first chain writes no steps, **Try Claude for the steps?** (key set, not tried yet) / **Try Gemini for the steps?** (not tried yet) give the other one a turn. At most 6 short steps for the items actually chosen, and 2 or 3 YouTube search phrases; each phrase becomes `https://www.youtube.com/results?search_query=<phrase>`. Both are stored with the request and shown at the end of the visit. If AI 3 fails, the summary still gets a video search for the job. |

## 6. "I am done" and "anything else?"

| Node | What it does |
|---|---|
| **Find the next item** | Code. The item just picked up and the next one on the list, in the shapes the phone and the robot need. |
| **More items left?** | If. Yes → **Guide to the next item**: orders, sent in this order: light off for this item, "item picked up", drive to the next one; the phone goes back to `guiding`. No → **Ask anything else (all picked up)**: light off, "item picked up"; the robot stays where it is and the phone asks "Is there anything else I can help you with?". |
| **Anything else: yes or no?** | If. **Yes** → **Back to the input page**: same link, same visit, the flow restarts at section 4. **No** (also from the input page after an earlier "yes") → **Finish the visit**: the phone gets the repair steps and video links of **every** request of this visit, the robot gets "done" (it drives back to its dock, all lights off), and the visit ends. |

## 7. Robot events

| Node | What it does |
|---|---|
| **Read the robot event** | Code. Which item the robot is fetching now, and whether this event belongs to it (and if not, why: `home`, an unknown event, the visit ended, another item, the phone not guiding). |
| **Is this event for the item being fetched?** | If. No → **Just log the event**. |
| **Near or arrived?** | Switch. *near (5 m)* → **Phone still guiding to it?** (If) → yes → **Turn the shelf light on** (order "light on" for that item's tag; the phone's `light_on` is set only if it still shows this item, so a late `near` can never take the **I am done** button away); no → **Light is already on**. *arrived* → **Show 'You have arrived'**: the phone moves to the `arrived` screen, the only screen with the **I am done** button; the light is switched on here too in case `near` was missed. If the robot could not get closer than 2 m (`reached: false`), the message says where the item is instead of "you have arrived". |

## 8. The 10-minute timeout (bottom lane)

| Node | What it does |
|---|---|
| **Find idle visits** | Postgres. Once a minute: which open visits have had no customer input for 10 minutes? |
| **Idle visits found?** | If. Usually no, and the run ends here. |
| **Close the visit, send the robot home** | Edit Fields. Closes each one (unless the customer did something in the meantime), orders the robot home, and puts the phone on the `timed_out` screen, which still carries the repair steps of requests finished before the timeout. |

## 9. The shared ending: save, tell the robot, reply

| Node | What it does |
|---|---|
| **Add log context** | Code (event log). Adds the n8n execution id, the webhook and the input summary to the save. It never fails. |
| **Save state** | Postgres. The one place where the workflow writes its memory, in a single database transaction: the phone's new screen, the request (new or changed), and the new conversation lines. It also updates "last customer input", which the timeout counts from. Runs for the same visit can overlap (a double tap, robot events in the same second, the timeout while the AI is still answering), so it first locks the visit and writes only if the visit is still active and its `rev` is the one this run loaded (a `near` only sets `light_on`, and only while the phone is guiding to that item; a timeout only if the customer is still idle). In the same statement it writes this run's event-log entries. It returns the robot orders numbered in the order they must go out. |
| **Did the save apply?** | If (the concurrency guard, made visible). No → **Not saved: keep the visit as it is**: no robot orders, and the caller gets the visit as it is now. |
| **Any orders for the robot?** | If. |
| **One item per order** → **Send orders one at a time** → **Note the start time** → **Send to robot / shelf tag** → **Note the robot's answer** | Split Out + Loop Over Items (batch size 1) + HTTP Request. The robot service's `/tour/start`, `/tour/next`, `/tour/done`, `/tag/on`, `/tag/off`, **one at a time, in order** (for example light off → item picked up → drive to the next item): the loop sends the next order only after the robot service has answered the previous one. Each order is tried twice at most; if the robot service is down, the customer still gets an answer. |
| **Build the reply** | Code. The kiosk gets the link and QR code; the phone gets the screen (plus "please send it again" when the AI failed); the robot gets `{"ok": true}`. It also prepares the `robot_order` log entries (HTTP status and the state the robot service answered) and, after an item choice, the job for AI 3. |
| **Reply needed?** | If. The every-minute timeout run has nobody to answer, so it goes straight to the log. |
| **Reply** | Respond to Webhook. |
| **Anything to log?** / **Write the log** | If + Postgres (event log). Written after the reply has gone out, so logging can never slow down or break the answer (the node also continues on error). |

## The AI nodes: what is native n8n and why

| AI call | n8n node | Why |
|---|---|---|
| **AI 3** repair steps + videos | **Basic LLM Chain** + 2 × **Google Gemini Chat Model** (first + second free model), and a second **Basic LLM Chain** + **Anthropic Chat Model**, each with a **Structured Output Parser** | Text only, runs after the reply, so it needs no voice input and no hard time limit. Measured on the free key: 1.6 s. The Gemini Chat Model node has no thinking-level setting, so AI 3 uses the model's default; the Anthropic one runs adaptive thinking at low effort. |
| **AI 1** relevant? and **AI 2** question or items | **HTTP Request** to Gemini's `generateContent` and to Anthropic's Messages API (`/v1/messages`), with every model choice, retry and fallback decision as visible If / Switch nodes | n8n's Gemini nodes cannot meet four requirements here: (1) **voice recordings**: the Chat Model / Basic LLM Chain / AI Agent pass only images as binary, and the `googleGemini` node's text operation takes no media at all; (2) **a per-call time limit**: none of them has a timeout, and LangChain retries a 429/503 with back-off on its own, so the customer's 25 s could not be guaranteed and a model out of quota could not be skipped at once; (3) **the thinking level** (`minimal` keeps AI 2 at 1.5-5 s); (4) **Gemini's JSON mode with a response schema** (fewer unusable answers). For Claude the HTTP Request gives the same time limit and structured outputs (`output_config.format`), with the photo as a base64 image block. |
| AI 2 as an **AI Agent** with a read-only **Postgres Tool** on `store_items` | not adopted | Measured on the free key with `gemini-flash-lite-latest`: 2.9 s and 2.4 s (two model calls + one SQL query each), so latency alone would have been fine. It was not adopted because of the voice/timeout/thinking limits above, and because the catalogue is only 100 rows: pasting it costs one model call and keeps every answer checkable against the same list. The catalogue is still read by n8n with the read-only database user. |

The stand-in variant (`HD_GEMINI_URL=http://localhost:8010`; offline mode, `http://fake-ai:8010`) points every Gemini and Claude node at the stand-in AI, through the credentials **HD Gemini stand-in (no key)** and **HD Claude stand-in (no key)** (dummy keys, so a real key never goes there). The stand-in (`n8n/test/fake_gemini.py`) answers Gemini's and Anthropic's formats, also the one the Structured Output Parser asks for, and fails on purpose for test words (out of quota, overloaded) so that the model chain can be tested.

## The event log

Every run leaves rows in the `event_log` table, one per thing that happened, each with the session, the webhook and the n8n execution id. The nodes collect entries in a `log` list that travels with the `save`; *Save state* writes them with the visit in one statement through the database function `log_events()`, which never raises, and adds a `state_saved` row (screen before → after, orders, input summary). What each node logs:

| Node | Event |
|---|---|
| Save new session | `session_start`, and `session_closed_by_new_visit` for a visit it closes |
| Read the relevancy answer, Read the main answer, Keep the repair steps | `ai_call`: node, provider (`gemini` / `claude`), model, try number (`attempt`), why it failed (`failure`) and how long the model now rests (`rest_s`), the resting models it skipped (`skipped_resting`), duration, HTTP/API error, finish reason, tokens (prompt, answer, thinking; not for AI 3), parsed or not, missing fields, the raw answer when it was unusable, the relevancy verdict, AI 2's answer type, the question as the AI wrote it and as shown (added by Package the answer for saving), items kept/suggested, SKUs dropped as unknown, the budget rule, AI 3's step count |
| Read the relevancy answer, Read the main answer | `ai_skip`: Claude was skipped (`no_claude_key`, or `voice_note`: it cannot listen) |
| Package the answer for saving | adds to AI 2's `ai_call`: what was shown, `understood` as shown, the roles, `items_total` and `items_total_budgeted` (main items + tools), `items_over_budget`, `left_out_for_budget` |
| Say sorry, Ask to send it again / Ask to type it instead (AI 1 / AI 2) | `refused_not_relevant`, or `ai_failed_reply` when the customer got "please send it again" (or "please type it"), with every model tried and the ones now resting |
| Plan the trip | `items_chosen` (SKUs sent, on the trip, not on the list, over the limit) |
| Start the tour, Find the next item, Guide to the next item | `guide_to_item`, `item_done` |
| Back to the input page, Finish the visit | `anything_else`, `session_end` |
| Read the robot event (+ the node of its branch) | `robot_event`: applied (and what it did) or ignored, and why |
| Close the visit, send the robot home | `timeout_close` |
| Log the refusal | `call_refused` |
| Build the reply → Write the log | `robot_order` |
| Save state | `state_saved`: applied or not (and why not), screen and status before → after, rev, orders, how long the caller had waited |

`python3 tools/log_check.py` prints these rows merged with the robot service's log as one time line per visit, and checks them for bugs (README, "Logs and finding bugs"). A failed AI try that a later try of the same run recovered is reported as a warning (`ai_try_failed_retried`).

## One visit, as a list of runs

| # | Who calls | Path through the sections | Phone screen afterwards |
|---|---|---|---|
| 1 | kiosk | 1 → 2 → 9 | `input` |
| 2 | phone: "tell me a joke" | 1 → 3 → 4 (Relevant? no → Say sorry) → 9 | `sorry` |
| 3 | phone: a photo of the cracked deck board, "deck" | 1 → 3 → 4 (picked items, budget not known → Ask for the budget, with "I can see a cracked deck board...") → 9 | `question` |
| 4 | phone: "about $80" | 1 → 3 → 4 (picked items, budget known, within the budget) → 9 | `items` |
| 5 | phone: chooses 2 items | 1 → 3 → 5 → 9 (robot: drive to item 1), then AI 3 after the reply | `guiding` |
| 6 | robot: `near` | 1 → 3 → 7 (near, still guiding) → 9 (light on) | `guiding`, light on |
| 7 | robot: `arrived` | 1 → 3 → 7 (arrived) → 9 | `arrived` |
| 8 | phone: "I am done" | 1 → 3 → 6 (more items left) → 9 (light off, drive to item 2) | `guiding` |
| 9 | … runs 6 to 8 again for item 2 … | | `anything_else` |
| 10 | phone: "no" | 1 → 3 → 6 (Finish the visit) → 9 (robot: done, go home) | `finished` |
| 11 | robot: `home` | 1 → 3 → 7 (Just log the event) → 9 | (unchanged) |

To watch this for real: n8n → the workflow → **Executions**. Each row is one of these runs; click it to see which branch every decision took and the data that went through every node.

## What the workflow remembers (PostgreSQL)

| Table | One row per | Holds |
|---|---|---|
| `store_items` | item | name, link, SKU, price, aisle, shelf, tag code, plus department, kind, brand, quality tier, description, specs. **The only table the AI's user can read.** |
| `shelf_locations` | aisle + shelf | where the robot stops and where the tag light is, on the robot's map |
| `sessions` | visit | status, the phone's current screen, time of the last customer input, revision number (`rev`, for safe overlapping saves) |
| `requests` | thing the customer asked for | title, budget, suggested items, chosen items in order, which one the robot is on, repair steps, video links |
| `messages` | line of conversation | who said it, what kind, the text, whether it passed the relevancy check |
| `ai_model_status` | AI model that failed | the model chain's memory: until when it rests (`resting_until`), why (`quota_day`, `quota`, `busy`, `timeout`, `model`, `key`), the HTTP code and the error, how often. `./status.sh` lists the resting ones |
