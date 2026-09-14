// main site: shader background, media card, clock, cursor-follow project card.
// (the ascii cat engine still powers /cat.html via src/cat.ts)

// animated shader background; dynamic import so a webgl failure can never
// take down the rest of the site (falls back to the plain background).
import("./shader").catch(() => {});

import "./media";

// --- clock: HH:MM (24h, New York) ------------------------------------------
const clockEl = document.getElementById("clock")!;
function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
