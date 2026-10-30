// Lanjutkan Pola controller: deals rounds from js/patterns.js onto the bead string, checks the
// beads a kid taps in the tray, and saves cleared levels. Colors and their names come from
// color-fusion/js/mix.js; speech, sound and the header toggles from shared/kids/kids.js.
(function () {
  "use strict";
  const MIX = window.MIX;
  const KIDS = window.KIDS;
  const P = window.PATTERNS;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "patterns.v1";
  const FLIGHT_MS = 380;
  const NEXT_ROUND_MS = 1600;
  const NEXT_LEVEL_MS = 2200;
  const HINT_AFTER_MISSES = 2;

  const STRINGS = {
    id: {
      title: "Lanjutkan Pola",
      levels: "Tingkat",
      level: "Tingkat {n}",
      levelLocked: "Tingkat {n}, belum terbuka",
      prompt: "Apa selanjutnya?",
      listen: "Dengar",
      tray: "Manik-manik",
      string: "Untaian manik-manik: {beads}",
      empty: "kosong",
      tryAgain: "Coba lagi",
      great: "Hebat!",
      levelDone: "Tingkat {n} selesai!",
      allDone: "Semua tingkat selesai!",
      both: "{shape} {color}",
      circle: "lingkaran",
      square: "kotak",
      triangle: "segitiga",
      heart: "hati",
    },
    en: {
      title: "What Comes Next?",
      levels: "Levels",
      level: "Level {n}",
      levelLocked: "Level {n}, still locked",
      prompt: "What comes next?",
      listen: "Listen",
      tray: "Beads",
      string: "String of beads: {beads}",
      empty: "empty",
      tryAgain: "Try again",
      great: "Well done!",
      levelDone: "Level {n} done!",
      allDone: "Every level done!",
      both: "{color} {shape}",
      circle: "circle",
      square: "square",
      triangle: "triangle",
      heart: "heart",
    },
  };
  const t = KIDS.translator(STRINGS);

  // ---- saved progress ----------------------------------------------------------

  function loadSave() {
    const data = KIDS.load(STORE_KEY);
    const ids = new Set(P.LEVELS.map((l) => l.id));
    return { cleared: data && Array.isArray(data.cleared) ? data.cleared.filter((id) => ids.has(id)) : [] };
  }

  const save = loadSave();
  const persist = () => KIDS.save(STORE_KEY, save);

  // ---- state ----------------------------------------------------------------------

  let levelIndex = firstOpenLevel();
  let roundNo = 0;
  let round = null;
  let slot = 0;
  let misses = 0;
  let busy = false;
  let pendingTimer = null;
  let roundId = 0;
  let flight = null;

  const stringEl = $("string");
  const trayEl = $("tray");

  const level = () => P.LEVELS[levelIndex];
  const isCleared = (i) => save.cleared.includes(P.LEVELS[i].id);
  const isUnlocked = (i) => i === 0 || isCleared(i) || isCleared(i - 1);
  const colorHex = (id) => MIX.toHex(MIX.NAMED_BY_ID[id].rgb);

  function firstOpenLevel() {
    const i = P.LEVELS.findIndex((l) => !save.cleared.includes(l.id));
    return i === -1 ? 0 : i;
  }

  // Names only what tells the beads apart, so "red, blue, red, blue" rather than
  // "red circle, blue circle...".
  function beadName(bead, vary) {
    const color = MIX.NAMED_BY_ID[bead.color].name[KIDS.prefs.lang].toLowerCase();
    const shape = t(bead.shape);
    if (vary === "color") return color;
    if (vary === "shape") return shape;
    return t("both", { color, shape });
  }

  // ---- beads ------------------------------------------------------------------------

  // Drawn in a 40×40 box; `shine` is where the light catches each shape.
  const SHAPES = {
    circle: { tag: "circle", attrs: { cx: 20, cy: 20, r: 17 }, shine: [13, 12] },
    square: { tag: "rect", attrs: { x: 4, y: 4, width: 32, height: 32, rx: 7 }, shine: [12, 11] },
    triangle: { tag: "path", attrs: { d: "M20 3.5 L37.2 33.6 Q38 36 35.4 36 H4.6 Q2 36 2.8 33.6 Z" }, shine: [16, 21] },
    heart: {
      tag: "path",
      attrs: { d: "M20 36 C8 27.5 2.5 21 2.5 13.2 C2.5 7.6 6.8 3.6 11.9 3.6 C15.3 3.6 18.3 5.5 20 8.7 C21.7 5.5 24.7 3.6 28.1 3.6 C33.2 3.6 37.5 7.6 37.5 13.2 C37.5 21 32 27.5 20 36 Z" },
      shine: [10, 11],
    },
  };

  const svgEl = KIDS.svgEl;

  function beadSvg(bead) {
    const shape = SHAPES[bead.shape];
    const svg = svgEl("svg", { viewBox: "0 0 40 40", "aria-hidden": "true" });
    svg.append(svgEl(shape.tag, Object.assign({ fill: colorHex(bead.color) }, shape.attrs)));
    const [x, y] = shape.shine;
    svg.append(svgEl("ellipse", { cx: x, cy: y, rx: 5, ry: 3, fill: "#fff", opacity: 0.45, transform: "rotate(-35 " + x + " " + y + ")" }));
    return svg;
  }

  function fly(fromEl, toEl, bead, done) {
    if (KIDS.reducedMotion.matches) { done(); return; }
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "flying";
    ghost.style.left = from.left + "px";
    ghost.style.top = from.top + "px";
    ghost.style.width = from.width + "px";
    ghost.style.height = from.height + "px";
    ghost.append(beadSvg(bead));
    document.body.appendChild(ghost);
    if (typeof ghost.animate !== "function") { ghost.remove(); done(); return; }
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    const anim = ghost.animate([
      { transform: "translate(0, 0) scale(1)" },
      { transform: "translate(" + dx * 0.5 + "px, " + (dy * 0.5 - 60) + "px) scale(" + (1 + scale) / 2 + ")", offset: 0.5 },
      { transform: "translate(" + dx + "px, " + dy + "px) scale(" + scale + ")" },
    ], { duration: FLIGHT_MS, easing: "cubic-bezier(.4,0,.6,1)" });
    flight = anim;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (flight === anim) flight = null;
      ghost.remove();
      done();
    };
    anim.addEventListener("finish", finish);
    anim.addEventListener("cancel", finish);
  }

  // ---- play -------------------------------------------------------------------------

  function later(fn, ms) {
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(fn, ms);
  }

  function speakPattern(delay) {
    const names = round.sequence.slice(0, round.shown).map((b) => beadName(b, level().vary));
    KIDS.speak(names.join(", ") + ". " + t("prompt"), delay);
  }

  function startLevel(i) {
    levelIndex = i;
    roundNo = 0;
    newRound();
  }

  function newRound() {
    clearTimeout(pendingTimer);
    // A bead still in the air belongs to the round being left; its landing must not count here.
    roundId++;
    if (flight) flight.cancel();
    round = P.makeRound(level());
    slot = 0;
    misses = 0;
    busy = false;
    render();
    speakPattern(250);
  }

  function choose(bead, btn) {
    if (busy) return;
    if (!P.sameBead(bead, P.expected(round, slot))) {
      misses++;
      KIDS.sfx.boop();
      KIDS.flashClass(btn, "is-wrong");
      KIDS.speak(t("tryAgain"), 0);
      if (misses >= HINT_AFTER_MISSES) markHint();
      return;
    }
    busy = true;
    const target = stringEl.querySelector(".slot.is-current");
    const id = roundId;
    fly(btn.firstElementChild, target, bead, () => {
      if (id !== roundId) return;
      slot++;
      misses = 0;
      KIDS.sfx.pop();
      render(true);
      if (slot === round.blanks) {
        roundDone();
        return;
      }
      busy = false;
      KIDS.speak(beadName(bead, level().vary), 0);
    });
  }

  function roundDone() {
    roundNo++;
    KIDS.sfx.chime();
    KIDS.burst(KIDS.centerOf(stringEl), round.choices.map((b) => colorHex(b.color)), 22);
    renderRounds();
    if (roundNo < P.ROUNDS_PER_LEVEL) {
      KIDS.speak(t("great"), 150);
      later(newRound, NEXT_ROUND_MS);
      return;
    }
    if (!isCleared(levelIndex)) {
      save.cleared.push(level().id);
      persist();
    }
    renderLevels();
    later(levelDone, 500);
  }

  function levelDone() {
    const done = t("levelDone", { n: levelIndex + 1 });
    KIDS.sfx.fanfare();
    KIDS.toast("⭐ " + done);
    KIDS.speak(t("great") + " " + done, 0);
    if (levelIndex < P.LEVELS.length - 1) {
      later(() => startLevel(levelIndex + 1), NEXT_LEVEL_MS);
      return;
    }
    // Past the last level the kid keeps playing it with fresh beads.
    KIDS.toast("🎉 " + t("allDone"));
    later(() => startLevel(levelIndex), NEXT_LEVEL_MS);
  }

  // ---- rendering ------------------------------------------------------------------------

  function renderLevels() {
    const strip = $("levels");
    strip.replaceChildren(...P.LEVELS.map((_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "step";
      btn.textContent = String(i + 1);
      btn.classList.toggle("is-done", isCleared(i));
      btn.classList.toggle("is-current", i === levelIndex);
      btn.disabled = !isUnlocked(i);
      btn.setAttribute("aria-label", btn.disabled ? t("levelLocked", { n: i + 1 }) : t("level", { n: i + 1 }));
      if (i === levelIndex) btn.setAttribute("aria-current", "step");
      btn.addEventListener("click", () => startLevel(i));
      return btn;
    }));
    const current = strip.children[levelIndex];
    if (current && typeof current.scrollIntoView === "function") {
      current.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  function renderString(justFilled) {
    const filled = round.shown + slot;
    stringEl.style.setProperty("--count", String(round.sequence.length));
    stringEl.replaceChildren(...round.sequence.map((bead, i) => {
      const place = document.createElement("div");
      place.className = "place";
      if (i < filled) {
        const el = document.createElement("div");
        el.className = "bead" + (justFilled && i === filled - 1 ? " is-new" : "");
        el.append(beadSvg(bead));
        place.append(el);
      } else {
        const hole = document.createElement("div");
        hole.className = "slot" + (i === filled ? " is-current" : "");
        hole.textContent = "?";
        place.append(hole);
      }
      return place;
    }));
    const names = round.sequence.map((b, i) => (i < filled ? beadName(b, level().vary) : t("empty")));
    stringEl.setAttribute("aria-label", t("string", { beads: names.join(", ") }));
  }

  function renderRounds() {
    $("rounds").replaceChildren(...Array.from({ length: P.ROUNDS_PER_LEVEL }, (_, i) => {
      const dot = document.createElement("span");
      dot.className = "round-dot" + (i < roundNo ? " is-done" : "");
      return dot;
    }));
  }

  function renderTray() {
    const hinted = misses >= HINT_AFTER_MISSES && slot < round.blanks ? P.expected(round, slot) : null;
    trayEl.replaceChildren(...round.choices.map((bead) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (hinted && P.sameBead(bead, hinted) ? " is-hinted" : "");
      btn.setAttribute("aria-label", beadName(bead, "both"));
      btn.append(beadSvg(bead));
      btn.addEventListener("click", () => choose(bead, btn));
      return btn;
    }));
  }

  // Marks the right bead in place, so the bead just tapped keeps its wobble.
  function markHint() {
    const want = P.expected(round, slot);
    trayEl.querySelectorAll(".choice").forEach((btn, i) => btn.classList.toggle("is-hinted", P.sameBead(round.choices[i], want)));
  }

  function render(justFilled) {
    renderString(justFilled);
    renderRounds();
    renderTray();
    if (!justFilled) renderLevels();
  }

  // ---- wiring ---------------------------------------------------------------------------

  $("btnListen").addEventListener("click", () => speakPattern(0));

  KIDS.bindHeader();
  KIDS.onPrefs(() => {
    KIDS.applyText(t);
    render();
  });
  KIDS.applyText(t);
  newRound();
})();
