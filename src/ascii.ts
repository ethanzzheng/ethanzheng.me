// ---------------------------------------------------------------------------
// image -> ascii renderer (shared by the site + /cat.html stash page)
//  - samples the photo at 3x cell resolution: per-cell average color/luminance
//    plus per-cell MAX luminance, so thin bright whiskers survive downsampling
//  - luminance -> character ramp; Sobel pass gives directional glyphs on
//    strong edges; unsharp mask adds local contrast (paper theme)
//  - themes:
//      "dark"  — glyphs emit light on a near-black background; soft vignette
//      "paper" — transparent canvas, dark ink on a light page. a hand-fit
//                head silhouette masks the room to zero ink; eye ellipses
//                keep the eyes big and dark with a grey glint
//  - compute() returns the frame as a glyph list so callers can animate
//    (fly-in intro, blinking) via draw(frame, mod)
// ---------------------------------------------------------------------------

export type Mode = "color" | "green" | "mono";
export type Theme = "dark" | "paper";

export interface Crop { x: number; y: number; w: number; h: number }

export interface AsciiParams {
  theme: Theme;
  cols: number;
  contrast: number;
  brightness: number;
  gamma: number;
  edges: boolean;
  edgeThreshold: number;
  invert: boolean;
  mode: Mode;
  satBoost: number;
  lumFloor: number;
  vignette: boolean;
  whiskers: boolean;
}

export const DARK_DEFAULTS: AsciiParams = {
  theme: "dark",
  cols: 190,
  contrast: 1.42,
  brightness: 0.10,
  gamma: 0.68,
  edges: true,
  edgeThreshold: 0.42,
  invert: false,
  mode: "color",
  satBoost: 1.55,
  lumFloor: 0.45,
  vignette: true,
  whiskers: true,
};

export const PAPER_DEFAULTS: AsciiParams = {
  ...DARK_DEFAULTS,
  theme: "paper",
  cols: 190,
  contrast: 1.85,
  brightness: 0.0,
  gamma: 0.8,
  edgeThreshold: 0.55,
  mode: "mono",
};

// full portrait: ears through chest (the /cat.html stash framing)
export const FULL_CROP: Crop = { x: 0, y: 48, w: 847, h: 1040 };
// head only, for the paper cutout on the main site
export const HEAD_CROP: Crop = { x: 0, y: 60, w: 847, h: 890 };

// sparse -> dense
const RAMP =
  " .`'^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const CHAR_ASPECT = 0.6;
const HIRES = 3;

// silhouette of THIS photo in ABSOLUTE source coords (847x1201).
// one continuous outline of quadratic segments [ctrlX, ctrlY, endX, endY].
const SIL = {
  start: [90, 585] as const,
  outline: [
    [105, 460, 90, 340],   // left side up, slightly concave (matches right)
    [100, 220, 148, 108],  // left ear outer edge
    [162, 92, 176, 116],   // rounded tip
    [240, 195, 330, 262],  // left ear inner edge down
    [420, 246, 510, 262],  // gently domed skull top between the ears
    [600, 195, 664, 116],  // right ear inner edge up (mirror)
    [678, 92, 692, 108],   // rounded tip (mirror)
    [740, 220, 750, 340],  // right ear outer edge down (mirror)
    [735, 460, 750, 585],  // right side, slightly concave
    [718, 785, 495, 856],  // chin right
    [420, 880, 340, 858],  // chin bottom
    [118, 795, 90, 585],   // left jaw, back to start
  ] as const,
  // eye ellipses: interiors go deep dark with a grey glint
  // aligned against the original photo (see /tmp/eyecheck.html method)
  eyes: [
    { cx: 220, cy: 485, rx: 90, ry: 90 },
    { cx: 590, cy: 500, rx: 95, ry: 92 },
  ],
};

export interface AsciiGlyph {
  tx: number;      // target x (css px)
  ty: number;      // target y
  ch: string;
  style: string;
  inEye: boolean;
  ink: number;     // 0..1 how dark this glyph is (drives squint compression)
  eyeIx: number;   // 0 = left eye, 1 = right eye
  ndx: number;     // normalized horizontal offset within the eye (-1..1)
  ndy: number;     // normalized vertical offset within the eye (-1..1)
}

export interface AsciiFrame {
  glyphs: AsciiGlyph[];
  w: number;       // css px
  h: number;
  dpr: number;
  font: string;
  paper: boolean;
  eyes: Array<{ x: number; y: number; rx: number; ry: number }>; // css px
}

export type GlyphMod = (
  g: AsciiGlyph,
  i: number,
) =>
  | {
      x?: number;
      y?: number;
      ch?: string;
      style?: string;
      // an additional glyph to draw (e.g. lid fur covering a moved char's cell)
      extra?: { x: number; y: number; ch: string; style: string };
    }
  | null
  | void;

export interface AsciiArt {
  params: AsciiParams;
  render: () => void;
  compute: () => AsciiFrame;
  draw: (frame: AsciiFrame, mod?: GlyphMod) => void;
}

export interface AsciiOpts {
  onReady?: () => void;   // called on image load instead of the default render
  onResize?: () => void;  // called on window resize instead of the default render
}

export function mountAscii(
  canvas: HTMLCanvasElement,
  src: string,
  params: AsciiParams,
  fit?: () => { maxW: number; maxH: number },
  crop: Crop = FULL_CROP,
  opts?: AsciiOpts,
): AsciiArt {
  const ctx = canvas.getContext("2d")!;
  const img = new Image();
  img.src = src;

  const P = params;
  const dbg = new URLSearchParams(location.search).get("debug");
  const debugMask = dbg === "mask";
  const debugEyes = dbg === "eyes";

  const fitBox =
    fit ??
    (() => ({
      maxW: Math.min(window.innerWidth - 48, 1100),
      maxH: window.innerHeight * 0.82,
    }));

  function adjustLum(l: number): number {
    l = Math.pow(l, P.gamma);
    l = (l - 0.5) * P.contrast + 0.5 + P.brightness;
    return Math.min(1, Math.max(0, l));
  }

  function vignetteAt(x: number, y: number, cols: number, rows: number): number {
    const nx = (x / cols - 0.5) / 0.62;
    const ny = (y / rows - 0.47) / 0.58;
    const d = Math.sqrt(nx * nx + ny * ny);
    const t = Math.min(1, Math.max(0, (d - 0.82) / 0.45));
    const s = t * t * (3 - 2 * t);
    return 1 - s * 0.85;
  }

  function edgeGlyph(gx: number, gy: number): string {
    const angle = Math.atan2(gy, gx) * (180 / Math.PI);
    const a = ((angle % 180) + 180) % 180;
    if (a < 22.5 || a >= 157.5) return "|";
    if (a < 67.5) return "\\";
    if (a < 112.5) return "-";
    return "/";
  }

  // build the silhouette mask at cell resolution; cached per cols
  let maskCache: { cols: number; m: Float32Array } | null = null;
  function buildMask(cols: number, rows: number): Float32Array {
    if (maskCache && maskCache.cols === cols) return maskCache.m;
    const c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    const mctx = c.getContext("2d", { willReadFrequently: true })!;
    const X = (ax: number) => ((ax - crop.x) * cols) / crop.w;
    const Y = (ay: number) => ((ay - crop.y) * rows) / crop.h;
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, cols, rows);
    mctx.fillStyle = "#fff";
    mctx.beginPath();
    mctx.moveTo(X(SIL.start[0]), Y(SIL.start[1]));
    for (const [cx2, cy2, ex, ey] of SIL.outline) {
      mctx.quadraticCurveTo(X(cx2), Y(cy2), X(ex), Y(ey));
    }
    mctx.closePath();
    mctx.fill();
    // soft edge via 3x3 box average
    const d0 = mctx.getImageData(0, 0, cols, rows).data;
    const hard = new Float32Array(cols * rows);
    for (let i = 0; i < hard.length; i++) hard[i] = d0[i * 4] / 255;
    const m = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= rows || xx < 0 || xx >= cols) continue;
            sum += hard[yy * cols + xx];
            cnt++;
          }
        }
        m[y * cols + x] = sum / cnt;
      }
    }
    maskCache = { cols, m };
    return m;
  }

  function sample(hw: number, hh: number) {
    const off = document.createElement("canvas");
    off.width = hw;
    off.height = hh;
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, hw, hh);
    // mask the lock-screen clock (absolute source rect) with the strip below it
    const clock = { x: 195, y: 40, w: 470, h: 160 };
    const kx = hw / crop.w, ky = hh / crop.h;
    octx.drawImage(
      img,
      clock.x, clock.y + clock.h + 8, clock.w, 40,
      (clock.x - crop.x) * kx, (clock.y - crop.y) * ky, clock.w * kx, clock.h * ky,
    );
    octx.fillStyle = "rgba(10,10,11,0.55)";
    octx.fillRect((clock.x - crop.x) * kx, (clock.y - crop.y) * ky, clock.w * kx, clock.h * ky);
    return octx.getImageData(0, 0, hw, hh).data;
  }

  function compute(): AsciiFrame {
    const paper = P.theme === "paper";
    const cols = P.cols;
    const rows = Math.round(cols * (crop.h / crop.w) * CHAR_ASPECT);
    const hw = cols * HIRES, hh = rows * HIRES;
    const data = sample(hw, hh);

    // reduce 3x3 hi-res blocks -> per-cell avg color, avg lum, max lum
    const n = cols * rows;
    const lum = new Float32Array(n);
    const maxLum = new Float32Array(n);
    const cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let sr = 0, sg = 0, sb = 0, sl = 0, ml = 0;
        for (let dy = 0; dy < HIRES; dy++) {
          for (let dx = 0; dx < HIRES; dx++) {
            const hi = ((y * HIRES + dy) * hw + x * HIRES + dx) * 4;
            const r = data[hi], g = data[hi + 1], b = data[hi + 2];
            const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            sr += r; sg += g; sb += b; sl += l;
            if (l > ml) ml = l;
          }
        }
        const inv = 1 / (HIRES * HIRES);
        cr[i] = sr * inv; cg[i] = sg * inv; cb[i] = sb * inv;
        lum[i] = sl * inv;
        maxLum[i] = ml;
      }
    }

    // paper: unsharp mask for local contrast
    let lumT = lum;
    if (paper) {
      const blur = new Float32Array(n);
      const R = 2;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let sum = 0, cnt = 0;
          for (let dy = -R; dy <= R; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= rows) continue;
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= cols) continue;
              sum += lum[yy * cols + xx];
              cnt++;
            }
          }
          blur[y * cols + x] = sum / cnt;
        }
      }
      lumT = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = lum[i] + 0.85 * (lum[i] - blur[i]);
        lumT[i] = Math.min(1, Math.max(0, v));
      }
    }

    // sobel on cell-resolution average luminance
    const gxArr = new Float32Array(n);
    const gyArr = new Float32Array(n);
    const mag = new Float32Array(n);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const tl = lum[i - cols - 1], t = lum[i - cols], tr = lum[i - cols + 1];
        const l = lum[i - 1],                             r = lum[i + 1];
        const bl = lum[i + cols - 1], bo = lum[i + cols], br = lum[i + cols + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br;
        const gy = -tl - 2 * t - tr + bl + 2 * bo + br;
        gxArr[i] = gx;
        gyArr[i] = gy;
        mag[i] = Math.hypot(gx, gy);
      }
    }

    // paper: silhouette mask
    let mask: Float32Array | null = null;
    if (paper) mask = buildMask(cols, rows);

    // eye ellipses in cell coordinates
    const eyeCells = SIL.eyes.map((e) => ({
      x: ((e.cx - crop.x) * cols) / crop.w,
      y: ((e.cy - crop.y) * rows) / crop.h,
      rx: (e.rx * cols) / crop.w,
      ry: (e.ry * rows) / crop.h,
    }));
    const eyeNorm = (
      x: number,
      y: number,
    ): { dx: number; dy: number; ix: number } | null => {
      for (let ix = 0; ix < eyeCells.length; ix++) {
        const e = eyeCells[ix];
        const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
        if (dx * dx + dy * dy <= 1) return { dx, dy, ix };
      }
      return null;
    };

    // glyph metrics + canvas sizing
    const dpr = window.devicePixelRatio || 1;
    const { maxW, maxH } = fitBox();
    const ch = Math.max(4, Math.min(maxW / (cols * CHAR_ASPECT), maxH / rows));
    const cw = ch * CHAR_ASPECT;
    const w = cols * cw, h = rows * ch;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const font = `${ch}px ui-monospace, Menlo, monospace`;

    const frame: AsciiFrame = {
      glyphs: [], w, h, dpr, font, paper,
      eyes: eyeCells.map((e) => ({ x: e.x * cw, y: e.y * ch, rx: e.rx * cw, ry: e.ry * ch })),
    };

    // debug view: raw mask + eye zones (?debug=mask)
    if (paper && debugMask) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const mv = mask![y * cols + x];
          if (eyeNorm(x, y) !== null) {
            ctx.fillStyle = "rgba(200,0,0,0.9)";
            ctx.fillRect(x * cw, y * ch, cw, ch);
            continue;
          }
          if (mv <= 0.01) continue;
          ctx.fillStyle = `rgba(0,0,0,${(mv * 0.35).toFixed(3)})`;
          ctx.fillRect(x * cw, y * ch, cw, ch);
        }
      }
      return frame;
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const vig = P.vignette && !paper ? vignetteAt(x, y, cols, rows) : 1;
        const mv = paper ? mask![i] : 1;
        const en = paper ? eyeNorm(x, y) : null;
        const eye = en !== null;

        // whisker cells: a thin bright streak inside a darker cell
        const whisker =
          P.whiskers && maxLum[i] - lum[i] > 0.24 && maxLum[i] > 0.5;

        let l = adjustLum(lumT[i]);
        if (P.invert) l = 1 - l;

        let intensity: number;
        if (paper) {
          intensity = 1 - l;
          if (eye) {
            // big dark eyes with a sparkle, like the photo
            intensity = lum[i] > 0.6 ? 0.35 : Math.max(0.78, intensity);
          }
          // white whiskers on paper = light gaps through darker fur
          if (whisker && !eye && lum[i] > 0.35)
            intensity = Math.min(intensity, 1 - adjustLum(maxLum[i]));
          // hard-gated silhouette: the room gets no ink at all
          intensity *= mv < 0.55 ? 0 : mv;
        } else {
          if (whisker) l = Math.max(l, adjustLum(maxLum[i]));
          l *= whisker ? Math.sqrt(vig) : vig;
          intensity = l;
        }
        if (intensity <= (paper ? 0.1 : 0.015)) {
          if (paper && mv >= 0.55) {
            // interior floor: faint dots keep the cutout reading as one object
            frame.glyphs.push({
              tx: x * cw, ty: y * ch, ch: ".",
              style: "rgba(0,0,0,0.13)", inEye: eye, ink: 0.13, eyeIx: en?.ix ?? 0, ndx: en?.dx ?? 0, ndy: en?.dy ?? 0,
            });
          }
          continue;
        }

        const isEdge = paper
          ? P.edges && mag[i] * mv > P.edgeThreshold
          : P.edges && mag[i] * vig > P.edgeThreshold && lum[i] > 0.1;

        let glyph: string;
        if (whisker && !paper) {
          glyph = mag[i] > 0.05 ? edgeGlyph(gxArr[i], gyArr[i]) : "-";
        } else if (isEdge) {
          glyph = edgeGlyph(gxArr[i], gyArr[i]);
        } else {
          const idx = Math.min(RAMP.length - 1, Math.floor(intensity * RAMP.length));
          glyph = RAMP[idx];
        }
        if (glyph === " ") continue;

        let style: string;
        let inkLevel = Math.min(1, intensity);
        if (paper) {
          let a = 0.06 + 1.55 * intensity;
          if (isEdge) a = Math.max(a, 0.75);
          inkLevel = Math.min(1, a);
          style = `rgba(0,0,0,${inkLevel.toFixed(3)})`;
        } else if (whisker) {
          const v = Math.round(120 + 135 * Math.min(1, intensity * 1.15));
          style = `rgb(${v},${v - 4},${v - 12})`;
        } else if (P.mode === "color") {
          let r = cr[i], g = cg[i], b = cb[i];
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = gray + (r - gray) * P.satBoost;
          g = gray + (g - gray) * P.satBoost;
          b = gray + (b - gray) * P.satBoost;
          const target = (P.lumFloor + (1 - P.lumFloor) * intensity) * (isEdge ? 1.25 : 1);
          const cur = Math.max(1, Math.max(r, g, b));
          const scale = (Math.min(1, target) * 255) / cur;
          r = Math.min(255, r * scale);
          g = Math.min(255, g * scale);
          b = Math.min(255, b * scale);
          style = `rgb(${r | 0},${g | 0},${b | 0})`;
        } else if (P.mode === "green") {
          const v = 0.25 + 0.75 * intensity * (isEdge ? 1.2 : 1);
          style = `rgba(74,246,138,${Math.min(1, v)})`;
        } else {
          const v = Math.round(40 + 215 * Math.min(1, intensity * (isEdge ? 1.2 : 1)));
          style = `rgb(${v},${v - 3},${v - 8})`;
        }

        frame.glyphs.push({
          tx: x * cw, ty: y * ch, ch: glyph, style, inEye: eye, ink: inkLevel, eyeIx: en?.ix ?? 0, ndx: en?.dx ?? 0, ndy: en?.dy ?? 0,
        });
      }
    }

    // sort by style so draw() switches fillStyle rarely (fast animation frames)
    frame.glyphs.sort((a, b) => (a.style < b.style ? -1 : a.style > b.style ? 1 : 0));

    if (debugEyes) {
      lastEyeOverlay = eyeCells.map((e) => ({
        x: e.x * cw, y: e.y * ch, rx: e.rx * cw, ry: e.ry * ch,
      }));
    }
    return frame;
  }

  let lastEyeOverlay: Array<{ x: number; y: number; rx: number; ry: number }> = [];

  function draw(frame: AsciiFrame, mod?: GlyphMod) {
    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    if (frame.paper) {
      ctx.clearRect(0, 0, frame.w, frame.h);
    } else {
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, frame.w, frame.h);
    }
    ctx.font = frame.font;
    ctx.textBaseline = "top";
    let last = "";
    for (let i = 0; i < frame.glyphs.length; i++) {
      const g = frame.glyphs[i];
      let x = g.tx, y = g.ty, chG = g.ch, style = g.style;
      let extra: { x: number; y: number; ch: string; style: string } | undefined;
      if (mod) {
        const m = mod(g, i);
        if (m === null) continue;
        if (m) {
          if (m.x !== undefined) x = m.x;
          if (m.y !== undefined) y = m.y;
          if (m.ch !== undefined) chG = m.ch;
          if (m.style !== undefined) style = m.style;
          extra = m.extra;
        }
      }
      if (style !== last) {
        ctx.fillStyle = style;
        last = style;
      }
      ctx.fillText(chG, x, y);
      if (extra) {
        ctx.fillStyle = extra.style;
        ctx.fillText(extra.ch, extra.x, extra.y);
        last = extra.style;
      }
    }
    if (debugEyes) {
      ctx.strokeStyle = "rgba(220,0,0,0.9)";
      ctx.lineWidth = 1.5;
      for (const e of lastEyeOverlay) {
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function render() {
    if (!img.complete || !img.naturalWidth) return;
    draw(compute());
  }

  img.onload = () => (opts?.onReady ? opts.onReady() : render());
  window.addEventListener("resize", () => (opts?.onResize ? opts.onResize() : render()));
  return { params: P, render, compute, draw };
}
