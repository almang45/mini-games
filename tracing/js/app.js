// Jejak Huruf dan Angka controller: draws the glyph from js/glyphs.js on a handwriting sheet,
// feeds finger moves to js/trace.js, and shows the word (or the count) when a glyph is done.
// Ink colors come from color-fusion/js/mix.js; speech, sound and the header toggles from
// shared/kids/kids.js.
(function () {
  "use strict";
  const MIX = window.MIX;
  const KIDS = window.KIDS;
  const GLYPHS = window.GLYPHS;
  const TRACE = window.TRACE;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "tracing.v1";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MODES = { letters: GLYPHS.LETTERS, numbers: GLYPHS.NUMBERS };
  const INKS = ["red", "orange", "green", "blue", "indigo", "purple", "pink"];
  const DEMO_SPEED = 70; // box units per second, about a kid's careful pace
  const DEMO_PAUSE = 350;

  const WORDS = {
    id: {
      A: ["Apel", "🍎"], B: ["Bola", "⚽"], C: ["Cicak", "🦎"], D: ["Domba", "🐑"], E: ["Es krim", "🍦"],
      F: ["Flamingo", "🦩"], G: ["Gajah", "🐘"], H: ["Harimau", "🐯"], I: ["Ikan", "🐟"], J: ["Jeruk", "🍊"],
      K: ["Kucing", "🐱"], L: ["Lebah", "🐝"], M: ["Mobil", "🚗"], N: ["Nanas", "🍍"], O: ["Orang utan", "🦧"],
      P: ["Pisang", "🍌"], Q: ["Quokka", "🐾"], R: ["Rumah", "🏠"], S: ["Sapi", "🐄"], T: ["Topi", "🧢"],
      U: ["Ular", "🐍"], V: ["Vespa", "🛵"], W: ["Wortel", "🥕"], X: ["Xilofon", "🎶"], Y: ["Yoyo", "🪀"],
      Z: ["Zebra", "🦓"],
    },
    en: {
      A: ["Apple", "🍎"], B: ["Ball", "⚽"], C: ["Cat", "🐱"], D: ["Dog", "🐶"], E: ["Egg", "🥚"],
      F: ["Fish", "🐟"], G: ["Grapes", "🍇"], H: ["Horse", "🐴"], I: ["Ice cream", "🍦"], J: ["Juice", "🧃"],
      K: ["Kite", "🪁"], L: ["Lion", "🦁"], M: ["Moon", "🌙"], N: ["Nose", "👃"], O: ["Octopus", "🐙"],
      P: ["Pig", "🐷"], Q: ["Queen", "👑"], R: ["Rabbit", "🐰"], S: ["Sun", "☀️"], T: ["Tree", "🌳"],
      U: ["Umbrella", "☂️"], V: ["Violin", "🎻"], W: ["Whale", "🐳"], X: ["Xylophone", "🎶"], Y: ["Yo-yo", "🪀"],
      Z: ["Zebra", "🦓"],
    },
  };
  // How the letters are said in Indonesian; an id-ID voice reading "B" alone can say "bi".
  const LETTER_NAMES_ID = {
    A: "a", B: "be", C: "ce", D: "de", E: "e", F: "ef", G: "ge", H: "ha", I: "i", J: "je", K: "ka", L: "el", M: "em",
    N: "en", O: "o", P: "pe", Q: "ki", R: "er", S: "es", T: "te", U: "u", V: "ve", W: "we", X: "eks", Y: "ye", Z: "zet",
  };
  const COUNTED = { 1: "🍉", 2: "🍌", 3: "🍎", 4: "🍊", 5: "🍓", 6: "🍇", 7: "🥕", 8: "🧁", 9: "⭐" };

  const STRINGS = {
    id: {
      back: "← Semua Game",
      language: "Bahasa",
      sound: "Suara",
      title: "Jejak Huruf dan Angka",
      modes: "Huruf atau angka",
      letters: "Huruf",
      numbers: "Angka",
      stepLetter: "Huruf {char}",
      stepNumber: "Angka {char}",
      start: "Mulai dari titik hijau",
      keepGoing: "Teruskan dari titik hijau",
      nextStroke: "Bagus! Sekarang garis berikutnya",
      off: "Ikuti garisnya, ya",
      board: "{char}, garis {n} dari {total}",
      boardDone: "{char}, selesai",
      watch: "Lihat",
      watchLabel: "Lihat cara menulisnya",
      again: "Ulangi",
      againLabel: "Ulangi dari awal",
      next: "Lanjut",
      sayLetter: "{name}. {word}",
    },
    en: {
      back: "← All Games",
      language: "Language",
      sound: "Sound",
      title: "Trace Letters and Numbers",
      modes: "Letters or numbers",
      letters: "Letters",
      numbers: "Numbers",
      stepLetter: "Letter {char}",
      stepNumber: "Number {char}",
      start: "Start at the green dot",
      keepGoing: "Carry on from the green dot",
      nextStroke: "Good! Now the next line",
      off: "Stay on the line",
      board: "{char}, line {n} of {total}",
      boardDone: "{char}, done",
      watch: "Watch",
      watchLabel: "Watch how it's written",
      again: "Again",
      againLabel: "Start this one again",
      next: "Next",
      sayLetter: "{name} is for {word}",
    },
  };
  const t = KIDS.translator(STRINGS);

  // ---- saved progress -------------------------------------------------------------

  function loadSave() {
    const data = KIDS.load(STORE_KEY) || {};
    const save = { mode: MODES[data.mode] ? data.mode : "letters", index: {}, done: {} };
    for (const [mode, glyphs] of Object.entries(MODES)) {
      const i = data.index && data.index[mode];
      save.index[mode] = Number.isInteger(i) && i >= 0 && i < glyphs.length ? i : 0;
      const chars = new Set(glyphs.map((g) => g.char));
      const done = data.done && Array.isArray(data.done[mode]) ? data.done[mode] : [];
      save.done[mode] = [...new Set(done.filter((c) => chars.has(c)))];
    }
    return save;
  }

  const saved = loadSave();
  const persist = () => KIDS.save(STORE_KEY, saved);

  const glyphs = () => MODES[saved.mode];
  const glyph = () => glyphs()[saved.index[saved.mode]];
  const inkHex = () => MIX.toHex(MIX.NAMED_BY_ID[INKS[saved.index[saved.mode] % INKS.length]].rgb);
  const isLetter = () => saved.mode === "letters";

  let trace = TRACE.create(glyph());
  let drawing = null;
  let demo = null;
  let message = "start";

  // ---- drawing the sheet ------------------------------------------------------------

  const board = $("board");
  const paper = $("paper");

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    if (parent) parent.append(el);
    return el;
  }

  const toPoints = (pts) => pts.map((p) => p[0] + "," + p[1]).join(" ");

  let inkLine = null;
  let demoLayer = null;

  function renderBoard() {
    const g = glyph();
    board.replaceChildren();
    board.classList.toggle("is-done", trace.done);
    svgEl("rect", { class: "sheet", x: -4, y: -4, width: 108, height: 108, rx: 9 }, board);
    // Handwriting-book rules: the cap line and baseline solid, the middle line dashed.
    for (const y of [10, 90]) svgEl("line", { class: "rule", x1: 0, x2: 100, y1: y, y2: y }, board);
    svgEl("line", { class: "rule rule--mid", x1: 0, x2: 100, y1: 50, y2: 50 }, board);

    const guide = svgEl("g", { class: "guide" }, board);
    for (const d of g.strokes) svgEl("path", { class: "track", d }, guide);
    g.strokes.forEach((d, i) => {
      if (trace.done || i >= trace.stroke) svgEl("path", { class: "dots", d }, guide);
    });

    const ink = svgEl("g", { class: "ink", stroke: inkHex() }, board);
    g.strokes.forEach((d, i) => {
      if (trace.done || i < trace.stroke) svgEl("path", { d }, ink);
    });
    inkLine = trace.done ? null : svgEl("polyline", { points: "" }, ink);
    renderInk();

    demoLayer = svgEl("g", { class: "demo", stroke: inkHex() }, board);
    if (!trace.done) renderStart();
    board.setAttribute("aria-label", trace.done
      ? t("boardDone", { char: g.char })
      : t("board", { char: g.char, n: trace.stroke + 1, total: g.strokes.length }));
  }

  function renderInk() {
    if (!inkLine) return;
    const pts = trace.strokes[trace.stroke].slice(0, trace.at + 1);
    inkLine.setAttribute("points", pts.length > 1 ? toPoints(pts) : "");
  }

  // The green dot sits where the finger has to go next, numbered with the stroke and with an
  // arrow pointing the way.
  function renderStart() {
    const at = TRACE.current(trace);
    const ahead = TRACE.heading(trace);
    const angle = Math.atan2(ahead[1] - at[1], ahead[0] - at[0]) * (180 / Math.PI);
    const start = svgEl("g", { class: "start", id: "start" }, board);
    const arrow = svgEl("g", { transform: "translate(" + at[0] + " " + at[1] + ") rotate(" + angle.toFixed(1) + ")" }, start);
    svgEl("path", { class: "arrow", d: "M10 -4.5 L17 0 L10 4.5 Z" }, arrow);
    const dot = svgEl("g", { class: "dot", transform: "translate(" + at[0] + " " + at[1] + ")" }, start);
    svgEl("circle", { r: 6.5 }, dot);
    const label = svgEl("text", { y: 0.4 }, dot);
    label.textContent = String(trace.stroke + 1);
  }

  function renderCaption() {
    const caption = $("caption");
    caption.replaceChildren();
    caption.classList.toggle("is-done", trace.done);
    const span = (cls, text) => {
      const el = document.createElement("span");
      el.className = cls;
      el.textContent = text;
      caption.append(el);
      return el;
    };
    if (!trace.done) {
      span("caption-prompt", t(message));
      return;
    }
    const char = glyph().char;
    span("caption-char", char);
    if (isLetter()) {
      const [word, emoji] = WORDS[KIDS.prefs.lang][char];
      span("caption-emoji", emoji).setAttribute("aria-hidden", "true");
      span("caption-word", word);
    } else {
      span("caption-word", KIDS.numberWord(Number(char)));
      if (COUNTED[char]) span("caption-things", COUNTED[char].repeat(Number(char))).setAttribute("aria-hidden", "true");
    }
  }

  function renderSteps() {
    const done = new Set(saved.done[saved.mode]);
    const steps = $("steps");
    steps.setAttribute("aria-label", t(saved.mode));
    steps.replaceChildren(...glyphs().map((g, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "step" + (done.has(g.char) ? " is-done" : "") + (i === saved.index[saved.mode] ? " is-current" : "");
      btn.textContent = g.char;
      btn.setAttribute("aria-label", t(isLetter() ? "stepLetter" : "stepNumber", { char: g.char }));
      if (i === saved.index[saved.mode]) btn.setAttribute("aria-current", "step");
      btn.addEventListener("click", () => choose(i));
      return btn;
    }));
    const current = steps.querySelector(".is-current");
    if (current && typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function renderModes() {
    document.querySelectorAll(".mode").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === saved.mode)));
  }

  function renderButtons() {
    $("btnNext").hidden = !trace.done;
    $("btnNext").classList.toggle("is-nudging", trace.done);
  }

  function renderAll() {
    renderModes();
    renderSteps();
    renderBoard();
    renderCaption();
    renderButtons();
  }

  // ---- tracing -----------------------------------------------------------------------

  function toBox(e) {
    const ctm = board.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }

  function say(text) {
    message = text;
    renderCaption();
  }

  function nudgeStart() {
    const start = $("start");
    if (start) KIDS.flashClass(start, "is-wobbling");
  }

  function endDrawing() {
    if (!drawing) return;
    if (board.hasPointerCapture(drawing.id)) board.releasePointerCapture(drawing.id);
    drawing = null;
    board.classList.remove("is-drawing");
  }

  function onStatus(status) {
    if (status === "off") {
      KIDS.sfx.boop();
      renderBoard();
      say("off");
      nudgeStart();
    } else if (status === "stroke") {
      KIDS.sfx.pop();
      renderBoard();
      say("nextStroke");
    } else if (status === "done") {
      finish();
    }
  }

  function finish() {
    const char = glyph().char;
    const done = saved.done[saved.mode];
    if (!done.includes(char)) done.push(char);
    persist();
    renderAll();
    KIDS.sfx.fanfare();
    KIDS.burst(KIDS.centerOf(board), INKS.map((id) => MIX.toHex(MIX.NAMED_BY_ID[id].rgb)), 24);
    if (isLetter()) {
      const name = KIDS.prefs.lang === "id" ? LETTER_NAMES_ID[char] : char;
      KIDS.speak(t("sayLetter", { name, word: WORDS[KIDS.prefs.lang][char][0] }), 250);
    } else {
      KIDS.speak(KIDS.numberWord(Number(char)), 250);
    }
  }

  board.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    stopDemo();
    if (trace.done) return;
    const p = toBox(e);
    if (!TRACE.canStart(trace, p)) {
      KIDS.sfx.boop();
      say(trace.at > 0 ? "keepGoing" : "start");
      nudgeStart();
      return;
    }
    e.preventDefault();
    drawing = { id: e.pointerId, last: p };
    board.setPointerCapture(e.pointerId);
    board.classList.add("is-drawing");
  });

  board.addEventListener("pointermove", (e) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    // Coalesced events keep a fast stroke from cutting corners between animation frames.
    const moves = typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
    for (const move of moves) {
      const p = toBox(move);
      const r = TRACE.follow(trace, drawing.last, p);
      drawing.last = p;
      trace = r.state;
      if (r.status !== "on") {
        endDrawing();
        onStatus(r.status);
        return;
      }
    }
    renderInk();
  });

  const lift = (e) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    endDrawing();
    if (!trace.done && trace.at > 0) {
      renderBoard();
      say("keepGoing");
    }
  };
  board.addEventListener("pointerup", lift);
  board.addEventListener("pointercancel", lift);

  // ---- watch: a pen writes the glyph once, stroke by stroke -----------------------------

  function stopDemo() {
    if (!demo) return;
    cancelAnimationFrame(demo.frame);
    clearTimeout(demo.timer);
    demo = null;
    if (demoLayer) demoLayer.replaceChildren();
    board.classList.remove("is-watching");
  }

  function watch() {
    stopDemo();
    endDrawing();
    const strokes = TRACE.create(glyph()).strokes;
    // Each stroke's start time and length in ms, pauses included.
    const plan = [];
    let clock = 0;
    for (const pts of strokes) {
      const ms = KIDS.reducedMotion.matches ? 0 : ((pts.length - 1) * TRACE.STEP / DEMO_SPEED) * 1000;
      plan.push({ pts, from: clock, ms });
      clock += ms + (KIDS.reducedMotion.matches ? 700 : DEMO_PAUSE);
    }
    const lines = strokes.map(() => svgEl("polyline", { points: "" }, demoLayer));
    const pen = svgEl("circle", { class: "pen", r: 4.5 }, demoLayer);
    board.classList.add("is-watching");
    const began = performance.now();
    demo = { frame: 0, timer: 0 };
    const tick = (now) => {
      const elapsed = now - began;
      let tip = null;
      plan.forEach((s, i) => {
        if (elapsed < s.from) return;
        const share = s.ms === 0 ? 1 : Math.min(1, (elapsed - s.from) / s.ms);
        const upTo = Math.round(share * (s.pts.length - 1));
        lines[i].setAttribute("points", toPoints(s.pts.slice(0, upTo + 1)));
        if (share < 1 || elapsed < s.from + s.ms + DEMO_PAUSE) tip = s.pts[upTo];
      });
      if (tip) {
        pen.setAttribute("cx", tip[0]);
        pen.setAttribute("cy", tip[1]);
      }
      pen.style.display = tip ? "" : "none";
      if (elapsed < clock) demo.frame = requestAnimationFrame(tick);
      else demo.timer = setTimeout(stopDemo, 500);
    };
    demo.frame = requestAnimationFrame(tick);
  }

  // ---- choosing ------------------------------------------------------------------------

  function reset() {
    stopDemo();
    endDrawing();
    trace = TRACE.create(glyph());
    message = "start";
    renderAll();
  }

  function sayName() {
    const char = glyph().char;
    if (!isLetter()) KIDS.speak(KIDS.numberWord(Number(char)), 0);
    else KIDS.speak(KIDS.prefs.lang === "id" ? LETTER_NAMES_ID[char] : char, 0);
  }

  function choose(i) {
    saved.index[saved.mode] = i;
    persist();
    reset();
    KIDS.sfx.tap();
    sayName();
  }

  function setMode(mode) {
    if (mode === saved.mode) return;
    saved.mode = mode;
    persist();
    reset();
    sayName();
  }

  document.querySelectorAll(".mode").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  $("btnAgain").addEventListener("click", reset);
  $("btnWatch").addEventListener("click", watch);
  $("btnNext").addEventListener("click", () => choose((saved.index[saved.mode] + 1) % glyphs().length));

  function fitBoard() {
    const style = getComputedStyle(paper);
    const w = paper.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = paper.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    board.style.setProperty("--size", Math.max(0, Math.floor(Math.min(w, h))) + "px");
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(fitBoard).observe(paper);
  else window.addEventListener("resize", fitBoard);

  KIDS.bindHeader();
  KIDS.onPrefs(() => {
    KIDS.applyText(t);
    renderAll();
  });
  KIDS.applyText(t);
  renderAll();
  fitBoard();
})();
