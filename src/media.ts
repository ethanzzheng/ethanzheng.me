// media card: loops animated clips, navigated with morphing page dots
// (vanilla port of 21st.dev MorphingPageDots: active dot stretches to a
// pill with a ripple; chevrons disable at the ends, no wrap)
const CLIPS = ["reykjavik", "megatron", "shanghai", "tokyo", "kona", "san_jose"];

const video = document.getElementById("media-video") as HTMLVideoElement;
const name = document.getElementById("media-name")!;
const dotsWrap = document.getElementById("dots")!;
const prev = document.getElementById("dots-prev") as HTMLButtonElement;
const next = document.getElementById("dots-next") as HTMLButtonElement;

let page = 0;

const dots = CLIPS.map((_, i) => {
  const d = document.createElement("button");
  d.className = "dot";
  d.setAttribute("aria-label", `clip ${i + 1}`);
  d.addEventListener("click", () => show(i));
  dotsWrap.appendChild(d);
  return d;
});

function show(n: number) {
  page = Math.max(0, Math.min(CLIPS.length - 1, n));
  video.src = `media/${CLIPS[page]}.mp4`;
  video.play().catch(() => {});
  name.textContent = CLIPS[page].replace(/_/g, " ");
  prev.disabled = page === 0;
  next.disabled = page === CLIPS.length - 1;
  dots.forEach((d, i) => {
    d.classList.toggle("active", i === page);
    d.querySelector(".ripple")?.remove();
    if (i === page) {
      const r = document.createElement("span");
      r.className = "ripple";
      r.addEventListener("animationend", () => r.remove());
      d.appendChild(r);
    }
  });
}

prev.addEventListener("click", () => show(page - 1));
next.addEventListener("click", () => show(page + 1));
show(0);

export {};
