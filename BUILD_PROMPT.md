# Project brief for Claude Code: "Hushroom", a focus and study room website

You are my coding partner. Build the complete project described below in this folder, step by step, and run and test it as you go. I have limited time, so favour a finished, polished, working site over a big unfinished one. Ask me a question only if you are truly blocked. Otherwise make a sensible choice and tell me what you chose.

---

## 1. Context: the hackathon I'm entering

This site is my entry for the **BuildyourOwnWebsite Hackathon**, run by Roxten Studios on Devpost (https://buildyourownwebsite.devpost.com/). The facts below come from the Devpost page and the Rules page.

- **Format:** Online. Individual or team entries.
- **Deadline:** **25 November 2026, 9:00 PM IST.** Treat this as the hard limit. I want to submit well before it.
- **Eligibility notes:** Students only, and entrants must be adults. Eligibility may also be tied to registered workshop participants. I am checking this myself with the organisers, so do not worry about it.
- **What I must submit:**
  1. A **publicly accessible live website URL**.
  2. A **GitHub repository link** with the full source code (public).
  3. A short **project description**: idea, purpose and key features.
  4. Creator details (name, email, team name if any).
  5. A **clear disclosure of any AI tools, templates or external libraries used.**
- **Judging criteria:** creativity and originality, UI/UX design, functionality and usability, technical execution, and completeness and presentation. Judges' decisions are final.
- **Prizes:** 1st place gets goodies worth ₹10,000, 2nd place goodies worth ₹5,000.
- **Key rules:**
  - The site must be built during the hackathon period, after the workshop. This must be a fresh build.
  - The site and repo must stay accessible for review.
  - Only work I created or contributed to. No plagiarism and no copying other people's projects. Plagiarised or copied entries can be disqualified.
  - AI tools, templates and libraries are allowed, but **must be disclosed**, and I must understand the code and be able to explain it.
  - Open-source code and third-party assets are allowed with proper attribution.

**What this means for you:**
- Write original code. Do not copy existing projects or templates.
- Prefer **no third-party dependencies**. If you use any, list them with licences in the README.
- **Do not use copyrighted audio, images or fonts.** Generate sound with the Web Audio API and draw visuals with CSS, SVG or canvas.
- Add an honest AI-use disclosure to the README (see section 9).
- Keep the code readable and commented where useful, so I can explain it to a judge.

---

## 2. What the site is

**Hushroom** is a calm, beautiful, all-in-one **focus room** for students. It is a single website, with no signup and no backend, that gives you:

1. A **Pomodoro-style focus timer**.
2. An **ambient sound mixer** whose sounds are generated live in the browser (rain, wind, fire, café murmur, brown noise and a soft lo-fi pad).
3. A simple **task list** for what you are working on this session.
4. A living **scene** (a window view that changes with time of day and with the sounds you mix).
5. **Stats and streaks** so you can see your focus time grow.

**Target user:** a student studying for exams at a desk or on a phone who wants a distraction-free place that feels nice to be in. Everything is aimed at them: fast to start, no clutter, no account.

**Why it stands out:**
- The sounds are synthesised, not audio files, so it loads fast, works offline and has no licensing problems.
- The scene is alive. Rain streaks appear when the rain sound is on, fire glow appears with the fire sound, and the sky follows the time or the chosen theme.
- Everything is stored locally in the browser. It is private and instant, and it works without internet.

---

## 3. Tech constraints (free to build and host)

- **Plain HTML, CSS and vanilla JavaScript (ES modules).** No frameworks, no build step, no npm needed to run.
- **No external requests at runtime.** No CDN, no Google Fonts, no analytics. Use a good system font stack, or a small self-hosted font only if its licence allows it.
- Must work by opening `index.html` through any static server and when hosted on **GitHub Pages**.
- Use `localStorage` for saved data, always inside try/catch.
- Browser support: latest Chrome, Edge, Firefox and Safari, on desktop and mobile.

Suggested file structure (adjust if you have a better one):

```
/index.html
/css/style.css
/js/main.js            // app bootstrap, wiring
/js/timer.js           // focus timer logic
/js/audio.js           // Web Audio sound engine
/js/scene.js           // animated scene (canvas/SVG/CSS)
/js/tasks.js           // task list
/js/stats.js           // stats, streaks, charts
/js/storage.js         // safe localStorage helpers, export/import
/manifest.webmanifest
/sw.js                 // simple offline cache
/icons/                // simple original SVG/PNG icons
/README.md
/screenshots/          // I will add these later
```

---

## 4. Features in detail

### 4.1 Focus timer
- Modes: **Focus** (default 25 min), **Short break** (5 min), **Long break** (15 min after 4 focus sessions).
- Big, readable countdown with a smooth circular progress ring (SVG).
- Start, pause, resume, reset and skip.
- Settings panel to change each duration, toggle auto-start of the next session, and set the number of sessions before a long break.
- The timer must be **accurate even if the tab is in the background**. Use timestamps (end time minus now), not `setInterval` counting.
- Show the remaining time in the **browser tab title** (e.g. `18:42 · Focus · Hushroom`).
- A soft **chime** at the end of a session, generated with the Web Audio API (no audio file). Add an optional browser notification, requested only when the user turns it on.
- Persist the timer settings and the current session count.

### 4.2 Ambient sound mixer (Web Audio API, all synthesised)
Each sound is an independent channel with its own volume slider and on/off toggle, plus one master volume. Suggested sounds and how to make them:
- **Rain:** filtered noise for the steady wash, plus randomly timed short filtered "drop" blips.
- **Wind:** noise through a band-pass filter whose frequency drifts slowly with an LFO.
- **Fire:** low rumble noise plus random short crackle pops.
- **Café murmur:** several detuned, band-limited noise layers with slow random amplitude changes to suggest soft chatter. Keep it subtle.
- **Brown noise:** classic brown noise for deep focus.
- **Lo-fi pad:** a slow, gentle chord progression from a few detuned oscillators through a low-pass filter, with soft attack and release. Make it original and calm.

Requirements:
- Start audio only after a user gesture (browser autoplay rules). Handle the suspended `AudioContext` gracefully.
- Smooth gain changes (use `setTargetAtTime`) to avoid clicks.
- Generate noise buffers once and loop them. Keep CPU use low.
- Save the mix, and offer a few **presets**: "Rainy library", "Cosy cabin", "Deep focus", "Café study".
- A global mute button and a keyboard shortcut.

### 4.3 Living scene
- A window or landscape view drawn with **canvas, SVG or CSS only**.
- The **sky and lighting follow the theme**: Dawn, Day, Dusk, Night. Offer an "Auto" mode that follows the user's local time.
- When **rain** is on, show animated rain streaks and small window droplets. When **fire** is on, show a warm flickering glow. When **wind** is on, move trees or clouds a little more. At night, show stars.
- Keep it smooth and light. Respect `prefers-reduced-motion` by calming or removing animation.
- Pause heavy animation when the tab is hidden.

### 4.4 Task list
- Add, edit, complete and delete tasks. Drag to reorder (or up/down buttons as a fallback).
- Mark one task as "current focus". It appears near the timer.
- Count the completed focus sessions per task.
- Persist everything locally. Include "clear completed".

### 4.5 Stats and streaks
- Track total focus minutes per day.
- Show **today**, **this week** (bar chart drawn in SVG or canvas) and a **current streak** of days with at least one completed focus session.
- A small, GitHub-style heatmap of the last ~12 weeks of focus.
- A few friendly badges (for example first session, 3-day streak, 10 sessions, 5 hours total). Keep it tasteful, not gimmicky.
- **Export and import** all data as a JSON file, and a "reset all data" option with confirmation.

### 4.6 Focus mode and polish
- A distraction-free **fullscreen focus mode** that hides everything except the scene, the timer and the current task.
- **Keyboard shortcuts:** Space = start/pause, R = reset, M = mute, F = focus mode, T = cycle theme, ? = show shortcuts help.
- A short, friendly **first-run welcome** that explains the site in three steps and can be dismissed forever.
- **Installable and offline:** add a web manifest and a small service worker that caches the static files so the site works offline.
- Helpful empty states and small micro-interactions (button feedback, gentle transitions).

---

## 5. Design direction

- **Mood:** calm, warm, cosy and modern. Think quiet study room at dusk, not a busy dashboard.
- **Layout:** a centred, focused main area (scene plus timer), with the mixer, tasks and stats in tidy panels or tabs. On mobile, use a single column with a bottom navigation bar or tabs.
- **Colour:** four cohesive theme palettes (Dawn, Day, Dusk, Night) defined with CSS custom properties. Make sure the contrast meets WCAG AA for text.
- **Typography:** a clean system font stack with good size hierarchy. Use a tabular-numbers style for the timer digits.
- **Shape and motion:** soft rounded corners, subtle glass or blur surfaces where they help, smooth 150–300 ms transitions.
- **Originality:** do not copy any existing app's layout, branding or assets. Create an original logo mark (simple SVG) and favicon.
- **Responsive:** perfect from 360 px wide phones to large desktops.

---

## 6. Accessibility and quality bar

- Semantic HTML, proper headings and landmarks, visible focus outlines.
- All controls usable by keyboard. Use ARIA labels on icon-only buttons.
- Sliders and toggles must be accessible (native inputs styled, or correct ARIA roles).
- Respect `prefers-reduced-motion` and `prefers-color-scheme` for the initial theme.
- No console errors or warnings. Handle `localStorage` or `AudioContext` being unavailable without crashing.
- Aim for a high Lighthouse score (Performance, Accessibility, Best Practices, SEO).
- Add sensible `<title>`, meta description and Open Graph tags (using a locally generated preview image or none).

---

## 7. Your working process

1. Briefly confirm the plan and file structure, then start. Do not stop to ask for approval.
2. Build in this order and **make it run after each step**: (a) page layout and themes, (b) timer, (c) audio engine, (d) scene, (e) tasks, (f) stats, (g) focus mode, shortcuts, welcome flow, (h) manifest and service worker, (i) polish and accessibility pass, (j) README.
3. After each step, run a local static server (for example `python3 -m http.server 8000`) and test it. If you can, also check it in a browser at a phone-sized and a desktop-sized viewport.
4. Fix bugs as you find them. Do not leave placeholder or fake features. Anything visible in the UI must work.
5. When you are done, give me a short summary of what exists, anything you could not test, and exact steps to deploy.

---

## 8. Deployment (free)

Prepare everything so I can host on **GitHub Pages**:
- Make sure all paths are **relative** (so it works under `https://USERNAME.github.io/REPO/`).
- Give me the exact commands to create the repo, commit, push, and enable Pages from the `main` branch root.
- If you can, run the git commands for me when I say so. Do not push anything without my confirmation.
- After deployment, remind me to open the live URL, test it on my phone, and confirm the repo is **public**.

---

## 9. README.md requirements

Write a clear README with:
- The project name, a one-line pitch, and the live URL placeholder.
- What it is, who it's for and a feature list.
- Screenshot placeholders (I will add real screenshots).
- How to run it locally.
- A short explanation of how it works (timer using timestamps, how the sounds are synthesised, how data is stored).
- Keyboard shortcuts.
- Accessibility notes.
- A **"Hackathon" section** that says it was built for the BuildyourOwnWebsite Hackathon (Roxten Studios) during the hackathon period.
- A **"Credits and AI disclosure" section** with this text, edited if needed:
  > This project was built by [MY NAME]. I used Claude Code (an AI coding assistant by Anthropic) to help write and review code, and I reviewed, tested and understand the code. No third-party frameworks or libraries are used at runtime. All sounds are generated in the browser with the Web Audio API, and all visuals are drawn with CSS, SVG and canvas. Icons and the logo are original.
- The licence (MIT).

---

## 10. Definition of done

- [ ] The site runs from a static server with no errors.
- [ ] Timer, mixer, scene, tasks, stats, focus mode, shortcuts and offline support all work.
- [ ] The design is cohesive and looks good on phone and desktop in all four themes.
- [ ] It passes a keyboard-only and screen-reader sanity check.
- [ ] README and AI disclosure are complete.
- [ ] It's ready to deploy to GitHub Pages with relative paths.
- [ ] I have a short list of things to demo to judges (a 60-second tour script).

At the end, also write me a **short Devpost project description** (under 250 words) covering the idea, purpose and key features, and a **60-second demo script**.

Start now.
