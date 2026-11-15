# Aisle Guide: the 3-minute demo recording

One take of the live journey on the **studio view** (kiosk, the customer's real phone mirrored live, RViz's top view, the robot's status and n8n's decisions), plus a short cut to the **n8n canvas**. Times are targets for the finished video; the live part runs about 2:30 in real time (the robot drives at walking pace), so speed up the two robot drives 1.5-2x in editing if you run long.

| Judging criterion (25 % each) | Where the video shows it |
|---|---|
| **Technical depth & execution** ("does it actually work?") | One unbroken live take: a real phone, the real AI reading a real photo, Nav2 driving the simulated robot, the shelf light switching at 5 m, the live event log with every call and n8n decision. |
| **Innovation & impact** ("solves a real problem?") | The hook (customers who don't know what they need) and the closing line; the photo understood by the AI; the robot walking the customer to the exact bay. |
| **Design & user experience** | The phone: photo preview, "Looking at your photo...", "Here's what I see", items grouped as *Fixes it / Tools you'll need*, running total against the budget, one big button per screen. |
| **Demo** (problem, solution, working product) | Hook → live journey → 20 s "how it works" on the n8n canvas → impact line. |
| **n8n as the backbone** | The *Live events* list names n8n's decision nodes as they fire ("Relevant to home repair? → yes", "Budget known? → no", "Near or arrived? → near (5 m)"); the canvas segment points at the same nodes; Executions shows one run per step. |

## The scenario: a cracked deck board

Real items and prices from the store's database (the AI picks from the same catalogue; its list can differ a little from take to take):

| Item | Price | Where |
|---|---|---|
| WeatherShield 5/4 in. x 6 in. x 8 ft. Pressure-Treated Decking Board | $8.97 | Aisle 1, Bay 5 (Lumber & Decking) |
| Trex 1 in. x 6 in. x 8 ft. Composite Deck Board, Saddle (alternative) | $21.98 | Aisle 1, Bay 6 |
| Grip-Rite #9 x 2-1/2 in. Coated Exterior Deck Screws (1 lb.) | $9.97 | Aisle 3, Bay 3 (Fasteners) |
| Deckmate #9 x 3 in. Star-Drive Tan Deck Screws (1 lb.) (alternative) | $11.97 | Aisle 3, Bay 4 |
| Stanley 25 ft. PowerLock Tape Measure (tool) | $9.98 | Aisle 4, Bay 5 |
| 3M Clear Anti-Scratch Safety Glasses (tool) | $3.97 | Aisle 12, Bay 13 |
| Ryobi 13 Amp Corded 7-1/4 in. Circular Saw (tool) | $59.00 | Aisle 5, Bay 9 |

Pick the **decking board** and the **deck screws**: $18.94, "$31.06 left of your $50.00 budget". Both are near the front (aisles 1 and 3), so the robot drives are short.

## The script

### 0:00-0:20 Hook: the problem

- **On screen:** the studio view, kiosk idle ("Not sure what you need for your repair?"), robot on its dock in RViz.
- **Say:** "A board on your deck cracked. You walk into a store with tens of thousands of products, and you don't know what to buy, what size, or where it is. Staff are busy. Most people guess, or leave. This is Aisle Guide."

### 0:20-0:35 Scan the QR code

- **Tap** (mouse, on the studio's kiosk): **I'm here, I need help**. The QR code appears.
- **Phone:** scan it with the camera app, tap the link. The phone frame on screen switches to **Live from the customer's phone** (green label).
- **Say:** "I scan the kiosk with my own phone. No app to install."

### 0:35-1:05 The photo moment

- **Phone:** tap the **picture** icon under the text box (or the **camera** icon to take it live), choose the photo of the cracked board. The thumbnail shows "Photo added".
- **Type:** `One of the boards on my deck is cracked` → **Send**. (Or hold the phone near your mouth: microphone icon → speak → **Stop** → **Send**.)
- **On screen:** a scan line sweeps over the photo, "Looking at your photo...", then **Here's what I see:** the AI's one-sentence description of the photo, and the budget question.
- **Point at** *Live events*: `Relevant to home repair? → yes` · `Did the AI ask a question or pick items? → picked items` · `Budget known? → no`.
- **Say:** "Gemini looks at the photo. But n8n decides what happens: is this a home repair? Do we know the budget? No, so it asks before recommending anything."
- **Phone:** tap **About $50**.

### 1:05-1:30 The item list

- **On screen:** the photo with "Here's what I see" on top, then **Fixes it** (board, screws, each alternative indented under it), **Tools you'll need**. Each item says why it was chosen and its aisle and bay.
- **Phone:** tap **Add to route** on the decking board, then on the deck screws. The footer shows `$18.94` and the budget bar. Tap **Guide me to 2 items**.
- **Say:** "Only items this store actually stocks, within my budget, each with its aisle and bay. I add the two I need."

### 1:30-2:15 The robot walks me there

- **On screen:** RViz: the robot leaves the dock, the bold green route, aisle 1's signs turn orange, the bay is highlighted with the item's label, the green 5 m ring. The phone: "Follow the robot, Aisle 1 · Bay 5", a live "m to go" count.
- **Point at** the ring when the robot enters it: the shelf light pulses green in RViz, the phone says "The shelf light is on", *Live events* shows `Near or arrived? → near (5 m)`.
- On arrival: the phone turns green, "You've arrived", **I am done** → tap it. The robot leaves for aisle 3 (`More items left? → yes`). Tap **I am done** again at aisle 3.
- **Say:** "The robot guides me. Within five metres the shelf tag lights up, so I see the exact spot. n8n gets every robot event and decides the next step."

### 2:15-2:35 Wrap-up

- **Phone:** **No, I'm done for today**.
- **On screen:** "You're all set!": the two items, repair steps for this exact job, how-to videos. The robot drives back to its dock in RViz; the story strip ends at *Robot home*.
- **Say:** "And I leave with the steps to do the repair myself. The robot goes back to wait for the next customer."

### 2:35-2:55 How it works: the n8n canvas (20 s)

Cut to n8n (http://localhost:5678 → the workflow *Home Depot guide robot*), canvas zoomed to fit, then to the AI lane.

- **Point at, left to right:** the webhook and **Which call is this?** ("every tap on the phone and every robot event comes in here") → **Relevant to home repair?** ("the first AI only checks relevance") → **AI 2: understand the need** reading the catalogue ("the second picks items from this store's database") → **Budget known?** → **Send to robot / shelf tag** and **Near or arrived?** ("n8n drives the robot and the shelf lights") → **AI 3: repair steps and videos**.
- Optional 3 s: **Executions**: one run per step of the visit you just saw.
- **Say:** "n8n is the brain: every decision is a visible node, the AI and the robot are just tools it calls. A store can change a rule here without touching the robot or the app."

### 2:55-3:00 Closing line

- **Say:** "Aisle Guide turns 'I don't know what I need' into a short walk to the right shelf, with the right parts, within budget, and the repair steps in your pocket."

Optional if you have time (15 s, before the photo moment): type `tell me a joke` first. The phone says sorry and *Live events* shows `Relevant to home repair? → no`: the AI only handles home repair.

## Before recording (checklist)

1. **Start:** `./start.sh` (it remembers the https/LAN mode; the kiosk's QR code must start with `https://192.168.2.200:8443`). Then `./status.sh`: everything green.
2. **Reset before every take:** `./reset.sh -y`. It clears all visits and logs and restarts the robot at its dock (about a minute; wait for "Clean demo ready"). The open studio view goes back to the kiosk's start screen by itself and RViz reconnects; reload the page if anything looks stale.
3. **Phone, once:** on the same Wi-Fi as the computer, open `https://192.168.2.200:8443/demo/` and accept the certificate warning: iPhone Safari *Show Details → visit this website → Visit Website*; Android Chrome *Advanced → Proceed to 192.168.2.200 (unsafe)*. For voice notes, allow the microphone the first time it asks.
4. **The photo:** have a photo of a cracked deck board in the phone's library (a real one, or `test_photos/deck_board.jpg` sent to the phone), so the take never depends on the light in the room.
5. **Screens:** set the display to 1920 x 1080. Open the studio view http://localhost:8000/demo/?view=studio and press F11 (Mac: Control-Command-F). Check that RViz shows the store (not "Looking for RViz..."). In a second browser window, log in to n8n, open the workflow, *Zoom to fit*; keep the **Executions** tab ready.
6. **Quiet:** turn on Do Not Disturb on the computer (Ubuntu: Settings → Notifications; macOS: Control Centre → Focus) and on the phone (Focus / Do Not Disturb), close chat apps, set the phone's brightness up and auto-lock to 5 minutes or Never (the mirror needs the phone awake).
7. **AI quota:** the free Gemini key has a small quota. Do at most one dry run, then record.
8. **Screen recording at 1920 x 1080:**
   - **Ubuntu (GNOME):** Ctrl+Shift+Alt+R records the screen (saved in *Videos/Screencasts*). On GNOME 42 and later it opens the screenshot tool in video mode: choose *Screen*, press record, and stop with the red button in the top bar. Older GNOME stops after 30 s unless you first run `gsettings set org.gnome.settings-daemon.plugins.media-keys max-screencast-length 0`. The built-in recorder has no microphone: narrate in a second pass, or use OBS. For narration and better quality use **OBS Studio**: Settings → Video, base and output 1920x1080, 30 or 60 fps; source *Screen Capture (PipeWire)* on Wayland or *Screen Capture (XSHM)* on X11; add your microphone; record to MKV (remux to MP4 after).
   - **macOS:** Shift+Cmd+5 → *Record Entire Screen* (or *Record Selected Portion* around a 1920x1080 browser window) → Options → your microphone → Record. Stop from the menu-bar button.
   - Record the n8n canvas segment as a separate short clip and cut it in; that is easier than switching windows mid-take.

## If something goes wrong mid-take

| What you see | What to do |
|---|---|
| The phone says **The AI is busy for a moment** and the message is marked *Not sent* | Tap **Try again** under the message: it resends it as it was, photo included. Keep talking ("the AI is taking a second look"). Cut the wait in editing. |
| "Looking at your photo..." takes more than 20 s | Wait: n8n retries and falls back to another model by itself. If the phone then shows **Try again**, tap it. |
| The phone frame on screen stopped mirroring (no green label) | The phone slept or switched apps for more than 10 s. Wake it and open the page again: the mirror comes back within 3 s. |
| The robot does not leave the dock after **Guide me** | `./status.sh`. If Nav2 is still starting, wait 30 s. Otherwise stop the take, `./reset.sh -y`, start over. |
| RViz shows "Connecting to RViz..." or is black | It reconnects by itself. For the rest of the take, switch the studio's robot panel to **Map** (top right of panel 3): the web map shows the same robot and light. |
| The phone says **This visit link is no longer active** | You reset after scanning. Press the help button on the kiosk again and scan the new QR code. |
| Ticked the wrong item | Tap it again to remove it before **Guide me**, or **Ask for something different** for a new list. |
| The AI answered something odd | Keep going if it still makes sense; otherwise `./reset.sh -y` and retake. A take costs about 3 minutes and a handful of AI calls. |
| Nothing works at all | `./stop.sh`, `./start.sh`, `./status.sh`. |
