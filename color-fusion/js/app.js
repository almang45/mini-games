// Color Fusion controller: wires the pure mixing model (js/mix.js) to the bowl, the paint
// pots, the three modes, speech, sound effects and saved progress in index.html.
(function () {
  "use strict";
  const MIX = window.MIX;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "color-fusion.v1";
  const SPEAK_DELAY_MS = 450;
  const FLIGHT_MS = 420;
  const DRAG_START_PX = 10;
  const TOAST_MS = 2200;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const STRINGS = {
    id: {
      back: "← Semua Game",
      language: "Bahasa",
      sound: "Suara",
      modes: "Mode permainan",
      modeFree: "Bebas",
      modeChallenge: "Tantangan",
      modeBook: "Buku Warna",
      pour: "Tuang cat ke mangkuk",
      almost: "Hampir {name}",
      mystery: "Warna ajaib!",
      full: "Mangkuknya penuh!",
      undo: "Ups",
      undoLabel: "Ambil tetes terakhir",
      empty: "Kosongkan",
      hint: "Petunjuk",
      next: "Lanjut",
      makeThis: "Buat warna ini",
      letsMake: "Ayo buat warna {name}!",
      great: "Hebat! {name}!",
      newColor: "Warna baru! {name}",
      allDone: "Semua tantangan selesai!",
      level: "Tantangan {n}",
      levelLocked: "Tantangan {n}, belum terbuka",
      drops: "{n} tetes di mangkuk",
      bookCount: "{n} dari {total} warna ditemukan",
      notFound: "Belum ditemukan",
      reset: "Mulai dari awal",
      resetConfirm: "Hapus semua warna yang ditemukan dan progres tantangan?",
      and: " dan ",
    },
    en: {
      back: "← All Games",
      language: "Language",
      sound: "Sound",
      modes: "Game mode",
      modeFree: "Free play",
      modeChallenge: "Challenges",
      modeBook: "Color book",
      pour: "Pour some paint in the bowl",
      almost: "Almost {name}",
      mystery: "A magic color!",
      full: "The bowl is full!",
      undo: "Oops",
      undoLabel: "Take back the last drop",
      empty: "Empty bowl",
      hint: "Hint",
      next: "Next",
      makeThis: "Make this color",
      letsMake: "Can you make {name}?",
      great: "You did it! {name}!",
      newColor: "New color! {name}",
      allDone: "Every challenge done!",
      level: "Challenge {n}",
      levelLocked: "Challenge {n}, still locked",
      drops: "{n} drops in the bowl",
      bookCount: "{n} of {total} colors found",
      notFound: "Not found yet",
      reset: "Start over",
      resetConfirm: "Clear every color found and all challenge progress?",
      and: " and ",
    },
  };

  const NUMBER_WORDS = {
    id: ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas", "dua belas"],
    en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  };

  // ---- saved progress ----------------------------------------------------------

  function defaultLang() {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    return langs.some((l) => /^id\b/i.test(l)) ? "id" : "en";
  }

  function loadSave() {
    const fresh = { lang: defaultLang(), sound: true, discovered: [], cleared: [] };
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (err) {
      console.warn("Color Fusion: saved progress is unavailable, starting fresh", err);
      return fresh;
    }
    if (!raw) return fresh;
    try {
      const data = JSON.parse(raw);
      const levelTargets = new Set(MIX.LEVELS.map((l) => l.target.id));
      return {
        lang: data.lang === "en" || data.lang === "id" ? data.lang : fresh.lang,
        sound: data.sound !== false,
        discovered: Array.isArray(data.discovered) ? data.discovered.filter((id) => MIX.NAMED_BY_ID[id]) : [],
        cleared: Array.isArray(data.cleared) ? data.cleared.filter((id) => levelTargets.has(id)) : [],
      };
    } catch (err) {
      console.warn("Color Fusion: saved progress is unreadable, starting fresh", err);
      return fresh;
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(save));
    } catch (err) {
      console.warn("Color Fusion: couldn't save progress", err);
    }
  }

  const save = loadSave();

  // ---- state ----------------------------------------------------------------------

  // Free play and challenges each keep their own bowl, so peeking at the other tab
  // doesn't throw away a mix.
  const bowls = {
    free: { recipe: MIX.emptyRecipe(), history: [] },
    challenge: { recipe: MIX.emptyRecipe(), history: [] },
  };
  let mode = "free";
  let levelIndex = firstOpenLevel();
  let matched = false;
  let hintShown = false;
  let inFlight = 0;
  let speakTimer = null;
  let toastTimer = null;
  let suppressClickUntil = 0;

  const bowlEl = $("bowl");
  const paintEl = $("paint");
  const mixNameEl = $("mixName");
  const dropsEl = $("drops");
  const shelfEl = $("shelf");
  const btnUndo = $("btnUndo");
  const btnEmpty = $("btnEmpty");
  const btnHint = $("btnHint");
  const btnNext = $("btnNext");
  const potButtons = {};

  const bowl = () => bowls[mode];
  const level = () => MIX.LEVELS[levelIndex];
  const isCleared = (i) => save.cleared.includes(MIX.LEVELS[i].target.id);
  const isUnlocked = (i) => i === 0 || isCleared(i) || isCleared(i - 1);
  const hex = (rgb) => MIX.toHex(rgb);
  const colorName = (named) => named.name[save.lang];

  function firstOpenLevel() {
    const i = MIX.LEVELS.findIndex((l) => !save.cleared.includes(l.target.id));
    return i === -1 ? 0 : i;
  }

  function t(key, vars) {
    const text = STRINGS[save.lang][key];
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : text;
  }

  // ---- sound and speech -------------------------------------------------------------

  let audioCtx = null;
  let audioBroken = false;
  let voices = [];

  function audio() {
    if (audioBroken) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { audioBroken = true; return null; }
      try {
        audioCtx = new Ctx();
      } catch (err) {
        console.warn("Color Fusion: sound effects are unavailable", err);
        audioBroken = true;
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((err) => console.warn("Color Fusion: couldn't resume audio", err));
    }
    return audioCtx;
  }

  function tone(freq, endFreq, startIn, duration, type, volume) {
    const ctx = save.sound && audio();
    if (!ctx) return;
    const start = ctx.currentTime + startIn;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  const playPlop = () => tone(560 + Math.random() * 120, 170, 0, 0.14, "sine", 0.25);
  const playFull = () => tone(190, 120, 0, 0.22, "square", 0.06);
  function playChime() {
    [659, 880, 1319].forEach((f, i) => tone(f, f, i * 0.1, 0.35, "triangle", 0.18));
  }

  function refreshVoices() {
    voices = window.speechSynthesis.getVoices();
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    }
  }

  function speakNow(text) {
    if (!save.sound || !("speechSynthesis" in window)) return;
    const tag = save.lang === "id" ? "id-id" : "en-us";
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = tag;
    const norm = (v) => v.lang.replace("_", "-").toLowerCase();
    const voice = voices.find((v) => norm(v) === tag) || voices.find((v) => norm(v).startsWith(save.lang));
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.pitch = 1.15;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function speak(text, delay) {
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => speakNow(text), delay === undefined ? SPEAK_DELAY_MS : delay);
  }

  function stopSpeech() {
    clearTimeout(speakTimer);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  // iOS only lets audio and speech start from inside a user gesture; once they've been
  // started there, later delayed calls (like the debounced color name) are allowed.
  function unlockMedia() {
    audio();
    if ("speechSynthesis" in window && save.sound) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  }
  document.addEventListener("pointerdown", unlockMedia, { once: true, capture: true });
  document.addEventListener("keydown", unlockMedia, { once: true, capture: true });

  // ---- effects ------------------------------------------------------------------------

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function makeDroplet(pigment) {
    const drop = document.createElement("div");
    drop.className = "droplet" + (pigment === "white" ? " droplet--white" : "");
    drop.style.background = hex(MIX.PIGMENT_RGB[pigment]);
    document.body.appendChild(drop);
    return drop;
  }

  function placeDroplet(drop, x, y) {
    drop.style.left = x + "px";
    drop.style.top = y + "px";
  }

  function flyToBowl(pigment, fromEl, done) {
    if (reducedMotion.matches) { done(); return; }
    const from = centerOf(fromEl);
    const to = centerOf(bowlEl);
    const drop = makeDroplet(pigment);
    placeDroplet(drop, from.x, from.y);
    if (typeof drop.animate !== "function") { drop.remove(); done(); return; }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const anim = drop.animate([
      { transform: "translate(0, 0) scale(0.6)" },
      { transform: "translate(" + dx * 0.5 + "px, " + (dy * 0.5 - 70) + "px) scale(1)", offset: 0.5 },
      { transform: "translate(" + dx + "px, " + dy + "px) scale(0.7)" },
    ], { duration: FLIGHT_MS, easing: "cubic-bezier(.4,0,.7,1)" });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      drop.remove();
      done();
    };
    anim.addEventListener("finish", finish);
    anim.addEventListener("cancel", finish);
  }

  function splash(pigment) {
    if (reducedMotion.matches) return;
    const blob = document.createElement("div");
    blob.className = "splash";
    blob.style.background = hex(MIX.PIGMENT_RGB[pigment]);
    blob.style.left = 33 + (Math.random() * 14 - 7) + "%";
    blob.style.top = 33 + (Math.random() * 14 - 7) + "%";
    paintEl.appendChild(blob);
    if (typeof blob.animate !== "function") { blob.remove(); return; }
    const anim = blob.animate([
      { transform: "scale(0.2) rotate(0deg)", opacity: 1, borderRadius: "50%" },
      { transform: "scale(1.4) rotate(90deg)", opacity: 0.85, borderRadius: "42% 58% 55% 45%", offset: 0.4 },
      { transform: "scale(3) rotate(200deg)", opacity: 0, borderRadius: "50%" },
    ], { duration: 750, easing: "ease-out" });
    anim.addEventListener("finish", () => blob.remove());
    anim.addEventListener("cancel", () => blob.remove());
  }

  // A swirl still spreading from the last bowl would otherwise tint the freshly emptied one.
  function clearSplashes() {
    paintEl.querySelectorAll(".splash").forEach((blob) => blob.remove());
  }

  function burst(colors, count) {
    if (reducedMotion.matches) return;
    const c = centerOf(bowlEl);
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("div");
      bit.className = "confetti";
      bit.style.background = colors[i % colors.length];
      bit.style.left = c.x + "px";
      bit.style.top = c.y + "px";
      document.body.appendChild(bit);
      if (typeof bit.animate !== "function") { bit.remove(); continue; }
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 120 + Math.random() * 110;
      const anim = bit.animate([
        { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
        { transform: "translate(" + Math.cos(angle) * dist + "px, " + (Math.sin(angle) * dist + 40) + "px) scale(1)", opacity: 0 },
      ], { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.4,1)" });
      anim.addEventListener("finish", () => bit.remove());
      anim.addEventListener("cancel", () => bit.remove());
    }
  }

  function flashClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation if it's still running
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, TOAST_MS);
  }

  // ---- mixing ---------------------------------------------------------------------------

  function room() {
    return MIX.MAX_DROPS - MIX.dropCount(bowl().recipe) - inFlight;
  }

  function bowlFull() {
    playFull();
    flashClass(bowlEl, "is-full");
    toast(t("full"));
    speak(t("full"), 0);
  }

  function pourFromPot(pigment, potEl) {
    if (room() <= 0) { bowlFull(); return; }
    inFlight++;
    const target = mode;
    flyToBowl(pigment, potEl, () => {
      inFlight--;
      // The kid may have switched tabs mid-flight; that drop belongs to the bowl it left for.
      if (target === mode) addDrop(pigment);
    });
  }

  function addDrop(pigment) {
    const b = bowl();
    if (MIX.dropCount(b.recipe) >= MIX.MAX_DROPS) { bowlFull(); return; }
    b.recipe[pigment]++;
    b.history.push(pigment);
    playPlop();
    splash(pigment);
    afterMixChange();
  }

  function undoDrop() {
    const b = bowl();
    const pigment = b.history.pop();
    if (!pigment) return;
    b.recipe[pigment]--;
    afterMixChange();
  }

  function emptyBowl() {
    const b = bowl();
    b.recipe = MIX.emptyRecipe();
    b.history = [];
    stopSpeech();
    clearSplashes();
    renderBowl();
    if (mode === "challenge" && !matched) nudgeHint();
  }

  function describe(rgb) {
    if (!rgb) return { text: t("pour"), quiet: true, named: null };
    const found = MIX.nearestNamed(rgb);
    if (found.distance <= MIX.MATCH_DISTANCE) return { text: colorName(found.named), quiet: false, named: found.named };
    if (found.distance <= MIX.NEAR_DISTANCE) return { text: t("almost", { name: colorName(found.named) }), quiet: false, named: null };
    return { text: t("mystery"), quiet: false, named: null };
  }

  function afterMixChange() {
    const rgb = MIX.mixRecipe(bowl().recipe);
    const info = renderBowl();
    if (!rgb) { stopSpeech(); return; }

    if (mode === "challenge" && !matched && MIX.distance(rgb, level().target.rgb) <= MIX.MATCH_DISTANCE) {
      completeLevel();
      return;
    }
    if (info.named && discover(info.named)) {
      toast("⭐ " + t("newColor", { name: colorName(info.named) }));
      burst([hex(info.named.rgb)], 12);
      speak(t("newColor", { name: colorName(info.named) }), 150);
      return;
    }
    speak(info.text);
  }

  function discover(named) {
    if (save.discovered.includes(named.id)) return false;
    save.discovered.push(named.id);
    persist();
    return true;
  }

  // ---- challenges ---------------------------------------------------------------------------

  function completeLevel() {
    const target = level().target;
    matched = true;
    discover(target);
    if (!isCleared(levelIndex)) {
      save.cleared.push(target.id);
      persist();
    }
    playChime();
    flashClass(bowlEl, "is-matched");
    const used = MIX.PIGMENTS.filter((p) => bowl().recipe[p] > 0).map((p) => hex(MIX.PIGMENT_RGB[p]));
    burst([hex(target.rgb)].concat(used), 26);
    speak(t("great", { name: colorName(target) }), 150);
    renderChallenge();
  }

  function startLevel(i) {
    levelIndex = i;
    matched = false;
    hintShown = false;
    bowls.challenge = { recipe: MIX.emptyRecipe(), history: [] };
    clearSplashes();
    renderPlay();
    speak(t("letsMake", { name: colorName(level().target) }), 200);
  }

  function nextLevel() {
    if (levelIndex < MIX.LEVELS.length - 1) {
      startLevel(levelIndex + 1);
      return;
    }
    toast("🎉 " + t("allDone"));
    speak(t("allDone"), 0);
  }

  function recipeSpeech(recipe) {
    const parts = MIX.PIGMENTS.filter((p) => recipe[p] > 0)
      .map((p) => NUMBER_WORDS[save.lang][recipe[p]] + " " + colorName(MIX.NAMED_BY_ID[p]).toLowerCase());
    return parts.join(t("and"));
  }

  function showHint() {
    hintShown = true;
    btnHint.classList.remove("is-nudging");
    renderChallenge();
    speak(recipeSpeech(level().target.recipe), 0);
  }

  function nudgeHint() {
    if (!hintShown) btnHint.classList.add("is-nudging");
  }

  // ---- rendering ------------------------------------------------------------------------------

  function dotsInto(el, pigments) {
    el.replaceChildren(...pigments.map((p) => {
      const dot = document.createElement("span");
      dot.className = "dot" + (p === "white" ? " dot--white" : "");
      dot.style.background = hex(MIX.PIGMENT_RGB[p]);
      return dot;
    }));
  }

  function recipeSequence(recipe) {
    return MIX.PIGMENTS.flatMap((p) => Array(recipe[p]).fill(p));
  }

  function renderBowl() {
    const b = bowl();
    const rgb = MIX.mixRecipe(b.recipe);
    paintEl.style.backgroundColor = rgb ? hex(rgb) : "";
    const info = describe(rgb);
    mixNameEl.textContent = info.text;
    mixNameEl.classList.toggle("is-quiet", info.quiet);
    dotsInto(dropsEl, b.history);
    dropsEl.setAttribute("aria-label", t("drops", { n: b.history.length }));
    btnUndo.disabled = b.history.length === 0;
    btnEmpty.disabled = b.history.length === 0;
    if (b.history.length >= MIX.MAX_DROPS - 1 && mode === "challenge" && !matched) nudgeHint();
    return info;
  }

  function renderShelf() {
    const pots = mode === "challenge" ? level().pots : MIX.PIGMENTS;
    const hinted = mode === "challenge" && hintShown && !matched
      ? MIX.PIGMENTS.filter((p) => level().target.recipe[p] > 0) : [];
    shelfEl.hidden = mode === "book";
    for (const p of MIX.PIGMENTS) {
      potButtons[p].hidden = !pots.includes(p);
      potButtons[p].classList.toggle("is-hinted", hinted.includes(p));
    }
  }

  function renderLevels() {
    const strip = $("levels");
    strip.replaceChildren(...MIX.LEVELS.map((lvl, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level";
      btn.textContent = String(i + 1);
      const cleared = isCleared(i);
      btn.classList.toggle("is-cleared", cleared);
      btn.classList.toggle("is-current", i === levelIndex);
      if (cleared) btn.style.background = hex(lvl.target.rgb);
      btn.disabled = !isUnlocked(i);
      btn.setAttribute("aria-label", btn.disabled
        ? t("levelLocked", { n: i + 1 })
        : t("level", { n: i + 1 }) + (cleared ? ", " + colorName(lvl.target) : ""));
      if (i === levelIndex) btn.setAttribute("aria-current", "step");
      btn.addEventListener("click", () => startLevel(i));
      return btn;
    }));
    const current = strip.children[levelIndex];
    if (current && typeof current.scrollIntoView === "function") {
      current.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  function renderChallenge() {
    const target = level().target;
    $("targetSwatch").style.background = hex(target.rgb);
    $("targetName").textContent = colorName(target);
    const hintDots = $("hintDots");
    hintDots.hidden = !hintShown;
    if (hintShown) dotsInto(hintDots, recipeSequence(target.recipe));
    btnHint.hidden = matched || hintShown;
    btnNext.hidden = !matched && !isCleared(levelIndex);
    btnNext.classList.toggle("is-nudging", matched);
    if (matched) mixNameEl.textContent = t("great", { name: colorName(target) });
    renderLevels();
    renderShelf();
  }

  function renderPlay() {
    const challenge = mode === "challenge";
    $("levels").hidden = !challenge;
    $("target").hidden = !challenge;
    btnHint.classList.remove("is-nudging");
    if (challenge) {
      renderBowl();
      renderChallenge();
    } else {
      btnHint.hidden = true;
      btnNext.hidden = true;
      renderBowl();
      renderShelf();
    }
  }

  function renderBook() {
    $("bookCount").textContent = t("bookCount", { n: save.discovered.length, total: MIX.NAMED.length });
    $("bookGrid").replaceChildren(...MIX.NAMED.map((named) => {
      const found = save.discovered.includes(named.id);
      const chip = document.createElement(found ? "button" : "div");
      chip.className = "chip" + (found ? "" : " chip--locked") + (named.id === "white" ? " chip--white" : "");
      const swatch = document.createElement("div");
      swatch.className = "chip-swatch";
      const name = document.createElement("span");
      name.className = "chip-name";
      if (found) {
        chip.type = "button";
        swatch.style.background = hex(named.rgb);
        name.textContent = colorName(named);
        const dots = document.createElement("div");
        dots.className = "dots";
        dotsInto(dots, recipeSequence(named.recipe));
        chip.append(swatch, name, dots);
        chip.addEventListener("click", () => {
          const isPrimary = MIX.dropCount(named.recipe) === 1;
          speak(isPrimary ? colorName(named) : colorName(named) + ". " + recipeSpeech(named.recipe), 0);
        });
      } else {
        swatch.textContent = "?";
        chip.setAttribute("role", "img");
        chip.setAttribute("aria-label", t("notFound"));
        chip.append(swatch);
      }
      return chip;
    }));
  }

  function applyLanguage() {
    document.documentElement.lang = save.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nLabel)); });
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === save.lang));
    });
    btnUndo.setAttribute("aria-label", t("undoLabel"));
    for (const p of MIX.PIGMENTS) {
      potButtons[p].querySelector(".pot-name").textContent = colorName(MIX.NAMED_BY_ID[p]);
    }
    renderMode();
  }

  function renderSound() {
    $("btnSound").setAttribute("aria-pressed", String(save.sound));
    $("soundIcon").textContent = save.sound ? "🔊" : "🔇";
  }

  function renderMode() {
    document.querySelectorAll(".mode").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
    $("screenPlay").hidden = mode === "book";
    $("screenBook").hidden = mode !== "book";
    if (mode === "book") {
      renderBook();
      renderShelf();
    } else {
      renderPlay();
    }
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    stopSpeech();
    clearSplashes();
    renderMode();
    if (mode === "challenge" && MIX.dropCount(bowl().recipe) === 0) {
      speak(t("letsMake", { name: colorName(level().target) }), 200);
    }
  }

  // ---- paint pots: tap to pour, or drag a drop onto the bowl ------------------------------------

  function overBowl(x, y) {
    const c = centerOf(bowlEl);
    return Math.hypot(x - c.x, y - c.y) <= bowlEl.getBoundingClientRect().width / 2;
  }

  function buildPot(pigment) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pot";
    btn.dataset.pigment = pigment;
    btn.style.setProperty("--pigment", hex(MIX.PIGMENT_RGB[pigment]));
    const jar = document.createElement("span");
    jar.className = "jar";
    jar.setAttribute("aria-hidden", "true");
    const lid = document.createElement("span");
    lid.className = "jar-lid";
    const body = document.createElement("span");
    body.className = "jar-body";
    jar.append(lid, body);
    const label = document.createElement("span");
    label.className = "pot-name";
    btn.append(jar, label);

    let drag = null;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null };
    });
    btn.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_START_PX) return;
        btn.setPointerCapture(e.pointerId);
        drag.ghost = makeDroplet(pigment);
      }
      placeDroplet(drag.ghost, e.clientX, e.clientY - 28);
      bowlEl.classList.toggle("is-drop-target", overBowl(e.clientX, e.clientY));
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const ghost = drag.ghost;
      drag = null;
      if (!ghost) return; // a plain tap: the click handler pours
      suppressClickUntil = performance.now() + 400;
      ghost.remove();
      bowlEl.classList.remove("is-drop-target");
      if (e.type === "pointerup" && overBowl(e.clientX, e.clientY)) {
        if (room() <= 0) bowlFull(); else addDrop(pigment);
      }
    };
    btn.addEventListener("pointerup", endDrag);
    btn.addEventListener("pointercancel", endDrag);
    btn.addEventListener("click", () => {
      if (performance.now() < suppressClickUntil) return;
      pourFromPot(pigment, jar);
    });

    potButtons[pigment] = btn;
    return btn;
  }

  // ---- wiring ---------------------------------------------------------------------------------

  shelfEl.replaceChildren(...MIX.PIGMENTS.map(buildPot));

  document.querySelectorAll(".mode").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (save.lang === btn.dataset.lang) return;
      save.lang = btn.dataset.lang;
      persist();
      stopSpeech();
      applyLanguage();
    });
  });
  $("btnSound").addEventListener("click", () => {
    save.sound = !save.sound;
    persist();
    if (!save.sound) stopSpeech();
    renderSound();
  });
  btnUndo.addEventListener("click", undoDrop);
  btnEmpty.addEventListener("click", emptyBowl);
  btnHint.addEventListener("click", showHint);
  btnNext.addEventListener("click", nextLevel);
  $("btnReset").addEventListener("click", () => {
    if (!window.confirm(t("resetConfirm"))) return;
    save.discovered = [];
    save.cleared = [];
    persist();
    levelIndex = 0;
    matched = false;
    hintShown = false;
    bowls.challenge = { recipe: MIX.emptyRecipe(), history: [] };
    clearSplashes();
    renderMode();
  });

  renderSound();
  applyLanguage();
})();
