# Aisle Guide (Home Depot kiosk + guide robot demo)

See QUICKSTART.md (for the people who run the demo: plain words, Ubuntu and Mac), README.md (setup, running, testing), API_CONTRACT.md (every webhook and endpoint), WORKFLOW_EXPLAINED.md (the workflows node by node) and DEMO_SCRIPT.md (the recording).

**Boundaries**
- Work only inside this folder. Never touch the parent folder `Real/` (the real Dingo robot setup) or anything else outside it.
- Never commit `.env` (passwords and API keys) or `test_photos/` (licences need attribution/share-alike). The one sample photo that ships is `samples/deck_board.jpg` (CC0, see `samples/CREDITS.md`).

**How it runs**
- Everything runs in Docker, as the Compose project `homedepot` (`docker/compose.yaml`): containers `hd_postgres`, `hd_n8n`, `hd_robot` and, in offline mode, `hd_fake_ai` (the stand-in AI, `n8n/test/fake_gemini.py`); volumes `homedepot_hd_pgdata`, `homedepot_hd_n8ndata`, `homedepot_hd_tls`; image `hd-demo-robot:latest`. Ports on this computer: 8000 (demo pages + robot API), 5678 (n8n), 6080 (RViz in the browser), 8443 (https for phones).
- `./start.sh`, `./stop.sh`, `./status.sh`, `./reset.sh`, `./tools.sh` and the Mac `.command` files share `docker/lib.sh`. They must run on macOS's bash 3.2 with BSD tools (check with `docker run --rm -v $PWD:/w -w /w bash:3.2 bash -n <file>`). Settings live in `.env` (made from `docker/env.template`). A second, isolated copy of the stack for testing sets `HD_PROJECT`, `HD_NAME_PREFIX`, `HD_IMAGE` and other ports in its `.env`.
- `./start.sh` rebuilds the robot image whenever a file that goes into it changes (`ui/`, `robot/`, `tools/`, `docker/robot/`, `store/`, `n8n/test/fake_gemini.py`, ...): that recreates `hd_robot`.
- The robot side is simulation only (ROS 2 Humble + Nav2 + RViz in `hd_robot`, ROS domain 42, localhost only).

**The front end** is `ui/` (React 19 + TypeScript + Vite + Astryx). The robot image builds it (a `node:22` stage of `docker/robot.Dockerfile`) and the robot service serves it at http://localhost:8000/demo/ (stage `index.html`, phone page `phone.html?s=<session_id>`). The old plain-HTML pages in `demo/` are only a fallback (`HD_FRONTEND=demo`). For work on the UI: `npm run dev` in `ui/` serves http://localhost:5173/demo/ with the API proxied to port 8000; `npm run build` writes `ui/dist/`.

**n8n**
- The workflows' source is `n8n/build_workflow.py`; never hand-edit the generated JSON in `n8n/`. `./start.sh setup` (same as `./n8n/setup.sh`) builds them inside the robot image, imports the credentials and the workflows, and switches them on; `./start.sh` does it by itself when the source or a setting changed.
- There are four workflows: **Home Depot guide robot** (the main one), **Ask an AI model (Gemini → Claude fallback)** (sub-workflow), **Phone screen (status poll)** and **Timeout check (every minute)**.
- Canvas rules: every decision is an If or Switch node named as a question ("Claude key set?"); every outcome is a Set node; Code nodes only shape data (never decide). The decision trace on every reply comes from these nodes.

**Testing**: `./tools.sh test` (a whole visit), `./tools.sh check` (logs, one time line per visit), `tools/edge_case_test.py` (the awkward cases and the model chain; needs the stand-in AI), `./status.sh` (each part, with the fix).

## UI/UX Engineering Standards

These apply to every frontend task.

**Component discipline**
- Design tokens come from the Astryx theme `aisle` (Neutral base, the store's orange as the accent, green as success = the robot and its light). Its source is `ui/themes/aisle/`; change it only with `npx astryx experimental theme editor set aisle ...` (it rebuilds `ui/src/themes/aisle/`). Use semantic tokens (`var(--color-*)`, `--spacing-*`, `--radius-*`, `--font-size-*`, `--duration-*`, `--ease-*`).
- Never hardcode hex colours, arbitrary pixel values or one-off shadows in page code. Use a token, or add a token to the theme first.
- Use Astryx components and their props first (`Button`, `Card`, `Badge`, `Text`, `Heading`, `VStack`/`HStack`, `Layout`, `Banner`, `EmptyState`, `Skeleton`, `ProgressBar`, `StatusDot`, `Chat*`, `List`). The few visuals Astryx has no component for (store map, phone frame, kiosk, story strip) are styled in `ui/src/shared/app.css` with tokens only. Use semantic HTML (`button`, `header`, `main`, `section`, lists), not raw `<div>` soup.
- Astryx (Meta's design system, `@astryxdesign/cli`, React 19+, Node 22.13+) is installed in `ui/`. Run its commands from `ui/`: query `npx astryx search` and `npx astryx component <Name>` before building any UI, and run `npx astryx doctor` (and `npx astryx doctor --built .`) before finishing.

**Zero "AI slop"**
- No generic purple/blue gradients, no repetitive 3-card SaaS grids, no placeholder copy ("John Doe", "Lorem ipsum").
- Use realistic store copy: real-sounding products, aisles, prices and repair language.
- Keep whitespace intentional and the visual hierarchy clear: one primary action per screen.

**Tactile polish and states**
- Every interactive element has distinct hover, active and keyboard `:focus-visible` states. Touch targets are at least 44 px (the theme's `--size-element-lg` is 2.75rem: use `size="lg"` on the phone).
- Every data view has a skeleton loading state, an actionable empty state and a graceful error state with a way to retry.
- Respect `prefers-reduced-motion` and keep text contrast at WCAG AA or better.

**Visual self-audit loop**
- After building or changing UI, open the page and take screenshots at desktop (1440x900) and mobile (390x844).
- Use either the Playwright MCP server (`.mcp.json`, runs in Docker) or the desktop app's built-in browser.
- Fix any alignment, overflow, clipping or contrast problem you see. Check the browser console for errors before finishing.

## Astryx agent rules (written by `npx astryx init` into `ui/AGENTS.md`)

Astryx v0.7.16 · 174 components. Run every command in `ui/` as `npx astryx <cmd>`.

- Setup (already done in `ui/src/shared/Root.tsx`): `@astryxdesign/core/reset.css` and `@astryxdesign/core/astryx.css` are imported once, and the app is wrapped in `<Theme theme={themes[defaultThemeSlug]}>` from `ui/src/astryx-themes.ts`.
- Workflow: `npx astryx build "<idea>"` names the closest template and the parts it lacks; `npx astryx template <name> <path>` scaffolds it; `npx astryx component <Name>` shows a component's props before you use it. Changing an existing page: keep it and add blocks/components inside its sections.
- Style with component props first, then tokens. No raw hex/px. There is no StyleX/Tailwind compiler in this app, so do not use `xstyle` or utility classes.
- Dense data = rows (`Table`, `List`/`Item`), not Card-wrapped lists. Badge = status and categories.
- Themes: palettes and custom colours go through the theme editor (`npx astryx experimental theme editor set aisle <thing> <value>`, `... how "<what you want>"`, `... show aisle --png` to look at it), never `:root` overrides.
- Before delivering, run `npx astryx doctor --built .` and do not deliver if it fails.
