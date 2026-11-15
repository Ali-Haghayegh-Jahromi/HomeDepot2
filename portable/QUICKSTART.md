# Aisle Guide demo: quick start

A customer tells a store kiosk what they want to repair, gets a list of items on their phone, and a robot walks them to each shelf. Everything runs on your own computer; the robot is a simulation.

This page is all you need to run and show the demo. Technical details are in [README.md](README.md).

## 1. Install Docker (once)

Docker is the only program the demo needs.

- **Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/). Pick **Apple Silicon** or **Intel chip** (Apple menu → *About This Mac* shows which one you have). Open Docker from Applications once, accept its terms, and wait until the whale icon in the menu bar stops moving.
- **Ubuntu:** install [Docker Engine](https://docs.docker.com/engine/install/ubuntu/), then run `sudo usermod -aG docker $USER` and log out and back in.

Your computer needs about 8 GB of memory and 10 GB of free disk space. Keep the demo folder in your home folder (for example in Documents or Desktop), not on an external drive.

## 2. Start the demo

- **Mac:** double-click **Start Demo.command** in the demo folder.
- **Ubuntu:** open a terminal in the demo folder and run `./start.sh`

The first start asks for a **Gemini API key** (the AI). Get one free at https://aistudio.google.com/apikey: sign in with a Google account, press *Create API key*, copy it and paste it into the window (you will not see it while you paste), then press Enter. No key? Just press Enter: the demo then uses a simple stand-in AI that needs no internet but understands only a few jobs (decks, toilets, holes in walls, leaking faucets, painting, hanging things). You can add or change the key later with `./start.sh key`.

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
- **Robot view** (http://localhost:6080): RViz, the robot's own view of the store, seen from above, with its planned route. Put it next to the demo stage. (For the 3D store instead: in `.env` set `HD_RVIZ_VIEW=3d` and start again; then drag to turn the view, scroll to zoom.)
- **n8n** (http://localhost:5678): the workflow behind it all. Log in with the email and password shown when the demo started (they are also in the file `.env`). Open the workflow, then **Executions**: every step of a visit is one run you can click through.

## 4. Give the demo

1. On the kiosk press **I'm here, I need help**. The QR code appears and the phone opens.
2. On the phone, first type something unrelated ("tell me a joke") to show that the AI refuses it. Then a real problem: "one of the boards on my deck is cracked".
3. Answer the follow-up questions. Tick the items you want and press **Guide me**.
4. Watch the robot leave its dock on the map and in the 3D view. The shelf light turns on when the robot is 5 m away; **I am done** appears when it arrives.
5. After the last item, answer **No** to get repair steps and videos; the robot drives back to its dock.

Between two audiences, `./reset.sh` clears all earlier visits and sends the robot back to its dock (your API key and login stay).

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

Open the **studio view**: http://localhost:8000/demo/?view=studio (or the **Studio view** button at the top of the demo stage). It is made for a 1920 x 1080 screen recording: kiosk, the customer's phone (mirrored live from a real phone), the robot's live view from RViz, the robot's status and every step as it happens, under the story strip. Make the browser window full screen (F11 on Ubuntu, Control-Command-F on a Mac) and record the screen. The switch above the robot view shows the web map instead of RViz. If RViz is switched off or still starting, the web map is shown by itself.

## 7. Stop the demo

- **Mac:** double-click **Stop Demo.command**.
- **Ubuntu:** `./stop.sh`

Nothing is lost; the next start is quick. Quitting Docker Desktop also stops the demo.

## Common problems

Run `./status.sh` (Mac: in Terminal, in the demo folder). It checks each part and says what to do.

| Problem | What to do |
|---|---|
| The Mac says it cannot open **Start Demo.command** ("unidentified developer" or "could not verify") | Right-click (or Control-click) the file → **Open** → **Open**. On newer macOS: open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to the file's name. Needed only the first time. Or use Terminal: `cd` into the folder and run `./start.sh`. |
| "Docker is not running" | Mac: open Docker from Applications and wait for the whale icon. Ubuntu: `sudo systemctl start docker`. Then start again. |
| "This user may not use Docker yet" (Ubuntu) | `sudo usermod -aG docker $USER`, log out and back in. |
| "Port 8000 is already used" | Another program uses that port. Close it, or open `.env`, change `HD_DEMO_PORT=8000` to `8001`, and start again (then the demo is at http://localhost:8001/demo/). The same goes for 5678, 6080 and 8443 (`HD_HTTPS_PORT`). |
| The phone cannot open the QR link | Same Wi-Fi? Started with `./start.sh lan` (or `https`)? Then run `./status.sh`: it shows the firewall command to run. |
| The QR code shows `localhost` | Start with `./start.sh lan`. If the computer has several networks (cable and Wi-Fi), put the Wi-Fi address in `.env` as `HD_PUBLIC_HOST=192.168.x.x` and start again. |
| The phone says "Voice notes aren't supported" or asks for the microphone in vain | Voice notes need https: `./start.sh https`, and accept the warning once (section 5). Typing and photos work without it. |
| The AI answers "Sorry, something went wrong" or nothing happens after typing | The Gemini key is wrong or has no quota left. Run `./start.sh key` and paste a working key, or press Enter there to use the stand-in AI. |
| The robot does not move, or `./status.sh` says the robot is not ready | Wait a minute (the navigation starts slowly the first time). Still stuck: `./stop.sh`, then start again. |
| The computer gets slow or hot | The 3D view uses a lot of computer power. In `.env` set `HD_RVIZ=no` and start again; the map on the demo stage still shows the robot. |
| Something else | `./stop.sh`, then start again. Still broken: send the output of `./status.sh` and `./tools.sh check` to the developers. |
