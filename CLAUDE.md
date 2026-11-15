# Aisle Guide (Home Depot kiosk + guide robot demo)

See README.md (setup, running, testing), API_CONTRACT.md (every webhook and endpoint) and WORKFLOW_EXPLAINED.md.

- The n8n workflow's source is `n8n/build_workflow.py`; never hand-edit the generated JSON. Rebuild, then `./n8n/setup.sh` to import and activate.
- The robot side is simulation only. It runs in Docker container `hd_robot` on ROS domain 42, localhost only. Never touch the real Dingo setup in the parent folder (`Real/`).
- The front end is `ui/` (React 19 + TypeScript + Vite + Astryx). `npm run build` in `ui/` writes `ui/dist/` with the same page names as `demo/` (stage `index.html`, phone page `phone.html?s=<session_id>`, base `/demo/`). `npm run dev` serves it on http://localhost:5173/demo/ with the API proxied to port 8000. The old plain-HTML pages in `demo/` are what the robot service serves at http://localhost:8000/demo/ until its `DEMO_DIR` is switched to `ui/dist/` (see README.md, "The front end").

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
