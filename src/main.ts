// main site: clock, cursor-follow project card, and the animated ascii cat
// (letters fly in from all directions on load; the cat blinks now and then)
import {
  HEAD_CROP,
  mountAscii,
  PAPER_DEFAULTS,
  type AsciiFrame,
  type GlyphMod,
} from "./ascii";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const noIntro = new URLSearchParams(location.search).has("nointro");

// --- ascii cat -------------------------------------------------------------
const catCanvas = document.getElementById("cat-art") as HTMLCanvasElement;

let frame: AsciiFrame | null = null;
let poseMod: GlyphMod | undefined;
let blinkTimer: ReturnType<typeof setTimeout> | null = null;
let introRunning = false;

const art = mountAscii(
  catCanvas,
  "cat.jpg",
  { ...PAPER_DEFAULTS },
  () => ({
    maxW: Math.min(window.innerWidth * 0.42, 560),
    maxH: Math.min(window.innerHeight * 0.6, 640),
  }),
  HEAD_CROP,
  {
    onReady: start,
    onResize: () => {
      if (introRunning) return; // intro reads sizes once; let it finish
      frame = art.compute();
      drawRest();
    },
  },
);

function start() {
  frame = art.compute();
  const pose = new URLSearchParams(location.search).get("pose");
  if (pose) {
    const mods: Record<string, GlyphMod> = { squint, pet: squintLids(1), closed };
    poseMod = mods[pose];
    document.title = `eye:${frame.glyphs.filter((g) => g.inEye).length}`;
    art.draw(frame, poseMod);
    return;
  }
  if (reducedMotion || noIntro) {
    art.draw(frame);
    return; // no fly-in, no blinking
  }
  runIntro(frame, () => scheduleBlink());
}

// --- intro: every glyph flies in from a random direction -------------------
function runIntro(f: AsciiFrame, done: () => void) {
  introRunning = true;
  const R = Math.max(f.w, f.h);
  const meta = f.glyphs.map(() => {
    const ang = Math.random() * Math.PI * 2;
    const dist = R * (0.55 + Math.random() * 0.7);
    return {
      sx: f.w / 2 + Math.cos(ang) * dist,
      sy: f.h / 2 + Math.sin(ang) * dist,
      delay: Math.random() * 500,
    };
  });
  const DUR = 900;
  const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
  const t0 = performance.now();
  let ticked = false;

  // watchdog: if rAF never fires (some headless/embedded contexts),
  // fall back to the static render so the cat always appears
  setTimeout(() => {
    if (!ticked) {
      introRunning = false;
      art.draw(f);
      done();
    }
  }, 400);

  function tick(now: number) {
    if (!introRunning) return;
    ticked = true;
    const t = now - t0;
    let settled = true;
    const mod: GlyphMod = (g, i) => {
      const m = meta[i];
      const p = Math.min(1, Math.max(0, (t - m.delay) / DUR));
      if (p >= 1) return; // at rest
      settled = false;
      const e = easeOut(p);
      return { x: m.sx + (g.tx - m.sx) * e, y: m.sy + (g.ty - m.sy) * e };
    };
    art.draw(f, mod);
    if (!settled) {
      requestAnimationFrame(tick);
    } else {
      introRunning = false;
      art.draw(f);
      done();
    }
  }
  requestAnimationFrame(tick);
}

// --- blinking --------------------------------------------------------------
// discrete ascii blink: squint (top/bottom of the eyes vanish) -> closed
// (just a lid line of dashes) -> squint -> open
// realistic squint (matched to the reference photo): the UPPER lid does most
// of the closing — the slit ends up LOW in the eye, slanted along the eye's
// axis (outer corner higher), mirrored between the two eyes.
import type { AsciiGlyph } from "./ascii";

const slitY = (g: AsciiGlyph) => {
  const tilt = g.eyeIx === 0 ? 0.16 : -0.16; // mirror the slant per eye
  return 0.3 + tilt * g.ndx + 0.08 * g.ndx * g.ndx;
};

// closed lids are FUR, not blank space: soft tabby-toned glyphs with a hint
// of crease shading near the slit. deterministic per-cell variation.
function lidHash(g: { tx: number; ty: number }): number {
  return (
    (Math.imul(((g.tx | 0) * 73856093) ^ ((g.ty | 0) * 19349663), 2654435761) >>>
      0) % 8
  );
}
// fur-density lid glyphs: mixed mid-density chars, varied alpha — reads like
// the tabby fur around the eye, not like blank paper
function lidFur(g: { tx: number; ty: number; ndy: number }, upper: boolean, slit: number) {
  const h = lidHash(g);
  const ch = (upper ? "un~x-" : "cv,o-")[h % 5];
  const crease = Math.abs(g.ndy - (slit - 0.3)) < 0.09 ? 0.18 : 0;
  const a = Math.min(
    0.78,
    0.38 + 0.05 * (h % 3) + 0.18 * Math.max(0, -g.ndy) + crease,
  );
  return { ch, style: `rgba(0,0,0,${a.toFixed(3)})` };
}

// amount: 0 = open, 1 = full squint.
// the WHOLE eye shrinks toward the slit line, keeping its normal appearance
// and darkness: rows are thinned out proportionally (sampled, not stacked,
// so nothing gets darker), and expanding fur covers everything vacated.
function squintLids(amount: number): GlyphMod {
  return (g) => {
    if (!g.inEye || !frame) return;
    const slit = slitY(g);
    const fur = lidFur(g, g.ndy < slit, slit);
    // oval collapse: the eye keeps more height at its center than at the
    // corners, so it shrinks into an almond sliver like the reference
    const oval = 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - g.ndx * g.ndx));
    const k = 1 - amount * (1 - 0.35 * oval); // vertical scale at this column
    // thin rows out MORE than the compression ratio — overlapping chars
    // would otherwise stack and darken the squinted eye
    const rowKeep =
      ((((g.ty | 0) * 2654435761) >>> 0) % 97) / 97 < k * 0.8;
    if (!rowKeep) return { ch: fur.ch, style: fur.style };
    const e = frame.eyes[g.eyeIx];
    const ny = slit + (g.ndy - slit) * k;
    const nx = g.ndx * (1 - 0.12 * amount); // slight horizontal narrowing too
    return {
      x: e.x + nx * e.rx,
      y: e.y + ny * e.ry,
      // fur under EVERY eye cell while squinting — no white gaps
      extra:
        amount > 0.25
          ? { x: g.tx, y: g.ty, ch: fur.ch, style: fur.style }
          : undefined,
    };
  };
}
const squint = squintLids(0.6);
// fully closed (blink): full squint plus the slanted lash line
const closed: GlyphMod = (g) => {
  if (!g.inEye || !frame) return;
  const slit = slitY(g);
  const d = Math.abs(g.ndy - slit);
  if (d < 0.1) return { ch: "-", style: "rgba(0,0,0,0.75)" };
  return lidFur(g, g.ndy < slit, slit);
};

// petting: gentle head rock (canvas sways around the neck pivot)
let rockAmp = 0;
let rockTarget = 0;
let rockAnimating = false;
function setRocking(on: boolean) {
  rockTarget = on ? 1 : 0;
  if (!rockAnimating) {
    rockAnimating = true;
    requestAnimationFrame(stepRock);
  }
}
function stepRock(now: number) {
  rockAmp += (rockTarget - rockAmp) * 0.07;
  if (rockAmp < 0.01 && rockTarget === 0) {
    rockAnimating = false;
    rockAmp = 0;
    catCanvas.style.transform = "";
    return;
  }
  const ang = Math.sin((now / 1000) * Math.PI * 2 * 0.9) * 4 * rockAmp;
  catCanvas.style.transform = `rotate(${ang.toFixed(2)}deg)`;
  requestAnimationFrame(stepRock);
}

// squint eases in/out slowly instead of snapping
let squintAmt = 0;
let squintTarget = 0;
let squintAnimating = false;
function setSquint(target: number) {
  squintTarget = target;
  if (!squintAnimating && frame) {
    squintAnimating = true;
    requestAnimationFrame(stepSquint);
  }
}
function stepSquint() {
  const diff = squintTarget - squintAmt;
  if (Math.abs(diff) < 0.02) {
    squintAmt = squintTarget;
    squintAnimating = false;
    if (!blinking) drawRest();
    return;
  }
  squintAmt += diff * 0.09; // slow, smooth close/open
  if (!blinking) drawRest();
  requestAnimationFrame(stepSquint);
}

function drawRest() {
  if (!frame) return;
  art.draw(frame, poseMod ?? (squintAmt > 0.02 ? squintLids(squintAmt) : undefined));
}

function scheduleBlink() {
  if (blinkTimer) clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => {
    if (petting) scheduleBlink(); // he's busy being petted
    else blinkOnce();
  }, 2800 + Math.random() * 4200);
}

let blinking = false;
function blinkOnce() {
  if (!frame || blinking) return;
  blinking = true;
  const f = frame;
  const seq: Array<{ mod: GlyphMod; ms: number }> = [
    { mod: squint, ms: 70 },
    { mod: closed, ms: 120 },
    { mod: squint, ms: 70 },
  ];
  let i = 0;
  const step = () => {
    if (i < seq.length) {
      art.draw(f, seq[i].mod);
      setTimeout(step, seq[i].ms);
      i++;
    } else {
      blinking = false;
      drawRest();
      // occasional double-blink, because cats
      if (Math.random() < 0.2) setTimeout(blinkOnce, 260);
      else scheduleBlink();
    }
  };
  step();
}

// --- petting ---------------------------------------------------------------
// click the cat -> blink. rub side to side over him -> content squint.
let petting = false;
let petLastX: number | null = null;
let petLastDir = 0;
let petFlips: number[] = [];
let petLastMove = 0;

catCanvas.addEventListener("click", () => blinkOnce());

catCanvas.addEventListener("mousemove", (e) => {
  if (!frame) return;
  const now = performance.now();
  if (petLastX !== null) {
    const dx = e.clientX - petLastX;
    if (Math.abs(dx) > 2) {
      const dir = Math.sign(dx);
      if (petLastDir !== 0 && dir !== petLastDir) petFlips.push(now);
      petLastDir = dir;
      petLastMove = now;
    }
  }
  petLastX = e.clientX;
  petFlips = petFlips.filter((t) => now - t < 900);
  if (!petting && petFlips.length >= 2) {
    petting = true;
    setRocking(true); // squint disabled for now — setSquint(1) to revert
  }
});

catCanvas.addEventListener("mouseleave", () => endPetting());

setInterval(() => {
  if (petting && performance.now() - petLastMove > 500) endPetting();
}, 150);

function endPetting() {
  if (!petting) {
    petLastX = null;
    petLastDir = 0;
    petFlips = [];
    return;
  }
  petting = false;
  petLastX = null;
  petLastDir = 0;
  petFlips = [];
  setRocking(false); // squint disabled for now — setSquint(0) to revert
}

// --- clock: New York · HH:MM (24h) ----------------------------------------
const clockEl = document.getElementById("clock")!;
function tickClock() {
  const t = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  clockEl.textContent = `New York · ${t}`;
}
tickClock();
setInterval(tickClock, 15_000);

// --- cursor-follow thumbnail card ------------------------------------------
const card = document.getElementById("cursor-card")!;
const label = document.getElementById("cursor-label")!;
const pos = { x: innerWidth / 2, y: innerHeight / 2 };
const target = { x: pos.x, y: pos.y };
let following = false;

window.addEventListener("mousemove", (e) => {
  target.x = e.clientX;
  target.y = e.clientY;
  if (!following) {
    following = true;
    pos.x = target.x;
    pos.y = target.y;
    requestAnimationFrame(follow);
  }
});

function follow() {
  pos.x += (target.x - pos.x) * 0.12;
  pos.y += (target.y - pos.y) * 0.12;
  card.style.left = `${pos.x}px`;
  card.style.top = `${pos.y}px`;
  requestAnimationFrame(follow);
}

for (const link of document.querySelectorAll<HTMLAnchorElement>("nav a[data-thumb]")) {
  link.addEventListener("mouseenter", () => {
    label.textContent = link.dataset.thumb ?? "";
    card.classList.add("on");
  });
  link.addEventListener("mouseleave", () => card.classList.remove("on"));
}
