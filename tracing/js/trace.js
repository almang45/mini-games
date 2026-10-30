// Tracing rules for Jejak Huruf dan Angka: turns a glyph's strokes into evenly spaced points
// and follows a finger along them. Strokes go in order and in their written direction; a
// finger that leaves the line keeps what it has drawn and can pick up from there.
// Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const STEP = 2;     // spacing of the points along a stroke, in box units
  const TOL = 12;     // a finger this close to the line moves the trace on
  const OFF = 22;     // farther than this and the finger has left the line
  const START = 16;   // how close a press must be to where the trace stands
  const WINDOW = 10;  // points ahead a finger can reach, so it can't cut across a loop
  const END = 4;      // points short of the end that still count as finished

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  // Absolute M, L and C only, which is all js/glyphs.js uses.
  function parse(d) {
    const tokens = d.match(/[MLC]|-?\d*\.?\d+/g) || [];
    const segments = [];
    let at = null;
    let i = 0;
    const num = () => {
      const v = Number(tokens[i++]);
      if (!Number.isFinite(v)) throw new Error("Tracing: bad number in path '" + d + "'");
      return v;
    };
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === "M") at = [num(), num()];
      else if (cmd === "L" && at) { const p = [num(), num()]; segments.push({ type: "L", points: [at, p] }); at = p; }
      else if (cmd === "C" && at) {
        const p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()];
        segments.push({ type: "C", points: [at, p1, p2, p3] });
        at = p3;
      } else throw new Error("Tracing: unsupported path '" + d + "'");
    }
    if (segments.length === 0) throw new Error("Tracing: empty path '" + d + "'");
    return segments;
  }

  function bezier(p, t) {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
  }

  // Points every `step` units along the path, ending exactly on its last point.
  function sample(d, step) {
    const gap = step || STEP;
    const fine = [];
    for (const seg of parse(d)) {
      if (fine.length === 0) fine.push(seg.points[0]);
      if (seg.type === "L") fine.push(seg.points[1]);
      else for (let k = 1; k <= 48; k++) fine.push(bezier(seg.points, k / 48));
    }
    const out = [fine[0]];
    let carried = 0;
    for (let i = 1; i < fine.length; i++) {
      const a = fine[i - 1], b = fine[i];
      const len = dist(a, b);
      let along = gap - carried;
      while (along <= len) {
        out.push(lerp(a, b, along / len));
        along += gap;
      }
      carried = len - (along - gap);
    }
    const last = fine[fine.length - 1];
    if (dist(out[out.length - 1], last) > gap / 4) out.push(last);
    else out[out.length - 1] = last;
    return out.map((p) => [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))]);
  }

  function create(glyph) {
    return Object.freeze({ strokes: glyph.strokes.map((d) => sample(d)), stroke: 0, at: 0, done: false });
  }

  const withAt = (state, at) => (at === state.at ? state : Object.freeze(Object.assign({}, state, { at })));

  // Where the finger has to be to carry on: the start of the next stroke, or where it left off.
  function current(state) {
    if (state.done) return null;
    return state.strokes[state.stroke][state.at];
  }

  // A point a little further along, for the arrow that shows which way to go.
  function heading(state) {
    if (state.done) return null;
    const pts = state.strokes[state.stroke];
    return pts[Math.min(pts.length - 1, state.at + 4)];
  }

  function canStart(state, p) {
    return !state.done && dist(p, current(state)) <= START;
  }

  function finishStroke(state) {
    if (state.stroke + 1 < state.strokes.length) {
      return { state: Object.freeze(Object.assign({}, state, { stroke: state.stroke + 1, at: 0 })), status: "stroke" };
    }
    return { state: Object.freeze(Object.assign({}, state, { at: state.strokes[state.stroke].length - 1, done: true })), status: "done" };
  }

  // Moves the finger from `from` to `to`. A fast swipe is checked in small steps, so it can't
  // skip a corner. Status: "on" (still tracing), "off" (left the line, lift and press again),
  // "stroke" (a stroke is finished, the next starts somewhere else) or "done".
  function follow(state, from, to) {
    if (state.done) return { state, status: "done" };
    const pts = state.strokes[state.stroke];
    let at = state.at;
    const steps = Math.max(1, Math.ceil(dist(from, to) / (STEP / 2)));
    for (let s = 1; s <= steps; s++) {
      const p = lerp(from, to, s / steps);
      let best = at, bestD = Infinity;
      for (let j = at; j <= Math.min(pts.length - 1, at + WINDOW); j++) {
        const dj = dist(p, pts[j]);
        if (dj < bestD) { bestD = dj; best = j; }
      }
      if (bestD > OFF) return { state: withAt(state, at), status: "off" };
      if (bestD <= TOL && best > at) at = best;
      if (at >= pts.length - 1 - END) return finishStroke(state);
    }
    return { state: withAt(state, at), status: "on" };
  }

  // How much of the glyph is traced, 0 to 1, by length.
  function progress(state) {
    const total = state.strokes.reduce((sum, pts) => sum + pts.length - 1, 0);
    if (state.done) return 1;
    const before = state.strokes.slice(0, state.stroke).reduce((sum, pts) => sum + pts.length - 1, 0);
    return (before + state.at) / total;
  }

  const api = { STEP, TOL, OFF, START, WINDOW, END, parse, sample, create, current, heading, canStart, follow, progress };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TRACE = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
