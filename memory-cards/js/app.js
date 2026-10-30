// Kartu Memori controller: deals a board from js/memory.js for the chosen theme and size,
// turns cards on tap, and keeps each board's best score. Colors and their names come from
// color-fusion/js/mix.js; speech, sound and the header toggles from shared/kids/kids.js.
(function () {
  "use strict";
  const MIX = window.MIX;
  const KIDS = window.KIDS;
  const M = window.MEMORY;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "memory-cards.v1";
  const MISS_MS = 1300;
  const CARD_ASPECT = 0.78;

  const STRINGS = {
    id: {
      back: "← Semua Game",
      language: "Bahasa",
      sound: "Suara",
      title: "Kartu Memori",
      themes: "Jenis kartu",
      themeColors: "Warna",
      themeAnimals: "Hewan",
      themeNumbers: "Angka",
      sizes: "Jumlah kartu",
      size: "{n} kartu",
      start: "Cari pasangannya!",
      found: "{found} dari {pairs} pasangan",
      cardDown: "Kartu {n}, tertutup",
      cardUp: "Kartu {n}: {name}",
      pair: "Sama!",
      won: "Hebat! Semua pasangan ketemu!",
      moves: "{n} langkah",
      record: "Rekor baru!",
      again: "Main lagi",
    },
    en: {
      back: "← All Games",
      language: "Language",
      sound: "Sound",
      title: "Memory Cards",
      themes: "Card set",
      themeColors: "Colors",
      themeAnimals: "Animals",
      themeNumbers: "Numbers",
      sizes: "Number of cards",
      size: "{n} cards",
      start: "Find the pairs!",
      found: "{found} of {pairs} pairs",
      cardDown: "Card {n}, face down",
      cardUp: "Card {n}: {name}",
      pair: "A pair!",
      won: "You found every pair!",
      moves: "{n} moves",
      record: "New record!",
      again: "Play again",
    },
  };
  const t = KIDS.translator(STRINGS);

  // ---- themes ---------------------------------------------------------------------

  const ANIMALS = {
    cat: { emoji: "🐱", id: "Kucing", en: "Cat" },
    dog: { emoji: "🐶", id: "Anjing", en: "Dog" },
    elephant: { emoji: "🐘", id: "Gajah", en: "Elephant" },
    fish: { emoji: "🐟", id: "Ikan", en: "Fish" },
    chicken: { emoji: "🐔", id: "Ayam", en: "Chicken" },
    butterfly: { emoji: "🦋", id: "Kupu-kupu", en: "Butterfly" },
    turtle: { emoji: "🐢", id: "Kura-kura", en: "Turtle" },
    monkey: { emoji: "🐒", id: "Monyet", en: "Monkey" },
    lion: { emoji: "🦁", id: "Singa", en: "Lion" },
    cow: { emoji: "🐄", id: "Sapi", en: "Cow" },
    frog: { emoji: "🐸", id: "Katak", en: "Frog" },
    rabbit: { emoji: "🐰", id: "Kelinci", en: "Rabbit" },
  };

  // Cells of a 3×3 grid, dice-style, for one to eight dots.
  const DOT_CELLS = [null, [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8], [0, 2, 3, 4, 5, 6, 8], [0, 1, 2, 3, 5, 6, 7, 8]];

  const BLOB_PATH = "M50 7C64 7 71 18 83 22C96 27 95 44 91 55C87 67 94 81 80 88C66 95 57 86 45 90C31 95 15 89 11 74C7 62 14 53 9 41C5 27 17 14 30 10C38 8 43 7 50 7Z";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const THEMES = {
    colors: {
      faces: ["red", "yellow", "blue", "green", "orange", "purple", "pink", "brown", "indigo", "black"],
      name: (face) => MIX.NAMED_BY_ID[face].name[KIDS.prefs.lang],
      draw(front, face) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("class", "face-blob");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", BLOB_PATH);
        path.setAttribute("fill", MIX.toHex(MIX.NAMED_BY_ID[face].rgb));
        svg.append(path);
        front.append(svg, el("span", "face-name", this.name(face)));
      },
    },
    animals: {
      faces: Object.keys(ANIMALS),
      name: (face) => ANIMALS[face][KIDS.prefs.lang],
      draw(front, face) {
        const emoji = el("span", "face-emoji", ANIMALS[face].emoji);
        emoji.setAttribute("aria-hidden", "true");
        front.append(emoji, el("span", "face-name", this.name(face)));
      },
    },
    // One card of each pair shows the numeral, the other that many dots.
    numbers: {
      faces: [1, 2, 3, 4, 5, 6, 7, 8],
      name: (face) => KIDS.numberWord(face),
      draw(front, face, side) {
        if (side === 0) {
          front.append(el("span", "face-digit", String(face)));
          return;
        }
        const dots = el("span", "face-dots");
        const cells = new Set(DOT_CELLS[face]);
        for (let i = 0; i < 9; i++) {
          const dot = el("span");
          if (!cells.has(i)) dot.style.visibility = "hidden";
          dots.append(dot);
        }
        front.append(dots);
      },
    },
  };

  // ---- saved settings and records --------------------------------------------------

  function loadSave() {
    const data = KIDS.load(STORE_KEY) || {};
    const best = {};
    if (data.best && typeof data.best === "object") {
      for (const [key, moves] of Object.entries(data.best)) {
        if (Number.isInteger(moves) && moves > 0) best[key] = moves;
      }
    }
    return {
      theme: THEMES[data.theme] ? data.theme : "colors",
      size: M.SIZES.includes(data.size) ? data.size : 6,
      best,
    };
  }

  const save = loadSave();
  const persist = () => KIDS.save(STORE_KEY, save);

  // ---- state ----------------------------------------------------------------------

  let game = null;
  let missTimer = null;
  let cardEls = [];

  const boardEl = $("board");
  const cardsEl = $("cards");
  const btnAgain = $("btnAgain");
  const theme = () => THEMES[save.theme];

  function faceName(index) {
    return theme().name(game.cards[index].face);
  }

  // ---- play ---------------------------------------------------------------------------

  function newGame() {
    clearTimeout(missTimer);
    game = M.createGame(theme().faces, save.size);
    buildCards();
    renderControls();
    KIDS.speak(t("start"), 300);
  }

  function hideNow() {
    clearTimeout(missTimer);
    game = M.hide(game);
    updateCards();
  }

  function tap(index) {
    // An impatient second guess turns the last two back over straight away.
    if (game.open.length === 2) hideNow();
    const step = M.flip(game, index);
    if (step.result === "ignored") return;
    game = step.game;
    updateCards();
    const name = faceName(index);
    if (step.result === "first") {
      KIDS.sfx.tap();
      KIDS.speak(name, 0);
    } else if (step.result === "miss") {
      KIDS.sfx.tap();
      KIDS.speak(name, 0);
      missTimer = setTimeout(hideNow, MISS_MS);
    } else {
      KIDS.sfx.chime();
      KIDS.speak(name + "! " + t("pair"), 0);
      if (M.isWon(game)) setTimeout(win, 450);
    }
  }

  function win() {
    const key = save.theme + "-" + save.size;
    const record = !save.best[key] || game.moves < save.best[key];
    if (record) {
      save.best[key] = game.moves;
      persist();
    }
    KIDS.sfx.fanfare();
    const colors = ["#e2232b", "#ffd200", "#1c5cc8", "#1a9e4c", "#3e3b8f"];
    KIDS.burst(KIDS.centerOf(boardEl), colors, 30);
    const moves = t("moves", { n: game.moves });
    KIDS.toast("🎉 " + moves + (record ? ". " + t("record") : ""));
    KIDS.speak(t("won") + (record ? " " + t("record") : ""), 300);
    renderStatus();
  }

  // ---- rendering ------------------------------------------------------------------------

  function buildCards() {
    cardEls = game.cards.map((card, i) => {
      const btn = el("button", "card");
      btn.type = "button";
      const inner = el("span", "card-inner");
      const front = el("span", "card-front");
      theme().draw(front, card.face, card.side);
      inner.append(el("span", "card-back"), front);
      btn.append(inner);
      btn.addEventListener("click", () => tap(i));
      return btn;
    });
    cardsEl.replaceChildren(...cardEls);
    fitCards();
    updateCards();
  }

  function updateCards() {
    cardEls.forEach((btn, i) => {
      const up = M.isFaceUp(game, i);
      btn.classList.toggle("is-up", up);
      btn.classList.toggle("is-matched", game.cards[i].matched);
      btn.setAttribute("aria-label", up ? t("cardUp", { n: i + 1, name: faceName(i) }) : t("cardDown", { n: i + 1 }));
    });
    renderStatus();
  }

  // Re-labels the faces in place after a language switch, keeping which cards are up.
  function relabelCards() {
    cardEls.forEach((btn, i) => {
      const name = btn.querySelector(".face-name");
      if (name) name.textContent = faceName(i);
    });
    updateCards();
  }

  function fitCards() {
    const box = boardEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(cardsEl).columnGap) || 0;
    const grid = M.bestGrid(game.cards.length, box.width, box.height, CARD_ASPECT, gap);
    cardsEl.style.setProperty("--cols", String(grid.cols));
    cardsEl.style.setProperty("--card-w", grid.cardW + "px");
    cardsEl.style.setProperty("--card-h", grid.cardH + "px");
  }

  function renderStatus() {
    $("found").textContent = t("found", { found: game.found, pairs: game.pairs });
    const won = M.isWon(game);
    btnAgain.hidden = !won;
    btnAgain.classList.toggle("is-nudging", won);
  }

  function renderControls() {
    document.querySelectorAll(".mode").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.theme === save.theme));
    });
    $("sizes").replaceChildren(...M.SIZES.map((size) => {
      const btn = el("button", "step", String(size));
      btn.type = "button";
      btn.classList.toggle("is-current", size === save.size);
      btn.setAttribute("aria-label", t("size", { n: size }));
      btn.setAttribute("aria-pressed", String(size === save.size));
      btn.addEventListener("click", () => {
        if (size === save.size) return;
        save.size = size;
        persist();
        newGame();
      });
      return btn;
    }));
  }

  // ---- wiring ---------------------------------------------------------------------------

  document.querySelectorAll(".mode").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.theme === save.theme) return;
      save.theme = tab.dataset.theme;
      persist();
      newGame();
    });
  });
  btnAgain.addEventListener("click", newGame);

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(fitCards).observe(boardEl);
  } else {
    window.addEventListener("resize", fitCards);
  }

  KIDS.bindHeader();
  KIDS.onPrefs(() => {
    KIDS.applyText(t);
    renderControls();
    relabelCards();
  });
  KIDS.applyText(t);
  newGame();
})();
