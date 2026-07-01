// Small shared visual helpers reused across screens: the hand-drawn scribble
// underline, the wobbly "today" circle, and progress rings.

function scribbleSvg(width, color) {
  const w = width;
  const points = Math.round(w / 24);
  let d = `M2,${w * 0.03 + 2} `;
  for (let i = 0; i < points; i++) {
    const x1 = 2 + (i + 0.5) * (w / points);
    const x2 = 2 + (i + 1) * (w / points);
    d += `Q${x1},${i % 2 === 0 ? 0 : 6} ${x2},3 `;
  }
  return `<svg width="${w}" height="8" viewBox="0 0 ${w} 8" class="screen-scribble" aria-hidden="true">
    <path d="${d}" stroke="${color || "var(--accent)"}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>
  </svg>`;
}

function wobbleCircleSvg(size, color) {
  const s = size;
  const r = s / 2 - 3;
  const c = s / 2;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" class="week-day-wobble" aria-hidden="true">
    <path d="M${c},3 C${c + r * 0.9},3 ${s - 3},${c - r * 0.9} ${s - 3},${c}
      C${s - 2},${c + r * 0.9} ${c + r * 0.85},${s - 3} ${c},${s - 3}
      C${c - r * 0.9},${s - 2} 3,${c + r * 0.85} 3,${c}
      C2,${c - r * 0.85} ${c - r * 0.85},3 ${c},3 Z"
      fill="none" stroke="${color || "var(--accent)"}" stroke-width="1.6"/>
  </svg>`;
}

// A flat progress ring. fraction is 0-1. Returns just the <svg>, caller wraps
// it in a positioned container and overlays a label.
function ringSvg(size, strokeWidth, fraction, trackColor, fillColor) {
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, fraction)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${fillColor}" stroke-width="${strokeWidth}"
      stroke-linecap="round" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${offset}"/>
  </svg>`;
}

// Fill polygon's bottom edge stays pinned at the glass's actual bottom
// (never translated), only the top water-line moves with fraction — so the
// glass always looks fully anchored, even near 100% full.
function glassSvg(fraction, width, height, strokeColor, fillColor) {
  const w = width;
  const h = height;
  const topInset = w * 0.12;
  const bottomInset = w * 0.23;
  const cupPath = `M${topInset - 1},2 L${w - topInset + 1},2 L${w - bottomInset},${h - 2} L${bottomInset},${h - 2} Z`;
  const f = Math.max(0, Math.min(1, fraction));
  const fillTop = 2 + (h - 4) * (1 - f);
  const left = topInset - 4;
  const right = w - topInset + 4;
  const mid = (left + right) / 2;
  const uid = `${Math.round(f * 1000)}-${w}-${height}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="glass-svg" aria-hidden="true">
    <clipPath id="cupclip-${uid}"><path d="${cupPath}"/></clipPath>
    <path d="M${left},${fillTop} Q${mid - 4},${fillTop - 3} ${mid + 4},${fillTop} T${right},${fillTop} L${right},${h + 2} L${left},${h + 2} Z"
      fill="${fillColor}" clip-path="url(#cupclip-${uid})"/>
    <path d="${cupPath}" fill="none" stroke="${strokeColor}" stroke-width="1.8"/>
  </svg>`;
}

function formatClockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekdayLetter(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
}
