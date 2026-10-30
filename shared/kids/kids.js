// Shared plumbing for the Kids games: language and sound preferences (set once, used by
// every Kids game), game saves, spoken words, synthesized sound effects, the header
// toggles, toasts and confetti. Browser-only; each game's own logic stays in its folder.
(function () {
  "use strict";

  const PREFS_KEY = "kids.prefs.v1";
  const SPEAK_DELAY_MS = 450;
  const TOAST_MS = 2200;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---- storage ----------------------------------------------------------------------

  function load(key) {
    let raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch (err) {
      console.warn("Kids games: saved data is unavailable, starting fresh", err);
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Kids games: saved " + key + " is unreadable, starting fresh", err);
      return null;
    }
  }

  function save(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("Kids games: couldn't save " + key, err);
    }
  }

  // ---- preferences ------------------------------------------------------------------

  function defaultLang() {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    return langs.some((l) => /^id\b/i.test(l)) ? "id" : "en";
  }

  const storedPrefs = load(PREFS_KEY);
  const prefs = {
    lang: storedPrefs && (storedPrefs.lang === "id" || storedPrefs.lang === "en") ? storedPrefs.lang : defaultLang(),
    sound: !storedPrefs || storedPrefs.sound !== false,
  };
  const prefListeners = [];

  function setPrefs(patch) {
    if (patch.lang !== undefined) prefs.lang = patch.lang === "en" ? "en" : "id";
    if (patch.sound !== undefined) prefs.sound = Boolean(patch.sound);
    save(PREFS_KEY, prefs);
    stopSpeech();
    renderHeader();
    prefListeners.forEach((fn) => fn(prefs));
  }

  function onPrefs(fn) { prefListeners.push(fn); }

  // ---- text ---------------------------------------------------------------------------

  function translator(strings) {
    return function t(key, vars) {
      const text = strings[prefs.lang][key];
      if (text === undefined) throw new Error("Kids games: no '" + key + "' text in " + prefs.lang);
      return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : text;
    };
  }

  // Fills every [data-i18n] element's text and [data-i18n-label] element's aria-label.
  function applyText(t) {
    document.documentElement.lang = prefs.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nLabel)); });
  }

  const NUMBER_WORDS = {
    id: ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas", "dua belas"],
    en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  };

  function numberWord(n) {
    return NUMBER_WORDS[prefs.lang][n] || String(n);
  }

  // ---- header toggles -------------------------------------------------------------------

  function renderHeader() {
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === prefs.lang));
    });
    const soundBtn = document.getElementById("btnSound");
    if (soundBtn) soundBtn.setAttribute("aria-pressed", String(prefs.sound));
    const icon = document.getElementById("soundIcon");
    if (icon) icon.textContent = prefs.sound ? "🔊" : "🔇";
  }

  function bindHeader() {
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.lang !== prefs.lang) setPrefs({ lang: btn.dataset.lang });
      });
    });
    const soundBtn = document.getElementById("btnSound");
    if (soundBtn) soundBtn.addEventListener("click", () => setPrefs({ sound: !prefs.sound }));
    renderHeader();
  }

  // ---- sound effects --------------------------------------------------------------------

  let audioCtx = null;
  let audioBroken = false;

  // Null when sound is off or the browser has no Web Audio.
  function audio() {
    if (!prefs.sound || audioBroken) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { audioBroken = true; return null; }
      try {
        audioCtx = new Ctx();
      } catch (err) {
        console.warn("Kids games: sound effects are unavailable", err);
        audioBroken = true;
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((err) => console.warn("Kids games: couldn't resume audio", err));
    }
    return audioCtx;
  }

  function tone(freq, endFreq, startIn, duration, type, volume) {
    const ctx = audio();
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

  const sfx = {
    pop: () => tone(560 + Math.random() * 120, 170, 0, 0.14, "sine", 0.25),
    tap: () => tone(880, 660, 0, 0.08, "triangle", 0.12),
    boop: () => tone(190, 120, 0, 0.22, "square", 0.06),
    chime: () => [659, 880, 1319].forEach((f, i) => tone(f, f, i * 0.1, 0.35, "triangle", 0.18)),
    fanfare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, i * 0.09, 0.4, "triangle", 0.16)),
  };

  // ---- speech -----------------------------------------------------------------------------

  let voices = [];
  let speakTimer = null;
  const canSpeak = "speechSynthesis" in window;

  function refreshVoices() { voices = window.speechSynthesis.getVoices(); }

  if (canSpeak) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    }
  }

  function speakNow(text) {
    if (!prefs.sound || !canSpeak) return;
    const tag = prefs.lang === "id" ? "id-id" : "en-us";
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = tag;
    const norm = (v) => v.lang.replace("_", "-").toLowerCase();
    const voice = voices.find((v) => norm(v) === tag) || voices.find((v) => norm(v).startsWith(prefs.lang));
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.pitch = 1.15;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  // Debounced so rapid taps only say the last thing.
  function speak(text, delay) {
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => speakNow(text), delay === undefined ? SPEAK_DELAY_MS : delay);
  }

  function stopSpeech() {
    clearTimeout(speakTimer);
    if (canSpeak) window.speechSynthesis.cancel();
  }

  // iOS only lets audio and speech start from inside a user gesture; once they've been
  // started there, later delayed calls (like a debounced color name) are allowed.
  function unlockMedia() {
    audio();
    if (canSpeak && prefs.sound) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
  document.addEventListener("pointerdown", unlockMedia, { once: true, capture: true });
  document.addEventListener("keydown", unlockMedia, { once: true, capture: true });

  // ---- effects ------------------------------------------------------------------------------

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function burst(origin, colors, count) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("div");
      bit.className = "confetti";
      bit.style.background = colors[i % colors.length];
      bit.style.left = origin.x + "px";
      bit.style.top = origin.y + "px";
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

  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, TOAST_MS);
  }

  window.KIDS = {
    prefs,
    hasSavedPrefs: storedPrefs !== null,
    reducedMotion,
    load,
    save,
    setPrefs,
    onPrefs,
    translator,
    applyText,
    numberWord,
    bindHeader,
    audio,
    tone,
    sfx,
    speak,
    stopSpeech,
    centerOf,
    burst,
    flashClass,
    toast,
  };
})();
