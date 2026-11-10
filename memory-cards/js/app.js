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

  const ANIMAL_VECTORS = {
    cat: '<circle cx="50" cy="54" r="32" fill="#f5a623"/><polygon points="26,34 18,12 38,24" fill="#f5a623"/><polygon points="74,34 82,12 62,24" fill="#f5a623"/><polygon points="27,30 22,18 35,25" fill="#f8c3c3"/><polygon points="73,30 78,18 65,25" fill="#f8c3c3"/><circle cx="38" cy="50" r="4.5" fill="#222"/><circle cx="62" cy="50" r="4.5" fill="#222"/><polygon points="50,56 46,61 54,61" fill="#d0021b"/><path d="M46,65 Q50,69 54,65" fill="none" stroke="#222" stroke-width="2.5" stroke-linecap="round"/><line x1="20" y1="56" x2="36" y2="58" stroke="#222" stroke-width="2"/><line x1="20" y1="64" x2="36" y2="62" stroke="#222" stroke-width="2"/><line x1="80" y1="56" x2="64" y2="58" stroke="#222" stroke-width="2"/><line x1="80" y1="64" x2="64" y2="62" stroke="#222" stroke-width="2"/>',
    dog: '<circle cx="50" cy="54" r="32" fill="#d0935a"/><ellipse cx="20" cy="46" rx="9" ry="20" fill="#8c5828" transform="rotate(-15 20 46)"/><ellipse cx="80" cy="46" rx="9" ry="20" fill="#8c5828" transform="rotate(15 80 46)"/><ellipse cx="50" cy="62" rx="16" ry="12" fill="#f7dfc6"/><circle cx="38" cy="48" r="4.5" fill="#222"/><circle cx="62" cy="48" r="4.5" fill="#222"/><ellipse cx="50" cy="58" rx="6" ry="4.5" fill="#222"/><path d="M46,65 Q50,70 54,65" fill="none" stroke="#222" stroke-width="2.5" stroke-linecap="round"/>',
    elephant: '<circle cx="50" cy="52" r="30" fill="#8ea2b4"/><ellipse cx="20" cy="48" rx="16" ry="22" fill="#7a8f9f"/><ellipse cx="80" cy="48" rx="16" ry="22" fill="#7a8f9f"/><circle cx="50" cy="52" r="28" fill="#8ea2b4"/><circle cx="38" cy="46" r="4" fill="#222"/><circle cx="62" cy="46" r="4" fill="#222"/><path d="M46,54 Q44,76 56,76 Q60,76 60,72 Q60,68 54,68 Q50,68 50,54" fill="#8ea2b4" stroke="#7a8f9f" stroke-width="2"/><ellipse cx="40" cy="68" rx="3" ry="8" fill="#fff" transform="rotate(-30 40 68)"/><ellipse cx="60" cy="68" rx="3" ry="8" fill="#fff" transform="rotate(30 60 68)"/>',
    fish: '<ellipse cx="46" cy="50" rx="30" ry="22" fill="#ff7644"/><polygon points="72,50 92,32 86,50 92,68" fill="#ff5722"/><circle cx="30" cy="45" r="5" fill="#222"/><circle cx="32" cy="43" r="1.5" fill="#fff"/><path d="M44,36 Q52,50 44,64" fill="none" stroke="#ffb199" stroke-width="3" stroke-linecap="round"/><polygon points="40,28 54,20 52,28" fill="#ff5722"/><polygon points="40,72 50,78 48,72" fill="#ff5722"/><circle cx="16" cy="36" r="3" fill="none" stroke="#64b5f6" stroke-width="1.5"/>',
    chicken: '<circle cx="50" cy="54" r="30" fill="#fff" stroke="#e0e0e0" stroke-width="1.5"/><circle cx="44" cy="22" r="7" fill="#e53935"/><circle cx="53" cy="18" r="8" fill="#e53935"/><circle cx="62" cy="22" r="7" fill="#e53935"/><polygon points="50,48 68,55 50,62" fill="#ffa000"/><ellipse cx="50" cy="66" rx="4" ry="7" fill="#e53935"/><circle cx="40" cy="48" r="4" fill="#222"/><circle cx="42" cy="46" r="1.5" fill="#fff"/>',
    butterfly: '<ellipse cx="50" cy="52" rx="4" ry="24" fill="#37474f"/><path d="M46,42 Q20,18 14,36 Q8,52 46,54 Z" fill="#9c27b0"/><path d="M46,56 Q16,58 18,74 Q22,86 46,66 Z" fill="#e91e63"/><path d="M54,42 Q80,18 86,36 Q92,52 54,54 Z" fill="#9c27b0"/><path d="M54,56 Q84,58 82,74 Q78,86 54,66 Z" fill="#e91e63"/><circle cx="28" cy="38" r="5" fill="#ffeb3b"/><circle cx="72" cy="38" r="5" fill="#ffeb3b"/><path d="M48,30 Q44,18 36,16 M52,30 Q56,18 64,16" fill="none" stroke="#37474f" stroke-width="2" stroke-linecap="round"/>',
    turtle: '<ellipse cx="50" cy="54" rx="28" ry="24" fill="#4caf50" stroke="#388e3c" stroke-width="2"/><ellipse cx="50" cy="26" rx="10" ry="12" fill="#81c784"/><ellipse cx="22" cy="40" rx="6" ry="12" fill="#81c784" transform="rotate(-40 22 40)"/><ellipse cx="78" cy="40" rx="6" ry="12" fill="#81c784" transform="rotate(40 78 40)"/><ellipse cx="26" cy="70" rx="6" ry="10" fill="#81c784" transform="rotate(-30 26 70)"/><ellipse cx="74" cy="70" rx="6" ry="10" fill="#81c784" transform="rotate(30 74 70)"/><polygon points="50,40 64,48 64,60 50,68 36,60 36,48" fill="#388e3c"/><circle cx="46" cy="24" r="2.5" fill="#222"/><circle cx="54" cy="24" r="2.5" fill="#222"/>',
    monkey: '<circle cx="50" cy="52" r="30" fill="#795548"/><circle cx="22" cy="44" r="11" fill="#795548"/><circle cx="22" cy="44" r="7" fill="#d7ccc8"/><circle cx="78" cy="44" r="11" fill="#795548"/><circle cx="78" cy="44" r="7" fill="#d7ccc8"/><ellipse cx="50" cy="58" rx="22" ry="18" fill="#d7ccc8"/><ellipse cx="42" cy="44" rx="10" ry="12" fill="#d7ccc8"/><ellipse cx="58" cy="44" rx="10" ry="12" fill="#d7ccc8"/><circle cx="42" cy="44" r="4" fill="#222"/><circle cx="58" cy="44" r="4" fill="#222"/><ellipse cx="50" cy="58" rx="4" ry="2.5" fill="#5d4037"/><path d="M42,66 Q50,72 58,66" fill="none" stroke="#5d4037" stroke-width="2.5" stroke-linecap="round"/>',
    lion: '<circle cx="50" cy="52" r="36" fill="#bf6016"/><circle cx="50" cy="52" r="26" fill="#fbc02d"/><circle cx="32" cy="30" r="7" fill="#bf6016"/><circle cx="68" cy="30" r="7" fill="#bf6016"/><circle cx="40" cy="48" r="4" fill="#222"/><circle cx="60" cy="48" r="4" fill="#222"/><polygon points="50,54 44,60 56,60" fill="#bf6016"/><ellipse cx="46" cy="64" rx="5" ry="3.5" fill="#fffde7"/><ellipse cx="54" cy="64" rx="5" ry="3.5" fill="#fffde7"/><path d="M46,64 Q50,68 54,64" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>',
    cow: '<circle cx="50" cy="54" r="30" fill="#f5f5f5"/><path d="M28,26 Q24,14 18,18 Q20,28 32,32 Z" fill="#8d6e63"/><path d="M72,26 Q76,14 82,18 Q80,28 68,32 Z" fill="#8d6e63"/><ellipse cx="20" cy="44" rx="12" ry="7" fill="#f5f5f5" transform="rotate(-15 20 44)"/><ellipse cx="80" cy="44" rx="12" ry="7" fill="#f5f5f5" transform="rotate(15 80 44)"/><circle cx="36" cy="40" r="10" fill="#424242"/><circle cx="68" cy="48" r="8" fill="#424242"/><ellipse cx="50" cy="65" rx="18" ry="12" fill="#ffcdd2"/><circle cx="38" cy="46" r="3.5" fill="#222"/><circle cx="62" cy="46" r="3.5" fill="#222"/><circle cx="44" cy="64" r="3" fill="#e57373"/><circle cx="56" cy="64" r="3" fill="#e57373"/>',
    frog: '<circle cx="50" cy="56" r="30" fill="#4caf50"/><circle cx="32" cy="32" r="14" fill="#4caf50"/><circle cx="68" cy="32" r="14" fill="#4caf50"/><circle cx="32" cy="32" r="10" fill="#fff"/><circle cx="68" cy="32" r="10" fill="#fff"/><circle cx="34" cy="32" r="5" fill="#222"/><circle cx="66" cy="32" r="5" fill="#222"/><circle cx="26" cy="60" r="6" fill="#f48fb1" opacity="0.6"/><circle cx="74" cy="60" r="6" fill="#f48fb1" opacity="0.6"/><path d="M34,60 Q50,74 66,60" fill="none" stroke="#1b5e20" stroke-width="3" stroke-linecap="round"/>',
    rabbit: '<ellipse cx="38" cy="22" rx="7" ry="20" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="1.5"/><ellipse cx="38" cy="22" rx="4" ry="15" fill="#f8bbd0"/><ellipse cx="62" cy="22" rx="7" ry="20" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="1.5"/><ellipse cx="62" cy="22" rx="4" ry="15" fill="#f8bbd0"/><circle cx="50" cy="56" r="28" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="1.5"/><circle cx="40" cy="52" r="3.5" fill="#222"/><circle cx="60" cy="52" r="3.5" fill="#222"/><polygon points="50,58 46,63 54,63" fill="#f48fb1"/><path d="M46,66 Q50,70 54,66" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="60" r="5" fill="#f8bbd0" opacity="0.5"/><circle cx="68" cy="60" r="5" fill="#f8bbd0" opacity="0.5"/>',
  };

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
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("class", "face-animal");
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML = ANIMAL_VECTORS[face] || "";
        front.append(svg, el("span", "face-name", this.name(face)));
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
  let winTimer = null;
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
    clearTimeout(winTimer);
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
      if (M.isWon(game)) winTimer = setTimeout(win, 450);
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
