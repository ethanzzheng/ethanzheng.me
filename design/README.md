# Handoff: Ethan Zheng — Portfolio Redesign

## Overview
Replacement for ethanzheng.me (currently Webflow). One screen, no scrolling on a normal laptop: a tiny mono header, a three-line serif statement, and a footer with three project links + three contact links. Ambient drifting color haze in the background and a cursor-following thumbnail card when hovering project links. Reference inspiration: joshuale.com (very little text, big type, one accent).

## About the Design Files
`Ethan Zheng.dc.html` is a **design reference built in HTML** — a prototype showing the intended look and behavior, not production code to ship. Recreate it in whatever stack you choose (a static Next.js/Astro page or plain HTML/CSS/JS is plenty; there is no data layer). Keep the structure, type, colors, and motion as specified below.

## Fidelity
**High-fidelity.** Colors, type, spacing, and motion are final. Recreate pixel-close.

## Screen: Home (only screen)

### Layout
- `body`: background `#CCDAD1`, color `#000000`, margin 0, `-webkit-font-smoothing: antialiased`.
- Root: `min-height: 100vh; display: flex; flex-direction: column; justify-content: space-between; gap: 40px; padding: clamp(20px, 4vw, 44px) clamp(20px, 6vw, 80px)`. Content is `position: relative; z-index: 1`.
- Background layer: `position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0` containing two blurred blobs (see Background).

### Header
- Flex row, `justify-content: space-between; align-items: baseline; gap: 24px`.
- Font: JetBrains Mono 400, 11px, `letter-spacing: 0.08em`, uppercase.
- Left: `Ethan Zheng`. Right: live clock `New York · HH:MM` (24h, America/New_York, updates every 15s), color `rgba(0,0,0,0.55)`, `font-variant-numeric: tabular-nums`.
- Entrance: `fadeUp 0.8s ease 0.1s forwards`.

### Main / Headline
- `main`: flex, `align-items: center; justify-content: space-between; padding: clamp(16px, 4vh, 48px) 0`.
- `h1`: Instrument Serif 400, `font-size: clamp(30px, 4.6vw, 60px)`, `line-height: 1.06`, `letter-spacing: -0.02em`, `max-width: 24ch`, `text-wrap: pretty`, margin 0.
- Three lines, each a block wrapper with `overflow: hidden; padding-bottom: 0.05em` around an inner block that animates in:
  1. `Ethan Zheng —`
  2. `product manager,`
  3. `NYC.` — the word `NYC` is italic, color `#F08700`; the period is black.
- Inner blocks start at `transform: translateY(110%)` and run `riseIn 1s cubic-bezier(0.16,1,0.3,1)` with delays 0.2s / 0.32s / 0.44s, `forwards`.

### Footer
- Flex row, wrap, `justify-content: space-between; align-items: flex-end; gap: clamp(24px, 4vw, 64px)`; entrance `fadeUp 0.9s ease 0.95s forwards`.
- Left `nav`: flex column, `gap: 6px`, Instrument Sans 400 14px. Links (open in new tab):
  - `Skyline` → https://app.llmobserve.com/ (thumb label `Skyline · LLM cost SDK`)
  - `Bilt Rewards` → https://www.figma.com/design/DnZygpV7BBvgNZzUJJEZjD/Bilt-Portfolio?node-id=0-1 (thumb `Bilt · loyalty`)
  - `TikTok Shop` → https://www.figma.com/design/DpbCJFAzB6Bo8SBaplMCvS/TTS-Portfolio?node-id=0-1 (thumb `TikTok Shop · checkout`)
- Right group: flex row, wrap, `gap: 22px; align-items: baseline`, JetBrains Mono 11px, `letter-spacing: 0.06em`, uppercase:
  - `Email` → mailto:ez2146@stern.nyu.edu — has `border-bottom: 1px solid #F08700; padding-bottom: 2px`
  - `LinkedIn` → placeholder https://www.linkedin.com/ (**replace with real URL**)
  - `GitHub` → placeholder https://github.com/ (**replace with real URL**)

### Background haze
Two absolutely positioned circles, `border-radius: 50%`, radial gradient to transparent at 62–63%, blurred:
- Teal: `top: -28vh; right: -12vw; width/height: 72vw; background: radial-gradient(circle, rgba(40,102,110,0.42), transparent 63%); filter: blur(24px); animation: drift 28s ease-in-out infinite`.
- Orange: `bottom: -38vh; left: -20vw; width/height: 64vw; background: radial-gradient(circle, rgba(240,135,0,0.22), transparent 62%); filter: blur(26px); animation: drift 36s ease-in-out infinite reverse`.

### Hover thumbnail card (cursor follower)
- `position: fixed; width: 200px; height: 132px; margin: -66px 0 0 -100px; pointer-events: none; border-radius: 3px; overflow: hidden; box-shadow: 0 20px 44px rgba(0,0,0,0.18); z-index: 5`.
- Fill: `repeating-linear-gradient(135deg, #28666E 0 8px, #2f747d 8px 16px)` — a striped placeholder. **Swap for real project screenshots** (one per link).
- Label bottom-left (`inset: auto 10px 10px`): JetBrains Mono 10px, `letter-spacing: 0.06em`, uppercase, color `#CCDAD1`; text = link's thumb label.
- Hidden state: `opacity: 0; transform: scale(0.92)`. Shown: `opacity: 1; scale(1)`. `transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1)`.
- Position follows the mouse with lerp: each rAF frame `pos += (target - pos) * 0.12`; set `left/top` in px.

## Interactions & Behavior
- Link hover (global `a:hover`): color `#28666E`.
- Project link hover: `transform: translateX(10px)`, color `#F08700`, `transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), color 0.3s ease`; shows the cursor card with that link's label. Leave: reverse + hide card.
- Clock: `toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })`.
- Responsive: flex-wrap handles narrow widths; headline scales via clamp. Page may scroll on very short viewports — that's fine. Hide the cursor card on touch devices (no hover).
- Respect `prefers-reduced-motion`: skip drift + entrance animations (not in prototype; add it).

## Keyframes
```css
@keyframes riseIn { from { transform: translateY(110%); } to { transform: translateY(0); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes drift { 0% { transform: translate(-3%, 3%) scale(1); } 50% { transform: translate(7%, -6%) scale(1.18); } 100% { transform: translate(-3%, 3%) scale(1); } }
```

## State Management
None beyond: clock string (interval), cursor target/position (rAF), hovered link (for card label/visibility). No fetching.

## Design Tokens
Colors (see `palette.json`):
- Ash Grey `#CCDAD1` — page background, card label text
- Stormy Teal `#28666E` — link hover, haze, card stripes (`#2f747d` second stripe)
- Black `#000000` — text; `rgba(0,0,0,0.55)` muted (clock); `rgba(0,0,0,0.18)` card shadow
- Tiger Orange `#F08700` — "NYC" accent, email underline, project-link hover text, warm haze

Typography (Google Fonts):
- Instrument Serif 400 (+ italic) — headline
- Instrument Sans 400/500 — body, project links
- JetBrains Mono 400 — header, clock, contact links, card label

Type scale: 60/4.6vw/30 headline · 14 links · 11 mono meta · 10 card label.
Spacing: page padding `clamp(20px,4vw,44px)` × `clamp(20px,6vw,80px)`; root gap 40; footer gap `clamp(24px,4vw,64px)`; nav gap 6; contact gap 22.
Radius: 3px (card). Shadow: `0 20px 44px rgba(0,0,0,0.18)`.
Easing: `cubic-bezier(0.16,1,0.3,1)` for all movement.

## Assets
- None shipped. Needed: 3 project thumbnails (~400×264 @2x) to replace the striped placeholder; real LinkedIn/GitHub URLs.
- Fonts via Google Fonts: `https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap`

## Files
- `Ethan Zheng.dc.html` — the prototype (markup + inline styles + behavior script). Note: contains an unused ASCII-cat block in the script (`__CAT`, `paintCat`, `decodeCat`) that was removed from the design — ignore it.
- `palette.json` — the four brand colors.
