const assert = require("assert");
const T = require("../trace.js");
const { BOX, LETTERS, NUMBERS, GLYPHS_BY_CHAR, arcPath } = require("../glyphs.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a, b, tol) => dist(a, b) <= (tol || 0.6);

// Drags a finger through `points` one move at a time, the way pointermove events arrive.
function drag(state, points) {
  const statuses = [];
  for (let i = 1; i < points.length; i++) {
    const r = T.follow(state, points[i - 1], points[i]);
    state = r.state;
    statuses.push(r.status);
    if (r.status !== "on") break;
  }
  return { state, statuses, last: statuses[statuses.length - 1] };
}

// Traces every stroke along its own points, `every` points per move, lifting between strokes.
function traceAll(glyph, every, offset) {
  let state = T.create(glyph);
  const statuses = [];
  for (let s = 0; s < glyph.strokes.length; s++) {
    const pts = state.strokes[s].map((p) => [p[0] + (offset || 0), p[1]]);
    ok(glyph.char + " stroke " + (s + 1) + ": a press at its start is accepted", T.canStart(state, pts[0]));
    const path = pts.filter((_, i) => i % every === 0).concat([pts[pts.length - 1]]);
    const r = drag(state, path);
    state = r.state;
    statuses.push(r.last);
  }
  return { state, statuses };
}

(function glyphsAreWellFormed() {
  ok("26 letters", LETTERS.length === 26 && LETTERS.map((g) => g.char).join("") === "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  ok("10 numbers, counting order", NUMBERS.map((g) => g.char).join("") === "1234567890");
  ok("every glyph is findable", Object.keys(GLYPHS_BY_CHAR).length === 36);
  for (const glyph of LETTERS.concat(NUMBERS)) {
    ok(glyph.char + ": has strokes", glyph.strokes.length >= 1 && glyph.strokes.length <= 4);
    glyph.strokes.forEach((d, s) => {
      const where = glyph.char + " stroke " + (s + 1);
      ok(where + ": only M, L and C", /^M[MLC0-9 .-]+$/.test(d), d);
      const pts = T.sample(d);
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
      ok(where + ": long enough to trace", length >= 30, length);
      ok(where + ": stays on the page", pts.every((p) => p[0] >= 2 && p[0] <= BOX - 2 && p[1] >= 2 && p[1] <= BOX - 2), pts.find((p) => p[0] < 2 || p[0] > BOX - 2 || p[1] < 2 || p[1] > BOX - 2));
      // Spacing is measured along the line, so only a corner brings two points closer.
      // The very end snaps onto the last point, so the final gap can stretch by a quarter step.
      ok(where + ": points are no further apart than a step", pts.slice(1).every((p, i) => dist(pts[i], p) <= T.STEP * (i === pts.length - 2 ? 1.25 : 1) + 0.05 && dist(pts[i], p) > 0.2));
    });
    // Glyphs sit between the cap line and the baseline, give or take a tail or a curve's swell.
    const all = glyph.strokes.flatMap((d) => T.sample(d));
    const top = Math.min(...all.map((p) => p[1]));
    const bottom = Math.max(...all.map((p) => p[1]));
    ok(glyph.char + ": reaches the cap line", top <= 12, top);
    ok(glyph.char + ": reaches the baseline", bottom >= 86, bottom);
  }
})();

(function arcsGoTheRightWay() {
  const d = arcPath(50, 50, 10, 10, 0, -90);
  ok("arc starts at angle 0, on the right", d.startsWith("M60 50 C"));
  const pts = T.sample(d, 1);
  ok("arc ends at angle -90, at the top", near(pts[pts.length - 1], [50, 40]));
  ok("going to a smaller angle runs counter-clockwise (up first)", pts[3][1] < 50 && pts[3][0] < 60);
  const quarter = pts.length - 1;
  ok("a quarter circle of radius 10 is about 15.7 long", Math.abs(quarter - 15.7) < 1.2, quarter);
  const o = T.sample(GLYPHS_BY_CHAR.O.strokes[0]);
  ok("O starts and ends at the top", near(o[0], [50, 10]) && near(o[o.length - 1], [50, 10]));
  ok("O goes left first, the way it's written", o[5][0] < 50);
  const c = T.sample(GLYPHS_BY_CHAR.C.strokes[0]);
  ok("C opens on the right", c[0][0] > 75 && c[c.length - 1][0] > 75 && c[0][1] < 50 && c[c.length - 1][1] > 50);
})();

(function parsingIsStrict() {
  assert.throws(() => T.parse("M0 0 Q10 10 20 20"), /unsupported/);
  assert.throws(() => T.parse("L10 10"), /unsupported/);
  assert.throws(() => T.parse("M10 10"), /empty/);
  passed += 3;
  ok("a path with two lines has two segments", T.parse("M0 0 L10 0 L10 10").length === 2);
  const straight = T.sample("M0 0 L20 0");
  ok("a straight line is sampled every step", straight.length === 11 && straight.every((p, i) => near(p, [i * T.STEP, 0], 0.01)));
  const corner = T.sample("M0 0 L3 0 L3 10");
  ok("a corner is sampled along the line, not across it", near(corner[1], [2, 0], 0.01) && near(corner[2], [3, 1], 0.01));
})();

(function everyGlyphCanBeTraced() {
  for (const glyph of LETTERS.concat(NUMBERS)) {
    const expected = glyph.strokes.map((_, i) => (i === glyph.strokes.length - 1 ? "done" : "stroke"));
    for (const every of [1, 3, 6]) {
      const { state, statuses } = traceAll(glyph, every);
      ok(glyph.char + ": traced in moves of " + every * T.STEP, state.done && statuses.join() === expected.join(), statuses);
    }
    const wobbly = traceAll(glyph, 2, 7);
    ok(glyph.char + ": a little off to one side still counts", wobbly.state.done, wobbly.statuses);
    ok(glyph.char + ": progress reaches 1", T.progress(wobbly.state) === 1);
  }
})();

(function strokesGoInOrder() {
  const H = T.create(GLYPHS_BY_CHAR.H);
  ok("H: the second stroke can't go first", !T.canStart(H, [76, 10]));
  ok("H: a press far from any line is refused", !T.canStart(H, [50, 80]));
  ok("H: a press a little off the start is fine", T.canStart(H, [30, 18]));
  const firstDone = drag(H, [[24, 10], [24, 50], [24, 90]]);
  ok("H: finishing a stroke says so", firstDone.last === "stroke" && firstDone.state.stroke === 1 && firstDone.state.at === 0);
  ok("H: then the second stroke starts at its own start", T.canStart(firstDone.state, [76, 10]) && !T.canStart(firstDone.state, [24, 90]));
  ok("H: the old state is untouched", H.stroke === 0 && Object.isFrozen(firstDone.state));
})();

(function noShortcuts() {
  const L = T.create(GLYPHS_BY_CHAR.L);
  const back = drag(L, [[30, 10], [30, 0], [30, -20]]);
  ok("going backwards off the end leaves the line", back.last === "off" && back.state.at === 0);
  const U = T.create(GLYPHS_BY_CHAR.U);
  const across = drag(U, [[24, 10], [76, 10]]);
  ok("cutting straight across the top of a U leaves the line", across.last === "off");
  const O = T.create(GLYPHS_BY_CHAR.O);
  const middle = drag(O, [[50, 10], [50, 90]]);
  ok("cutting through the middle of an O leaves the line", middle.last === "off");
  const swipe = drag(O, [[50, 10], [16, 50], [50, 90], [84, 50], [50, 10]]);
  ok("a rough diamond is close enough to an O for small hands", swipe.last === "done" && swipe.statuses.length === 4);
  const I = T.create(GLYPHS_BY_CHAR.I);
  const fast = T.follow(I, [50, 10], [50, 90]);
  ok("one fast, straight swipe down an I's stem counts", fast.status === "stroke" && fast.state.stroke === 1);
  const short = drag(T.create(GLYPHS_BY_CHAR.T), [[50, 10]].concat([[18, 10], [70, 10]]));
  ok("stopping short of the end doesn't finish a stroke", short.state.stroke === 0);
})();

(function loopsDontFinishEarly() {
  const eight = T.create(GLYPHS_BY_CHAR["8"]);
  const pts = eight.strokes[0];
  const half = Math.floor(pts.length / 2);
  const r = drag(eight, pts.slice(0, half + 1));
  ok("8: passing the crossing doesn't finish it", r.last === "on" && r.state.at >= half - 1);
  const o = T.create(GLYPHS_BY_CHAR.O);
  const nearEnd = drag(o, [[50, 10], [44, 10.5]]);
  ok("O: the start, which is also the end, doesn't count as finished", nearEnd.last === "on" && !nearEnd.state.done);
})();

(function resumeAfterSlipping() {
  let state = T.create(GLYPHS_BY_CHAR.L);
  let r = drag(state, [[30, 10], [30, 40], [70, 40]]);
  ok("slipping off keeps what was traced", r.last === "off" && r.state.at > 10);
  state = r.state;
  const here = T.current(state);
  ok("current is where the trace stopped", here[0] === 30 && Math.abs(here[1] - 10 - state.at * T.STEP) < 0.1);
  ok("pressing there again is accepted", T.canStart(state, [31, here[1] + 2]));
  ok("pressing back at the very start is not", !T.canStart(state, [30, 10]) || state.at * T.STEP < T.START);
  r = drag(state, [here, [30, 90], [74, 90]]);
  ok("and the trace carries on to the end", r.last === "done" && r.state.done);
  ok("a finished glyph ignores more moves", T.follow(r.state, [0, 0], [10, 10]).status === "done");
  ok("and offers nowhere to start", T.current(r.state) === null && !T.canStart(r.state, [74, 90]));
  const h = T.heading(T.create(GLYPHS_BY_CHAR.L));
  ok("heading points down the L's stem", h[0] === 30 && h[1] > 10);
})();

console.log("trace.test.js: " + passed + " assertions passed");
