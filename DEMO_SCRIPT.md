# Aisle Guide: the 3-minute demo recording

One take of the live journey on the **studio view** (kiosk, the customer's real phone mirrored live, RViz's top view, the robot's status and n8n's decisions), plus a short cut to the **n8n canvas**. Times are targets for the finished video; the live part runs about 2:30 in real time (the robot drives at walking pace), so speed up the two robot drives 1.5-2x in editing if you run long.

| Judging criterion (25 % each) | Where the video shows it |
|---|---|
| **Technical depth & execution** ("does it actually work?") | One unbroken live take: a real phone, the real AI reading a real photo, Nav2 driving the simulated robot, the shelf light switching at 5 m, the live event log with every call and n8n decision. |
| **Innovation & impact** ("solves a real problem?") | The hook (customers who don't know what they need) and the closing line; the photo understood by the AI; the robot walking the customer to the exact bay. |
| **Design & user experience** | The phone: "Take a photo of the problem", "Looking at your photo...", "Here's what I see" with the photo, compact item rows where an item and its alternative are one choice, running total against the budget, the green shelf-light card, one big button per screen. |
| **Demo** (problem, solution, working product) | Real-footage hook with one sourced number → live journey with a picture-in-picture of the real phone → 25 s "how n8n decides" (one opened execution, two zoomed canvas shots) → impact line. |
| **n8n as the backbone** | The *Live events* list shows the decisions n8n reports for each run (its `trace`: "Relevant to home repair? → yes", "Budget known? → no", "Near or arrived? → near"), each with **Execution N · Open in n8n**; the n8n segment opens that same execution, where n8n paints the path the run took. Say once that n8n falls back from Gemini to Claude by itself. |

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
- **Caption over the footage (one sourced number):** `[[STATISTIC: one number about shoppers who can't find an item, or can't find staff to ask, in a home-improvement or big-box store. Put the source (publisher, year) in small type under it. DO NOT RECORD WITH THIS PLACEHOLDER: if no reliable source is found, drop the caption and say the line below without a number.]]`
- **Cut to** the studio view: kiosk idle ("Not sure what you need for your repair?"), the idle phone showing a dimmed "What are you fixing today?" with "Waiting for a customer", the robot on its dock in RViz.
- **Say:** "A board on your deck cracked. The store has tens of thousands of products, and you don't know what to buy, what size, or where it is. Staff are busy. This is Aisle Guide."

### 0:20-0:35 Scan the QR code

- **Tap** (mouse, on the studio's kiosk): **I'm here, I need help**. The QR code appears (the studio view never prints the link's address).
- **Phone:** scan it with the camera app, tap the link. The phone frame on screen switches to **Live from the customer's phone** (green label) and the kiosk changes to **Customer connected: Robot ready**, then narrows to make room.
- **Picture-in-picture (6-8 s, see "Editing" below):** the real phone in a hand as it scans.
- **Say:** "I scan the kiosk with my own phone. No app to install."

### 0:35-1:05 The photo moment

- **Phone:** tap the big **Take a photo of the problem** button (or **or choose one from your photos**), take or pick the photo of the cracked board. It shows "Photo added".
- **Type:** `One of the boards on my deck is cracked` → **Send**. (Or the microphone icon → speak → **Stop** → **Send**.)
- **Picture-in-picture:** the real phone during the photo and the Send tap.
- **On screen:** a scan line sweeps over the photo, "Looking at your photo...", then the answer lands with its start at the top: the photo, **Here's what I see:** the AI's one sentence about the photo, and the budget question. The amounts **About $25 / About $50 / About $100 / No fixed budget** sit just above the message box, on the phone and on the mirror.
- **Point at** *Live events*: n8n's own decisions for that run, e.g. `Relevant to home repair? → yes` · `Budget known? → no`, and **Execution N · Open in n8n**.
- **Say:** "The AI looks at the photo, but n8n decides what happens: is this a home repair? Do we know the budget? No, so it asks before recommending anything. And if Gemini is busy, n8n falls back to Claude by itself."
- **Phone:** tap **About $50**.

### 1:05-1:30 The item list

- **On screen:** "Seen: …" in one line at the top, **Here's what you need**, then one compact row per item: a department tile, the name, why it was chosen, "Aisle 1 · Bay 5" and a tier ("Budget pick", "Best value", "Pro grade"). The alternative is folded under its item ("1 alternative · $21.98"); tools come last under **Tools for the job**.
- **Phone:** tap the **decking board** row (it shows **1st stop**), then the **deck screws** row (**2nd stop**). The footer shows `$18.94` and "$31.06 left of your $50.00 budget". Tap **Guide me to 2 items**.
- **Say:** "Only items this store stocks, within my budget, each with its aisle and bay. An item and its alternative are one choice, so I can't end up buying both boards."

### 1:30-2:15 The robot walks me there

- **On screen:** RViz: the robot (a big green disc with a white arrow) leaves the dock on the green route, aisle 1's number turns orange, the bay is highlighted, and a label outside the green 5 m ring says **Decking board / A1 · B5**. The phone: "Follow the robot, Aisle 1 · Bay 5", and "14 m to go" counting down inside the card.
- **Point at** the ring when the robot enters it: the shelf light pulses green in RViz; on the phone the card turns green and glows, the shelf tag lights up, "Look for the green light · Bay 5" (an Android phone also buzzes once); *Live events* shows n8n's `Near or arrived? → near`.
- **Editing:** zoom in 3 s on the RViz ring and the phone's green card side by side (see below).
- On arrival: "You've arrived" with a check, **I am done** → tap it (picture-in-picture: the real tap). The robot leaves for aisle 3 (`More items left? → yes`). Tap **I am done** again at aisle 3.
- **Say:** "The robot guides me. Within five metres the shelf tag lights up, so I see the exact spot. n8n gets every robot event and decides the next step."

### 2:15-2:35 Wrap-up

- **Phone:** **No, I'm done for today**.
- **On screen:** "You're all set!": the two items with their prices, "2 items · $18.94 · pay at any register", repair steps for this exact job, and "Search YouTube: …" links for how-to videos. All four steps in the phone's header bar are green. The robot drives back to its dock in RViz; the story strip ends at *Robot home*.
- **Say:** "And I leave with the steps to do the repair myself. The robot goes back to wait for the next customer."

### 2:35-2:55 How n8n decides: one execution, two zoomed shots (20-25 s)

Record these three short clips separately, right after the take, and cut them in (see the checklist for the window setup). Node names below are the ones on the canvas at the time of writing: check them against the chips in *Live events* before you record, and use whatever the canvas says.

1. **The opened execution (8-10 s).** In the studio's *Live events*, click **Execution N · Open in n8n** on the entry of the photo request (the one with `Relevant to home repair? → yes`). n8n opens that run: the path it took is painted green and the branches it did not take stay grey. Press `1` (zoom to fit) once, then hover over **Relevant to home repair?** and click it to show its input and output for 2 s; close it.
   - **Say:** "This is the run you just watched: n8n paints the path it took."
2. **Zoomed shot A, the AI lane (6 s).** In the workflow editor (not the execution), press `0` (zoom to 100 %), then scroll (vertical) and Shift+scroll (horizontal) until **Relevant to home repair?** is at the left third of the window and **AI 2: understand the need** and **Budget known?** are in view to its right. Node titles must be readable at full size: if they are not, Ctrl+scroll (Mac: Cmd+scroll) with the pointer over **Budget known?** until the titles are about as tall as the browser's address-bar text. Do not move during the clip; let the cursor rest on **Budget known?**.
   - **Say:** "The first AI only checks relevance. The second reads the photo and picks from this store's catalogue. n8n holds the items until it knows the budget."
3. **Zoomed shot B, the robot lane (6 s).** Same zoom. Scroll to the robot events: **Near or arrived?** in the middle of the window, with the nodes that switch the shelf tag on and tell the phone to its right. Rest the cursor on **Near or arrived?**.
   - **Say:** "Every robot event comes back here. Near: light the shelf tag. Arrived: show 'I am done'. n8n is the brain; the AI and the robot are tools it calls."

If your recorder adds a cursor highlight (OBS: a cursor-highlight plugin; macOS: *Show mouse clicks* in Shift+Cmd+5 Options), turn it on for these clips.

### 2:55-3:00 Closing line

- **Say:** "Aisle Guide turns 'I don't know what I need' into a short walk to the right shelf, with the right parts, within budget, and the repair steps in your pocket."

Optional if you have time (8-15 s, before the photo moment): type `tell me a joke` first. The phone says sorry and offers the examples again; *Live events* shows `Relevant to home repair? → no`. It is the clearest example of n8n gating the AI.

## Editing

- **Picture-in-picture of the real phone (the biggest credibility gain):** record the phone itself at the same time (the phone's own screen recording, or a second camera over your shoulder on the hand and phone). Put it in a corner (about a quarter of the frame height, bottom right over the kiosk column) for 6-8 s at: the QR scan, the photo + Send, and one **I am done** tap. Sync it on the Send tap.
- **Zoom 1.5x for 3 s** on the mirrored phone when "Here's what I see" lands.
- **Shelf-light moment:** for 3 s, show the RViz ring (cropped around the robot and the lit bay) and the phone's green card side by side, both zoomed about 1.5x.
- **Speed up** the two robot drives 1.5-2x if the take runs long; never speed up the phone screens.

## Before recording (checklist)

1. **Start:** `./start.sh` (it remembers the https/LAN mode; the kiosk's QR code must start with `https://192.168.2.200:8443`). Then `./status.sh`: everything green.
2. **Reset before every take:** `./reset.sh -y`. It clears all visits and logs and restarts the robot at its dock (about a minute; wait for "Clean demo ready"). The open studio view goes back to the kiosk's start screen by itself and RViz reconnects; reload the page if anything looks stale.
3. **Phone, once:** on the same Wi-Fi as the computer, open `https://192.168.2.200:8443/demo/` and accept the certificate warning: iPhone Safari *Show Details → visit this website → Visit Website*; Android Chrome *Advanced → Proceed to 192.168.2.200 (unsafe)*. For voice notes, allow the microphone the first time it asks.
4. **The photo:** have a photo of a cracked deck board in the phone's library (a real one, or `test_photos/deck_board.jpg` sent to the phone), so the take never depends on the light in the room.
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
