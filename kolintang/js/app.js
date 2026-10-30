// Kolintang Warna controller: draws the bars from js/kolintang.js, rings them with Web Audio,
// and runs the three modes (free play, follow-a-song, copy me). Colors and their names come
// from color-fusion/js/mix.js; speech and the header toggles from shared/kids/kids.js.
(function () {
  "use strict";
  const MIX = window.MIX;
  const KIDS = window.KIDS;
  const K = window.KOLINTANG;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "kolintang.v1";
  const SONG_BPM = 100;
  const ECHO_NOTE_MS = 620;
  const ECHO_PAUSE_MS = 1300;
  const SONG_REPLAY_MS = 2600;
  const LIT_MS = 260;
  // A struck wooden bar: the fundamental rings longest, the overtones (tuned two octaves and
  // a bit over three above, as on a marimba) give the knock of the mallet and die fast.
  const PARTIALS = [[1, 0.4, 1.3], [4, 0.09, 0.32], [10, 0.03, 0.08]];

  const STRINGS = {
    id: {
      title: "Kolintang Warna",
      modes: "Mode permainan",
      modeFree: "Bebas",
      modeSongs: "Lagu",
      modeEcho: "Tiru",
      bars: "Bilah kolintang",
      bar: "{sol}, {color}",
      tapBars: "Ketuk bilahnya!",
      songs: "Pilih lagu",
      songDone: "selesai",
      follow: "Ikuti bilah yang menyala!",
      listening: "Dengarkan…",
      great: "Hebat!",
      songFinished: "Hebat! Lagu {title} selesai!",
      echoListen: "Dengarkan, lalu tiru!",
      echoTurn: "Giliranmu!",
      echoAgain: "Coba lagi. Dengarkan sekali lagi.",
      echoBest: "Rekor: {n} nada",
      echoLonger: "Hebat! Sekarang {n} nada.",
      listen: "Dengar",
      restart: "Ulangi",
    },
    en: {
      title: "Color Kolintang",
      modes: "Game mode",
      modeFree: "Free play",
      modeSongs: "Songs",
      modeEcho: "Copy me",
      bars: "Kolintang bars",
      bar: "{sol}, {color}",
      tapBars: "Tap the bars!",
      songs: "Pick a song",
      songDone: "done",
      follow: "Follow the glowing bar!",
      listening: "Listen…",
      great: "Well done!",
      songFinished: "Well done! You played {title}!",
      echoListen: "Listen, then copy me!",
      echoTurn: "Your turn!",
      echoAgain: "Try again. Listen once more.",
      echoBest: "Best: {n} notes",
      echoLonger: "Well done! Now {n} notes.",
      listen: "Listen",
      restart: "Start over",
    },
  };
  const t = KIDS.translator(STRINGS);

  // ---- saved progress ----------------------------------------------------------

  function loadSave() {
    const data = KIDS.load(STORE_KEY) || {};
    return {
      songsDone: Array.isArray(data.songsDone) ? data.songsDone.filter((id) => K.SONGS_BY_ID[id]) : [],
      bestEcho: Number.isInteger(data.bestEcho) && data.bestEcho > 0 ? data.bestEcho : 0,
    };
  }

  const save = loadSave();
  const persist = () => KIDS.save(STORE_KEY, save);

  // ---- state ----------------------------------------------------------------------

  let mode = "free";
  let song = K.SONGS[0];
  let songPos = 0;
  let echo = [];
  let echoTaps = [];
  let echoTurn = false;
  let playing = false;
  let lastBar = -1;
  let timers = [];
  const pointerBars = new Map();
  const barEls = [];

  const colorName = (bar) => MIX.NAMED_BY_ID[bar.color].name[KIDS.prefs.lang];
  const barHex = (bar) => MIX.toHex(MIX.NAMED_BY_ID[bar.color].rgb);

  // Dark text on the pale bars (yellow, pink), white on the rest.
  function textOn(bar) {
    const [l] = MIX.toOklab(MIX.NAMED_BY_ID[bar.color].rgb);
    return l > 0.78 ? "#22324b" : "#ffffff";
  }

  // The high do is 1 with a dot above. A combining dot lands in a different place in every
  // font, so the dot is drawn by CSS instead.
  function setNumber(el, bar) {
    const high = bar.number.endsWith("\u0307");
    el.textContent = high ? bar.number.slice(0, -1) : bar.number;
    el.classList.toggle("is-high", high);
  }

  // ---- sound and light ---------------------------------------------------------------

  function ring(index) {
    const ctx = KIDS.audio();
    if (!ctx) return;
    const freq = K.frequency(K.BARS[index].midi);
    const now = ctx.currentTime;
    for (const [ratio, level, decay] of PARTIALS) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  }

  function light(index, ms) {
    const el = barEls[index];
    el.classList.add("is-lit");
    later(() => el.classList.remove("is-lit"), ms || LIT_MS);
  }

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers = timers.filter((x) => x !== id);
      fn();
    }, ms);
    timers.push(id);
  }

  function stopPlayback() {
    timers.forEach(clearTimeout);
    timers = [];
    playing = false;
    barEls.forEach((el) => el.classList.remove("is-lit"));
  }

  // Plays bars one after another, lighting each; `done` runs after the last one rings.
  function playSequence(entries, done) {
    stopPlayback();
    playing = true;
    for (const entry of entries) {
      later(() => {
        ring(entry.bar);
        light(entry.bar, Math.min(entry.duration * 0.8, 420));
      }, entry.at);
    }
    const last = entries[entries.length - 1];
    later(() => {
      playing = false;
      done();
    }, last.at + last.duration);
  }

  // ---- striking a bar ------------------------------------------------------------------

  function strike(index) {
    ring(index);
    KIDS.flashClass(barEls[index], "is-struck");
    // During a demo the bars still sound, but taps don't count towards the song or the copy.
    if (playing) return;
    if (mode === "free") {
      lastBar = index;
      renderReadout();
    }
    else if (mode === "songs") followSong(index);
    else if (echoTurn) copyEcho(index);
  }

  function renderReadout() {
    const readNum = $("readNum");
    if (lastBar < 0) {
      readNum.textContent = "";
      $("readSol").textContent = t("tapBars");
      $("readColor").textContent = "";
      return;
    }
    const bar = K.BARS[lastBar];
    setNumber(readNum, bar);
    readNum.style.setProperty("--note", barHex(bar));
    $("readSol").textContent = bar.solfege[KIDS.prefs.lang];
    $("readColor").textContent = colorName(bar);
  }

  // ---- songs ----------------------------------------------------------------------------

  function chooseSong(next) {
    stopPlayback();
    song = next;
    songPos = 0;
    renderSongs();
    renderScore();
    $("songStatus").textContent = t("follow");
    KIDS.speak(song.title[KIDS.prefs.lang] + ". " + t("follow"), 200);
  }

  function followSong(index) {
    // The timed reset after a finished song can be cancelled (Dengar stops every timer), so
    // a tap on a finished song starts it again.
    if (songPos >= song.notes.length) songPos = 0;
    const step = K.follow(song, songPos, index);
    if (!step.correct) return;
    songPos = step.position;
    renderScore();
    if (!step.done) return;
    if (!save.songsDone.includes(song.id)) {
      save.songsDone.push(song.id);
      persist();
    }
    const done = t("songFinished", { title: song.title[KIDS.prefs.lang] });
    $("songStatus").textContent = done;
    later(() => {
      KIDS.sfx.fanfare();
      KIDS.burst(KIDS.centerOf($("kolintang")), K.BARS.map(barHex), 30);
      KIDS.speak(done, 300);
      renderSongs();
    }, 500);
    later(() => {
      songPos = 0;
      renderScore();
      $("songStatus").textContent = t("follow");
    }, SONG_REPLAY_MS + 500);
  }

  function listenToSong() {
    if (songPos >= song.notes.length) songPos = 0;
    $("songStatus").textContent = t("listening");
    barEls.forEach((el) => el.classList.remove("is-next"));
    playSequence(K.timeline(song.notes, SONG_BPM), () => {
      $("songStatus").textContent = t("follow");
      renderScore();
    });
  }

  // ---- copy me -----------------------------------------------------------------------------

  function echoTimeline() {
    return echo.map((bar, i) => ({ bar, at: i * ECHO_NOTE_MS, duration: ECHO_NOTE_MS }));
  }

  // `message` (praise, or "try again") stays up until the tune starts playing.
  function playEcho(delay, message) {
    echoTurn = false;
    echoTaps = [];
    renderEcho();
    $("echoStatus").textContent = message || t("echoListen");
    stopPlayback();
    later(() => {
      $("echoStatus").textContent = t("echoListen");
      playSequence(echoTimeline(), () => {
        echoTurn = true;
        $("echoStatus").textContent = t("echoTurn");
      });
    }, delay);
  }

  // Past the longest tune, the kid gets a new one of that length rather than an endless one.
  function freshEcho(length) {
    let sequence = K.newEcho();
    while (sequence.length < length) sequence = K.extendEcho(sequence);
    return sequence;
  }

  function startEcho() {
    echo = K.newEcho();
    KIDS.speak(t("echoListen"), 0);
    playEcho(2000);
  }

  function copyEcho(index) {
    echoTaps.push(index);
    const result = K.checkEcho(echo, echoTaps);
    renderEcho();
    if (result === "wait") return;
    echoTurn = false;
    if (result === "wrong") {
      KIDS.sfx.boop();
      KIDS.speak(t("echoAgain"), 300);
      playEcho(ECHO_PAUSE_MS + 900, t("echoAgain"));
      return;
    }
    if (echo.length > save.bestEcho) {
      save.bestEcho = echo.length;
      persist();
    }
    KIDS.sfx.chime();
    KIDS.burst(KIDS.centerOf($("echoDots")), echo.map((bar) => barHex(K.BARS[bar])), 14);
    echo = echo.length < K.ECHO_MAX ? K.extendEcho(echo) : freshEcho(K.ECHO_MAX);
    const longer = t("echoLonger", { n: echo.length });
    KIDS.speak(longer, 300);
    playEcho(ECHO_PAUSE_MS + 900, longer);
  }

  // ---- rendering ----------------------------------------------------------------------------

  function buildBars() {
    const kolintang = $("kolintang");
    const count = K.BARS.length;
    K.BARS.forEach((bar, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bar";
      btn.dataset.index = String(i);
      btn.style.setProperty("--bar", barHex(bar));
      btn.style.setProperty("--on", textOn(bar));
      // Lengths fall from 100% to 62%, like real bars shortening as the pitch rises.
      btn.style.setProperty("--len", String(1 - (0.38 * i) / (count - 1)));
      const num = document.createElement("span");
      num.className = "bar-num";
      setNumber(num, bar);
      const sol = document.createElement("span");
      sol.className = "bar-sol";
      btn.append(num, sol);
      kolintang.append(btn);
      barEls.push(btn);
    });
  }

  function labelBars() {
    K.BARS.forEach((bar, i) => {
      barEls[i].querySelector(".bar-sol").textContent = bar.solfege[KIDS.prefs.lang];
      barEls[i].setAttribute("aria-label", t("bar", { sol: bar.solfege[KIDS.prefs.lang], color: colorName(bar) }));
    });
  }

  function renderSongs() {
    $("songs").replaceChildren(...K.SONGS.map((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song";
      btn.setAttribute("aria-pressed", String(s === song));
      btn.textContent = s.title[KIDS.prefs.lang];
      if (save.songsDone.includes(s.id)) {
        const star = document.createElement("span");
        star.className = "song-star";
        star.textContent = "⭐";
        star.setAttribute("role", "img");
        star.setAttribute("aria-label", t("songDone"));
        btn.append(star);
      }
      btn.addEventListener("click", () => chooseSong(s));
      return btn;
    }));
  }

  function renderScore() {
    $("score").replaceChildren(...song.notes.map((note, i) => {
      const dot = document.createElement("span");
      dot.className = "note-dot" + (i < songPos ? " is-played" : "") + (i === songPos ? " is-next" : "");
      dot.style.setProperty("--note", barHex(K.BARS[note.bar]));
      return dot;
    }));
    const next = mode === "songs" && songPos < song.notes.length ? song.notes[songPos].bar : -1;
    barEls.forEach((el, i) => el.classList.toggle("is-next", i === next));
  }

  function renderEcho() {
    $("echoDots").replaceChildren(...echo.map((bar, i) => {
      const dot = document.createElement("span");
      dot.className = "note-dot" + (i < echoTaps.length ? " is-played" : "");
      dot.style.setProperty("--note", barHex(K.BARS[bar]));
      return dot;
    }));
    $("echoBest").textContent = save.bestEcho ? t("echoBest", { n: save.bestEcho }) : "";
  }

  function setMode(next) {
    stopPlayback();
    mode = next;
    echoTurn = false;
    document.querySelectorAll(".mode").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
    $("panelFree").hidden = mode !== "free";
    $("panelSongs").hidden = mode !== "songs";
    $("panelEcho").hidden = mode !== "echo";
    $("actions").hidden = mode === "free";
    $("btnRestart").hidden = mode !== "songs";
    barEls.forEach((el) => el.classList.remove("is-next"));
    if (mode === "songs") chooseSong(song);
    else if (mode === "echo") startEcho();
    else {
      renderReadout();
      KIDS.speak(t("tapBars"), 200);
    }
  }

  function applyLanguage() {
    KIDS.applyText(t);
    labelBars();
    renderReadout();
    renderSongs();
    if (mode === "songs") $("songStatus").textContent = playing ? t("listening") : t("follow");
    if (mode === "echo") {
      $("echoStatus").textContent = echoTurn ? t("echoTurn") : t("echoListen");
      renderEcho();
    }
  }

  // ---- input: tap, slide across the bars, or keys 1-8 ------------------------------------------

  function barAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const bar = hit && hit.closest(".bar");
    return bar ? Number(bar.dataset.index) : -1;
  }

  const kolintangEl = $("kolintang");
  kolintangEl.addEventListener("pointerdown", (e) => {
    const index = barAt(e.clientX, e.clientY);
    if (index < 0) return;
    e.preventDefault();
    if (kolintangEl.setPointerCapture) kolintangEl.setPointerCapture(e.pointerId);
    pointerBars.set(e.pointerId, index);
    strike(index);
  });
  kolintangEl.addEventListener("pointermove", (e) => {
    if (!pointerBars.has(e.pointerId)) return;
    const index = barAt(e.clientX, e.clientY);
    if (index < 0 || index === pointerBars.get(e.pointerId)) return;
    pointerBars.set(e.pointerId, index);
    strike(index);
  });
  const release = (e) => pointerBars.delete(e.pointerId);
  kolintangEl.addEventListener("pointerup", release);
  kolintangEl.addEventListener("pointercancel", release);
  // Keyboard activation of a focused bar (Enter/Space) arrives as a click with no pointer.
  kolintangEl.addEventListener("click", (e) => {
    const bar = e.target.closest(".bar");
    if (bar && e.detail === 0) strike(Number(bar.dataset.index));
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= K.BARS.length) strike(n - 1);
  });

  document.querySelectorAll(".mode").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.mode !== mode) setMode(tab.dataset.mode);
    });
  });
  $("btnListen").addEventListener("click", () => {
    if (mode === "songs") listenToSong();
    else if (mode === "echo") playEcho(150);
  });
  $("btnRestart").addEventListener("click", () => chooseSong(song));

  buildBars();
  KIDS.bindHeader();
  KIDS.onPrefs(applyLanguage);
  applyLanguage();
})();
