/* ---------------------------------------------------------------------- */
/* "SACRED TIMELINE" EDGE GEOMETRY — branching, electric-looking paths    */
/* between graph nodes, styled after the Loki timeline-branch visual.     */
/* ---------------------------------------------------------------------- */

// Deterministic PRNG (mulberry32) seeded from a string, so the jitter for
// a given edge is stable across re-renders instead of crawling every time
// the component redraws.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function bezierTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const x = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const y = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

// Turns a polyline into a smooth-but-wobbly SVG path: quadratic curves
// through the midpoints of each segment keep it continuous instead of
// kinking at every sample point.
function smoothPath(points) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q ${points[i].x} ${points[i].y}, ${mid.x} ${mid.y}`;
  }
  const last = points[points.length - 1];
  d += ` Q ${last.x} ${last.y}, ${last.x} ${last.y}`;
  return d;
}

const SAMPLES = 14;

/** Builds a "Sacred Timeline" style strand between two node anchor points:
 * the usual S-curve, nudged off its smooth path like a live current —
 * echoing the branching-timeline visual from Loki. `seed` should be a
 * stable per-edge string (e.g. "fromId->toId") so the wobble doesn't
 * reshuffle on every render. */
export function buildTimelineBranch(x1, y1, x2, y2, seed) {
  const rand = mulberry32(hashSeed(seed));
  const midX = (x1 + x2) / 2;
  const p0 = { x: x1, y: y1 };
  const p1 = { x: midX, y: y1 };
  const p2 = { x: midX, y: y2 };
  const p3 = { x: x2, y: y2 };

  const dist = Math.hypot(x2 - x1, y2 - y1);
  const maxOffset = Math.min(9, Math.max(2, dist * 0.035));

  const points = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const pt = bezierPoint(p0, p1, p2, p3, t);
    if (i === 0 || i === SAMPLES - 1) {
      points.push(pt);
      continue;
    }
    const tangent = bezierTangent(p0, p1, p2, p3, t);
    const normal = { x: -tangent.y, y: tangent.x };
    const taper = Math.sin(Math.PI * t);
    const offset = (rand() * 2 - 1) * maxOffset * taper;
    points.push({ x: pt.x + normal.x * offset, y: pt.y + normal.y * offset });
  }

  return smoothPath(points);
}
