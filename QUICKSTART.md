# Aisle Guide demo: quick start

A customer tells a store kiosk what they want to repair, gets a list of items on their phone, and a robot walks them to each shelf. Everything runs on your own computer; the robot is a simulation.

This page is all you need to run and show the demo. Technical details are in [README.md](README.md).

## 0. Get the demo folder (once)

The demo lives on GitHub: https://github.com/Ali-Haghayegh-Jahromi/HomeDepot. It is **private**, so you need a GitHub account that the owner has given access to (ask them; then sign in to GitHub in your browser).

**The easy way (Ubuntu and Mac):**

1. Open https://github.com/Ali-Haghayegh-Jahromi/HomeDepot in your browser (signed in).
2. Press the green **Code** button, then **Download ZIP**.
3. Unzip it somewhere simple, for example on your **Desktop**: on a Mac double-click the ZIP in Downloads and drag the new folder to the Desktop; on Ubuntu right-click the ZIP → **Extract Here**, then move the folder to the Desktop.
4. That folder (named something like `HomeDepot-main`) is "the demo folder" in the rest of this page. Keep it in your home folder (Desktop, Documents, ...), not on an external drive or a network drive.

**Or with git** (if you use it): `git clone https://github.com/Ali-Haghayegh-Jahromi/HomeDepot.git` (GitHub asks you to sign in), then `cd HomeDepot`.

**Opening a terminal in the demo folder** (a few steps below need one):

- **Ubuntu:** open the folder in the Files app, right-click an empty spot → **Open in Terminal**.
- **Mac:** open **Terminal** (Applications → Utilities), type `cd ` (with a space at the end), drag the demo folder from Finder into the Terminal window, and press Enter.

## 1. Install Docker (once)

Docker is the only program the demo needs. Your computer needs about 8 GB of memory and 10 GB of free disk space.

**Mac:**

1. Download [Docker Desktop](https://www.docker.com/products/docker-desktop/). Pick the right one for your Mac: Apple menu → **About This Mac** says **Chip: Apple M1/M2/M3/...** (download *Apple Silicon* / *Apple chip*) or **Processor: Intel** (download *Intel chip*).
2. Open the downloaded file and drag **Docker** into **Applications**.
3. Open Docker from Applications once, accept its terms (no sign-in needed: you may skip it), and wait until the whale icon in the menu bar at the top stops moving.

**Ubuntu:** open a terminal (Ctrl+Alt+T) and run these lines one by one (they ask for your password; nothing is shown while you type it):

```bash
sudo apt update && sudo apt install -y curl
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

Then **log out and log back in** (or restart the computer), so you may use Docker without `sudo`. Check it with `docker run --rm hello-world`: it prints "Hello from Docker!". (Prefer a window app? [Docker Desktop for Ubuntu](https://docs.docker.com/desktop/setup/install/linux/ubuntu/) works too; use one or the other, not both.)

## 2. Start the demo

- **Mac:** double-click **Start Demo.command** in the demo folder.
- **Ubuntu:** open a terminal in the demo folder (section 0) and run `./start.sh`

(If the computer answers "Permission denied", run `bash ./start.sh` instead; the same goes for the other scripts.)

The first start asks for a **Gemini API key** (the AI). Get one free at https://aistudio.google.com/apikey: sign in with a Google account, press *Create API key*, copy it and paste it into the window (you will not see it while you paste), then press Enter. No key? Just press Enter: the demo then uses a simple stand-in AI that needs no internet but understands only a few jobs (decks, toilets, holes in walls, leaking faucets, painting, hanging things). You can add or change the key later with `./start.sh key`.

If you gave a Gemini key, it then asks once for an **optional Anthropic key** (Claude, a backup AI, used only together with Gemini; not asked when you skipped the Gemini key). A free Gemini key can run out of quota during a busy day; the demo then tries Google's other free models by itself, and with an Anthropic key it switches to Claude instead of asking the customer to try again. Get one at https://console.anthropic.com/settings/keys (paid per use: a demo costs a few cents), paste it the same way, or press Enter to skip. Add it later with `./start.sh claude-key`.

**The first start takes 10 to 20 minutes** (it downloads about 2 GB and builds the robot). After that, starting takes about a minute. When it is ready, your browser opens the demo by itself and the window shows:

```
The demo is running.
  Demo stage (kiosk + phone + store map):  http://localhost:8000/demo/
  Studio view, for recording (1920x1080): http://localhost:8000/demo/?view=studio
  Robot view (RViz):                       http://localhost:6080
  n8n, to show the workflow:               http://localhost:5678
      login: demo@aisleguide.local   password: ...
```

You may close that window; the demo keeps running.

## 3. What you will see

- **Demo stage** (http://localhost:8000/demo/): the store kiosk, a phone, and a live map of the store with the robot.
- **Robot view** (http://localhost:6080): RViz, the robot's own view of the store. It shows the **top view** by default: the whole store seen from above, with the robot and its planned route. Put it next to the demo stage. (For a 3D store instead: in `.env` set `HD_RVIZ_VIEW=3d` and start again; then drag to turn the view, scroll to zoom.)
- **n8n** (http://localhost:5678): the workflow behind it all. Log in with the email and password shown when the demo started (they are also in the file `.env`). n8n lists four workflows: open the one named **Home Depot guide robot** (the other three are its helpers), then **Executions**: every step of a visit is one run you can click through.

## 4. Give the demo

1. On the kiosk press **I'm here, I need help**. The QR code appears and the phone opens.
2. On the phone, first type something unrelated ("tell me a joke") to show that the AI refuses it. Then a real problem: "one of the boards on my deck is cracked", best with a photo (the big **Take a photo of the problem** button, or the camera and picture buttons under the text box): the phone shows what the AI sees in it. A sample photo is in the demo folder, `samples/deck_board.jpg`: it is a placeholder for testing only (a deck with some new boards, no visible damage). **Before recording, photograph a real cracked or split deck board (or another real broken item), and do one dry run with that photo and no text** to check that "Here's what I see" names the damage.
3. Answer the follow-up questions. Tap **Add** on the items you want, in the order you want to collect them, and press **Guide me**. (If the AI is busy for a moment, the message shows **Try again**: one tap sends it again, photo included.)
4. Watch the robot leave its dock on the map and in the robot view (RViz). The shelf light turns on when the robot is 5 m away; **I am done** appears when it arrives.
5. After the last item, answer **No** to get repair steps and videos; the robot drives back to its dock.

Between two audiences, `./reset.sh` clears all earlier visits and sends the robot back to its dock (your API key and login stay). It asks first: type `y` and press Enter (`./reset.sh -y` skips the question).

## 5. Use a real phone (same Wi-Fi)

Visitors can scan the QR code with their own phone. The computer and the phone must be on the same Wi-Fi.

1. Start the demo with `./start.sh lan` (Mac: in Terminal, in the demo folder). It remembers this: later a plain `./start.sh` (or Start Demo.command) keeps it on. Back to this computer only: `./start.sh local`.
2. Press the help button on the kiosk and scan the QR code with the phone's camera. The phone opens the visit; typing, ticking items and **photos** (camera or photo library) all work.
3. The demo stage's phone frame now shows **exactly what the visitor's phone shows**, live, with a green "Live from the customer's phone" label, so the audience can follow along. If the phone is put away for more than 10 seconds, the frame goes back to its own phone, which you can use as before.

**Voice notes on the phone** need a secure (https) connection. Start with `./start.sh https` instead. The QR code then starts with `https://`. The first time, each phone warns that the connection is not private, because the demo makes its own certificate. This is expected; on that phone, once:

- **iPhone (Safari):** tap **Show Details**, then **visit this website**, then **Visit Website** (and enter the phone's code if asked).
- **Android (Chrome):** tap **Advanced**, then **Proceed to 192.168.x.x (unsafe)**.

After that the page opens normally, and the phone asks once for permission to use the microphone: tap **Allow**.

**The phone cannot open the page?** Run `./status.sh`. It checks whether a firewall on this computer could block phones and prints the exact command to fix it (on Ubuntu something like `sudo ufw allow from 192.168.2.0/24 to any port 8000 proto tcp`; on a Mac it tells you what to click). Some Wi-Fi networks (guest networks, hotels, some phone hotspots) do not let devices see each other at all: use another Wi-Fi then. Anyone on the same Wi-Fi can open the demo pages while this is on, so use it on a network you trust.

## 6. Record the demo

Open the **studio view**: http://localhost:8000/demo/?view=studio (or the **Studio view** button at the top of the demo stage). It is made for a 1920 x 1080 screen recording: kiosk, the customer's phone (mirrored live from a real phone), the robot's live view from RViz, the robot's status and every step as it happens, under the story strip. Make the browser window full screen (F11 on Ubuntu, Control-Command-F on a Mac) and record the screen. The list of live events shows which decision n8n took at each step. A full plan for a 3-minute recording (what to tap, what to say, a checklist, what to do if something goes wrong) is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md). The switch above the robot view shows the web map instead of RViz. If RViz is switched off or still starting, the web map is shown by itself.

## 7. Stop the demo

- **Mac:** double-click **Stop Demo.command**.
- **Ubuntu:** `./stop.sh`

Nothing is lost; the next start is quick. Quitting Docker Desktop also stops the demo.

## 8. Updating to a new version

1. Stop the demo (section 7) and get the new version as a new folder (section 0).
2. **Copy your old `.env` into the new folder.** It holds the passwords of the demo's data on this computer, your API keys and your n8n login; without it the new folder cannot open that data (`./start.sh` stops and says so). `.env` is a hidden file: in Finder press **Command+Shift+.** (dot) to see it; in Ubuntu's Files app press **Ctrl+H**. Or in a terminal in the new folder: `cp ../the-old-folder/.env .` (with the old folder's real name).
3. Start the demo from the new folder. The first start after an update rebuilds the robot (a few minutes). Use only the new folder from now on; you may delete the old one.

**Start over from scratch** instead (deletes all earlier visits, the n8n login and the saved keys on this computer): `./reset.sh --everything` in the demo folder; it asks you to type `delete`. Then `./start.sh`.

## Common problems

Run `./status.sh` (Mac: in Terminal, in the demo folder). It checks each part and says what to do.

| Problem | What to do |
|---|---|
| The Mac says it cannot open **Start Demo.command** ("unidentified developer" or "could not verify") | Right-click (or Control-click) the file → **Open** → **Open**. On newer macOS: open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to the file's name. Needed only the first time. Or use Terminal: `cd` into the folder and run `./start.sh`. |
| "Docker is not running" | Mac: open Docker from Applications and wait for the whale icon. Ubuntu: `sudo systemctl start docker`. Then start again. |
| "This user may not use Docker yet" (Ubuntu) | `sudo usermod -aG docker $USER`, log out and back in. |
| "These ports are already used by another program" | `./start.sh` lists every busy port at once, with the exact lines to put in `.env`. Close that program, or open `.env` (Ubuntu: `gedit .env` or `nano .env`; Mac: `open -e .env`, in a terminal in the demo folder), change the lines it shows (for example `HD_DEMO_PORT=8001`), save, and start again (then the demo is at http://localhost:8001/demo/). |
| "This computer already has the demo's data from another copy of the demo folder" | You started the demo from another folder before (an older version, or a second download). Copy `.env` from that folder into this one (section 8) and start again. Or start over: `./reset.sh --everything`. |
| "The database does not accept the passwords in .env" (in `./status.sh`) | The same: this folder's `.env` does not belong to the demo data on this computer. Copy the right `.env` in (section 8), or `./reset.sh --everything`. |
| "This computer is missing a program the demo needs: curl" (Ubuntu) | `sudo apt install curl`, then start again. |
| "Permission denied" when running `./start.sh` | Run `bash ./start.sh` (and `bash ./stop.sh`, ...) instead, or once: `chmod +x *.sh *.command`. |
| The Mac window says "The demo did not start: read the message above" | The lines above it say what is wrong and what to do (Docker not running, a busy port, ...). Fix that and double-click **Start Demo.command** again. |
| The phone cannot open the QR link | Same Wi-Fi? Started with `./start.sh lan` (or `https`)? Then run `./status.sh`: it shows the firewall command to run. |
| The QR code shows `localhost` | Start with `./start.sh lan`. If the computer has several networks (cable and Wi-Fi), put the Wi-Fi address in `.env` as `HD_PUBLIC_HOST=192.168.x.x` and start again. |
| The phone says "Voice notes aren't supported" or asks for the microphone in vain | Voice notes need https: `./start.sh https`, and accept the warning once (section 5). Typing and photos work without it. |
| The phone keeps saying "Sorry, I couldn't process that just now. Please send it again." | Every AI model was out of quota or busy. Run `./status.sh`: it lists the models that are resting and until when (a daily quota resets after midnight, Pacific time). Wait a minute and send again, add a Claude key with `./start.sh claude-key`, or use a new Gemini key with `./start.sh key` (Enter there switches to the stand-in AI). |
| The AI answers "Sorry, something went wrong" or nothing happens after typing | The Gemini key is wrong. Run `./start.sh key` and paste a working key, or press Enter there to use the stand-in AI. |
| "I can't listen to voice notes right now. Please type your message" | Gemini was out of quota or busy, and Claude (the backup) cannot listen to voice notes. Type the message, or add a photo. |
| The robot does not move, or `./status.sh` says the robot is not ready | Wait a minute (the navigation starts slowly the first time). Still stuck: `./stop.sh`, then start again. |
| The computer gets slow or hot | The robot view (RViz) uses a lot of computer power. In `.env` set `HD_RVIZ=no` and start again; the map on the demo stage still shows the robot. |
| Something else | `./stop.sh`, then start again. Still broken: send the output of `./status.sh` and `./tools.sh check` to the developers. |
