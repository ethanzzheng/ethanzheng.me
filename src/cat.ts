// /cat.html — the stashed black-background ascii cat with live tuning keys
import { DARK_DEFAULTS, mountAscii, type AsciiParams } from "./ascii";

const canvas = document.getElementById("art") as HTMLCanvasElement;
let art = mountAscii(canvas, "/cat.jpg", { ...DARK_DEFAULTS });

window.addEventListener("keydown", (e) => {
  const P: AsciiParams = art.params;
  switch (e.key) {
    case "c": P.mode = "color"; break;
    case "g": P.mode = "green"; break;
    case "w": P.mode = "mono"; break;
    case "[": P.cols = Math.max(60, P.cols - 10); break;
    case "]": P.cols = Math.min(320, P.cols + 10); break;
    case "-": P.contrast = Math.max(0.4, P.contrast - 0.08); break;
    case "=": P.contrast = Math.min(3, P.contrast + 0.08); break;
    case ",": P.brightness = Math.max(-0.4, P.brightness - 0.03); break;
    case ".": P.brightness = Math.min(0.4, P.brightness + 0.03); break;
    case "e": P.edges = !P.edges; break;
    case "v": P.vignette = !P.vignette; break;
    case "s": P.whiskers = !P.whiskers; break;
    case "i": P.invert = !P.invert; break;
    case "0": Object.assign(P, DARK_DEFAULTS); break;
    default: return;
  }
  art.render();
});
