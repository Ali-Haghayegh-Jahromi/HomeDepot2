# Aisle Guide: the 3-minute demo recording

One take of the live journey on the **studio view** (kiosk, the customer's real phone mirrored live, RViz's top view, the robot's status and n8n's decisions), plus a short cut to the **n8n canvas**. Times are targets for the finished video; the live part runs about 2:30 in real time (the robot drives at walking pace), so speed up the two robot drives 1.5-2x in editing if you run long.

| Judging criterion (25 % each) | Where the video shows it |
|---|---|
| **Technical depth & execution** ("does it actually work?") | One unbroken live take: a real phone, the real AI reading a real photo, Nav2 driving the simulated robot, the shelf light switching at 5 m, the live event log with every call and n8n decision. |
| **Innovation & impact** ("solves a real problem?") | The hook (customers who don't know what they need) and the closing line; the photo understood by the AI; the robot walking the customer to the exact bay. |
| **Design & user experience** | The phone: "Take a photo of the problem", "Looking at your photo...", "Here's what I see" with the photo, compact item rows where an item and its alternative are one choice, running total against the budget, the green shelf-light card, one big button per screen. |
| **Demo** (problem, solution, working product) | Real-footage hook with one sourced number → live journey with a picture-in-picture of the real phone → 25 s "how n8n decides" (one opened execution in n8n's Logs panel, three canvas shots at 100 % zoom) → impact line. |
| **n8n as the backbone** | *Live events* shows the business decisions n8n reports for each run (its `trace`) as chips, "Relevant to home repair? → yes", "Budget known? → no", "Near or arrived? → near (5 m)", with the run's guard checks folded into one "✓ 12 checks passed" chip, and **Execution N · Open in n8n**; the n8n segment opens that same execution. The off-topic test ("tell me a joke" → `Relevant to home repair? → no`) shows n8n gating the AI. Say once that n8n switches to another AI model by itself when one is busy. |

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

Pick the **decking board** and the **deck screws**: $18.94, "$31.06 left of your $50.00 budget". Both are near the front (aisles 1 and 3), so the robot drives are short. The Trex board is folded under the decking board ("1 alternative · $21.98"): it is one choice with it, so tapping it would swap the boards, never add both.

## The script

### 0:00-0:20 Hook: the problem

- **On screen (real footage, 5 s, shot beforehand):** a close-up of a cracked deck board, then a person standing in a long store aisle, looking up and down the shelves.
- **Caption over the footage (one sourced number):** **"78% of shoppers have left a store without buying anything in the past six months because of rush-related problems like long lines or a lack of help."** Small type under it: *Logile 2026 Peak Hour Penalty Report: survey of 750 U.S. shoppers, October 2026.* (It covers everyday retail, not home improvement only: say "shoppers", not "Home Depot customers".)
- **Cut to** the studio view: kiosk idle ("Not sure what you need for your repair?"), the idle phone showing a dimmed "What are you fixing today?" with "Waiting for a customer", the robot on its dock in RViz.
- **Say:** "A board on your deck cracked. The store has tens of thousands of products, and you don't know what to buy, what size, or where it is. Staff are busy. This is Aisle Guide."

### 0:20-0:35 Scan the QR code

- **Tap** (mouse, on the studio's kiosk): **I'm here, I need help**. The QR code appears (the studio view never prints the link's address).
- **Phone:** scan it with the camera app, tap the link. The phone frame on screen switches to **Live from the customer's phone** (green label); the kiosk column folds away and RViz grows into its place (the kiosk comes back at the end of the visit).
- **Picture-in-picture (6-8 s, see "Editing" below):** the real phone in a hand as it scans.
- **Say:** "I scan the kiosk with my own phone. No app to install."

### 0:35-0:43 The off-topic test (required, 8 s)

- **Type:** `tell me a joke` → **Send**.
- **On screen:** after about 3 s the phone answers that it only helps with home repairs and offers the examples again; *Live events* shows `Relevant to home repair? → no` and **Execution N · Open in n8n**.
- **Say:** "Off-topic? n8n stops it before anything is recommended."
- It costs one small AI call, and it is the single clearest proof that n8n, not the AI, decides what happens. Do not skip it.

### 0:43-1:05 The photo moment

- **Phone:** tap the big **Take a photo of the problem** button (or **or choose one from your photos**), take or pick the photo of the cracked board. It shows "Photo added".
- **Type:** `One of the boards on my deck is cracked` → **Send**. (Or the microphone icon → speak → **Stop** → **Send**.)
- **Picture-in-picture:** the real phone during the photo and the Send tap.
- **On screen:** a scan line sweeps over the photo, "Looking at your photo...", then the answer lands with its start at the top: the photo, **Here's what I see:** the AI's one sentence about the photo, and the budget question. The amounts **About $25 / About $50 / About $100 / No fixed budget** sit just above the message box, on the phone and on the mirror.
- **Point at** *Live events*: n8n's own decisions for that run, `Relevant to home repair? → yes` · `Did AI 2 ask a question or pick items? → picked items` · `Budget known? → no`, the muted "✓ 12 checks passed" chip (hover it for the list), and **Execution N · Open in n8n**.
- **Say:** "The AI looks at the photo, but n8n decides what happens: is this a home repair? Do we know the budget? No, so it asks before recommending anything. And if one AI model is busy, n8n tries the next one by itself."
  - Only if a Claude key is set (`./status.sh` then says the backup AI has a Claude key; at the time of writing none is set) may you add "...and falls back to Claude". Without a key, do not mention Claude.
- **Phone:** tap **About $50**.

### 1:05-1:30 The item list

- **On screen:** "Seen: …" in one line at the top, **Here's what you need** and one line under it: "Parts **$18.94**, well inside your $50 budget." Then one compact row per item: a department tile, a short name (**Decking board**, **Exterior deck screws**) with the brand and sizes on the line below, why it was chosen, and "Aisle 1 · Bay 5". A tier badge appears only on an item that differs from the rest (e.g. "Pro grade" on the composite board). The alternative is folded under its item ("1 alternative · $21.98"); the tools are folded into one row, **Tools you might need · 4 · skip any you own** (their total shows only when it is opened).
- **Phone:** tap the **decking board** row (it shows **1st stop**), then the **deck screws** row (**2nd stop**). The footer shows `$18.94` and "$31.06 left of your $50.00 budget". Tap **Guide me to 2 items**.
- **Say:** "Only items this store stocks, within my budget, each with its aisle and bay. An item and its alternative are one choice, so I can't end up buying both boards. The tools are optional: most people own a hammer."

### 1:30-2:15 The robot walks me there

- **On screen:** RViz: the robot (a big green disc with a white arrow) leaves the dock on the green route, aisle 1's number turns orange, the bay is highlighted, and a label outside the green 5 m ring says **Decking board / A1 · B5**. The phone: "Follow the robot, Aisle 1 · Bay 5", and "14 m to go" counting down inside the card.
- **Point at** the ring when the robot enters it: the shelf light pulses green in RViz; on the phone the card turns green and glows, the shelf tag lights up, "Look for the green light · Bay 5" (an Android phone also buzzes once); *Live events* shows n8n's `Near or arrived? → near`.
- **Editing:** zoom in 3 s on the RViz ring and the phone's green card side by side (see below).
- On arrival: "You've arrived" with a check, **I am done** → tap it (picture-in-picture: the real tap). The robot leaves for aisle 3 (`More items left? → yes`). Tap **I am done** again at aisle 3.
- **Say:** "The robot guides me. Within five metres the shelf tag lights up, so I see the exact spot. n8n gets every robot event and decides the next step."
- **Say (the answer to "why a robot, not a map on the phone?"):** "A map gets you to the aisle. The robot walks you to the exact bay and lights the tag, it works for anyone who can't read a store map, and no associate has to leave their post."

### 2:15-2:35 Wrap-up

- **Phone:** **No, show my repair steps** (the orange button).
- **On screen:** "You're all set!": the two items with their prices, "2 items · $18.94 · pay at any register", repair steps for this exact job, and "Search YouTube: …" links for how-to videos. All four steps in the phone's header bar are green. The kiosk comes back with **Thanks! The robot is heading back to its dock** while the robot drives home in RViz (about 18 s). When it docks, the studio holds **Visit complete** for 30 s (every step of the story strip green, "Visit complete · robot back on its dock"), then resets to the idle kiosk. Say the closing line over that held picture.
- **Say:** "And I leave with the steps to do the repair myself. The robot goes back to wait for the next customer."

### 2:35-2:55 How n8n decides: one execution, three shots at 100 % (20-25 s)

Record these short clips separately, right after the take, and cut them in (n8n 2.47 in a full-screen browser window at 1920 x 1080, logged in; see the checklist). At "zoom to fit" the canvas is a map, not something to read, so every canvas shot here is at **100 %**. Node names are the ones on the canvas at the time of writing: check them against the chips in *Live events* before you record.

1. **The opened execution, in the Logs panel (8-10 s).** In the studio's *Live events*, click **Execution N · Open in n8n** on the entry of the photo request (the one with `Relevant to home repair? → yes`). n8n opens that run on its **Executions** tab, the canvas at zoom to fit with the path the run took painted green.
   - Click **Logs** in the bar along the bottom of the canvas. The panel opens in the lower third: on its left, every node the run went through, in order, at a readable size. It opens scrolled to the end (**Repair steps to write?**).
   - With the pointer over that list, scroll **up** (about 10 wheel notches) until **Relevant to home repair?** shows, between **Did AI 1 answer?** and **Read the item catalogue**, and click it. The right side shows **Relevant to home repair? · Success in 1ms**, **OUTPUT** with the tab **True Branch (1 item)** selected, and the run's data: `provider: gemini`, the model that answered, `duration_ms`, `relevant: true`. Hold 3 s with the pointer resting on **True Branch (1 item)**.
   - **Say:** "This is the run you just watched. n8n logs every node it went through: here it decided that the photo is a home repair, and it shows which AI model answered and how fast."
2. **Shot A, the first half of the AI lane (5 s).** Switch to the **Editor** tab. If the Logs panel is open there too, close it (the chevron at its top right). Click an empty spot of the canvas and press `0` (zoom to 100 %). Scroll (Shift+scroll sideways, or swipe with two fingers) until **Write the relevancy prompt** is at the left edge of the window, with the row **AI 1: relevancy check → Did AI 1 answer? → Relevant to home repair? → Read the item catalogue → Write the main prompt → AI 2: understand the need → Did AI 2 answer?** across the middle and **Say sorry** above **Read the item catalogue** (the view's top-left at about canvas (2600, −350)). Rest the pointer on **Relevant to home repair?**.
   - **Say:** "The first AI only checks relevance; anything off-topic goes to 'Say sorry'. The second reads the photo and picks from this store's catalogue."
3. **Shot B, the second half of the AI lane (5 s).** Same zoom. Scroll right until **Did AI 2 ask a question or pick items?** is at the left, with **Budget known? → Main items within the budget? → Room for the tools too?** across the middle and **Ask the follow-up question / Show the item list / Ask for the budget** on the right (top-left about (4450, −350)). Rest the pointer on **Budget known?**.
   - **Say:** "n8n holds the items until it knows the budget, then checks the parts against it."
4. **Shot C, the robot lane (6 s).** Same zoom. Scroll down into the green lane **4 Robot events**: **Read the robot event → Is this event for the item being fetched? → Near or arrived? → Phone still guiding to it?**, with **Turn the shelf light on** and **Show 'You have arrived'** on the right (top-left about (4790, 620)). Rest the pointer on **Near or arrived?**.
   - **Say:** "Every robot event comes back here. Near: light the shelf tag. Arrived: show 'I am done'. n8n is the brain; the AI and the robot are tools it calls."

If your recorder adds a cursor highlight (OBS: a cursor-highlight plugin; macOS: *Show mouse clicks* in Shift+Cmd+5 Options), turn it on for these clips.

### 2:55-3:00 Closing line

- **Say:** "Aisle Guide turns 'I don't know what I need' into a short walk to the right shelf, with the right parts, within budget, and the repair steps in your pocket."


## Editing

- **Picture-in-picture of the real phone (the biggest credibility gain):** record the phone itself at the same time (the phone's own screen recording, or a second camera over your shoulder on the hand and phone). Put it in a corner (about a quarter of the frame height, bottom right over the kiosk column) for 6-8 s at: the QR scan, the photo + Send, and one **I am done** tap. Sync it on the Send tap.
- **Zoom 1.5x for 3 s** on the mirrored phone when "Here's what I see" lands.
- **Shelf-light moment:** for 3 s, show the RViz ring (cropped around the robot and the lit bay) and the phone's green card side by side, both zoomed about 1.5x.
- **Speed up** the two robot drives 1.5-2x if the take runs long; never speed up the phone screens.

## Before recording (checklist)

1. **Start:** `./start.sh` (it remembers the https/LAN mode; the kiosk's QR code must start with the address start.sh prints: `https://<this computer's address>:8443`). Then `./status.sh`: everything green.
2. **Reset before every take:** `./reset.sh -y`. It clears all visits and logs and restarts the robot at its dock (about a minute; wait for "Clean demo ready"). The open studio view goes back to the kiosk's start screen by itself and RViz reconnects; reload the page if anything looks stale.
3. **Phone, once:** on the same Wi-Fi as the computer, open the address start.sh prints followed by `/demo/` (`https://<this computer's address>:8443/demo/`) and accept the certificate warning: iPhone Safari *Show Details → visit this website → Visit Website*; Android Chrome *Advanced → Proceed to <this computer's address> (unsafe)*. For voice notes, allow the microphone the first time it asks.
4. **The photo:** have a photo of a cracked deck board in the phone's library (best your own photo of a real broken item; otherwise the sample [samples/deck_board.jpg](samples/deck_board.jpg) sent to the phone), so the take never depends on the light in the room.
5. **Screens:** set the display to 1920 x 1080 (a 1440- or 1512-wide laptop screen works too: the story strip then drops its one-line descriptions). Open the stage http://localhost:8000/demo/ and check that all three status pills are green (n8n workflow, Robot service, Nav2); then open the studio view http://localhost:8000/demo/?view=studio and press F11 (Mac: Control-Command-F). Check that RViz shows the store (not "Looking for RViz..."). In a second browser window, log in to n8n and open the workflow; the execution clip opens from the studio's *Live events* link (n8n must be logged in in the same browser).
   - To start over mid-session without `./reset.sh`, use the small ↻ button at the top right of the studio view: it asks before starting a new visit.
6. **Quiet:** turn on Do Not Disturb on the computer (Ubuntu: Settings → Notifications; macOS: Control Centre → Focus) and on the phone (Focus / Do Not Disturb), close chat apps, set the phone's brightness up and auto-lock to 5 minutes or Never (the mirror needs the phone awake).
7. **AI quota:** the free Gemini key has a small quota. Do at most one dry run, then record.
8. **Screen recording at 1920 x 1080:**
   - **Ubuntu (GNOME):** Ctrl+Shift+Alt+R records the screen (saved in *Videos/Screencasts*). On GNOME 42 and later it opens the screenshot tool in video mode: choose *Screen*, press record, and stop with the red button in the top bar. Older GNOME stops after 30 s unless you first run `gsettings set org.gnome.settings-daemon.plugins.media-keys max-screencast-length 0`. The built-in recorder has no microphone: narrate in a second pass, or use OBS. For narration and better quality use **OBS Studio**: Settings → Video, base and output 1920x1080, 30 or 60 fps; source *Screen Capture (PipeWire)* on Wayland or *Screen Capture (XSHM)* on X11; add your microphone; record to MKV (remux to MP4 after).
   - **macOS:** Shift+Cmd+5 → *Record Entire Screen* (or *Record Selected Portion* around a 1920x1080 browser window) → Options → your microphone → Record. Stop from the menu-bar button.
   - Record the n8n canvas segment as a separate short clip and cut it in; that is easier than switching windows mid-take.

## If something goes wrong mid-take

| What you see | What to do |
|---|---|
| The phone says **The AI was busy · Sending your message again in 3 s…** | Wait: it resends once by itself, photo included. If it then says **The AI is still busy**, tap **Try again** under the message. Keep talking ("the AI is taking a second look"). Cut the wait in editing. |
| "Looking at your photo..." takes more than 20 s | Wait: n8n retries and falls back to another model by itself. If the phone then shows **Try again**, tap it. |
| The phone frame on screen stopped mirroring (no green label) | The phone slept or switched apps for more than 10 s. Wake it and open the page again: the mirror comes back within 3 s. |
| The robot does not leave the dock after **Guide me** | `./status.sh`. If Nav2 is still starting, wait 30 s. Otherwise stop the take, `./reset.sh -y`, start over. |
| RViz shows "Connecting to RViz..." or is black | It reconnects by itself. For the rest of the take, switch the studio's robot panel to **Map** (top right of panel 3): the web map shows the same robot and light. |
| The phone says **This visit link is no longer active** | You reset after scanning. Press the help button on the kiosk again and scan the new QR code. |
| Added the wrong item | Tap its row again to take it off before **Guide me** (an alternative swaps with its item by itself), or **Ask for something different** for a new list. |
| The AI answered something odd | Keep going if it still makes sense; otherwise `./reset.sh -y` and retake. A take costs about 3 minutes and a handful of AI calls. |
| Nothing works at all | `./stop.sh`, `./start.sh`, `./status.sh`. |
