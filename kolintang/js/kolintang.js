// Music for Kolintang Warna: the eight bars, the songs, and the copy-me game. Framework-agnostic
// (no DOM, no audio); js/app.js turns these into sound and light.
(function (root) {
  "use strict";

  // One octave of C major, low to high. `number` is Indonesian not angka (number notation),
  // where the high do is written 1 with a dot above. Colors run the rainbow kids learn as
  // "mejikuhibiniu" (merah, jingga, kuning, hijau, biru, nila, ungu), then pink for the top
  // do; ids are Color Fusion's (color-fusion/js/mix.js).
  const BARS = [
    { id: "do", solfege: { id: "do", en: "do" }, number: "1", midi: 60, color: "red" },
    { id: "re", solfege: { id: "re", en: "re" }, number: "2", midi: 62, color: "orange" },
    { id: "mi", solfege: { id: "mi", en: "mi" }, number: "3", midi: 64, color: "yellow" },
    { id: "fa", solfege: { id: "fa", en: "fa" }, number: "4", midi: 65, color: "green" },
    { id: "sol", solfege: { id: "sol", en: "sol" }, number: "5", midi: 67, color: "blue" },
    { id: "la", solfege: { id: "la", en: "la" }, number: "6", midi: 69, color: "indigo" },
    { id: "si", solfege: { id: "si", en: "ti" }, number: "7", midi: 71, color: "purple" },
    { id: "do-high", solfege: { id: "do", en: "do" }, number: "1̇", midi: 72, color: "pink" },
  ].map((bar) => Object.freeze(bar));

  function frequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Bar indexes, low do = 0 ... high do = 7.
  const C = 0, D = 1, E = 2, F = 3, G = 4, A = 5, B = 6, C2 = 7;

  // Public-domain melodies whose notes all fit the one octave. Each note is [bar, beats].
  const SONGS = [
    {
      id: "hot-cross-buns",
      title: { id: "Hot Cross Buns", en: "Hot Cross Buns" },
      notes: [[E, 1], [D, 1], [C, 2], [E, 1], [D, 1], [C, 2],
        [C, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], [D, 0.5], [D, 0.5], [D, 0.5], [D, 0.5],
        [E, 1], [D, 1], [C, 2]],
    },
    {
      id: "mary",
      title: { id: "Mary Had a Little Lamb", en: "Mary Had a Little Lamb" },
      notes: [[E, 1], [D, 1], [C, 1], [D, 1], [E, 1], [E, 1], [E, 2],
        [D, 1], [D, 1], [D, 2], [E, 1], [G, 1], [G, 2],
        [E, 1], [D, 1], [C, 1], [D, 1], [E, 1], [E, 1], [E, 1], [E, 1],
        [D, 1], [D, 1], [E, 1], [D, 1], [C, 4]],
    },
    {
      id: "ode-to-joy",
      title: { id: "Ode to Joy (Beethoven)", en: "Ode to Joy (Beethoven)" },
      notes: [[E, 1], [E, 1], [F, 1], [G, 1], [G, 1], [F, 1], [E, 1], [D, 1],
        [C, 1], [C, 1], [D, 1], [E, 1], [E, 1.5], [D, 0.5], [D, 2],
        [E, 1], [E, 1], [F, 1], [G, 1], [G, 1], [F, 1], [E, 1], [D, 1],
        [C, 1], [C, 1], [D, 1], [E, 1], [D, 1.5], [C, 0.5], [C, 2]],
    },
    {
      id: "twinkle",
      title: { id: "Twinkle Twinkle Little Star", en: "Twinkle Twinkle Little Star" },
      notes: [[C, 1], [C, 1], [G, 1], [G, 1], [A, 1], [A, 1], [G, 2],
        [F, 1], [F, 1], [E, 1], [E, 1], [D, 1], [D, 1], [C, 2],
        [G, 1], [G, 1], [F, 1], [F, 1], [E, 1], [E, 1], [D, 2],
        [G, 1], [G, 1], [F, 1], [F, 1], [E, 1], [E, 1], [D, 2],
        [C, 1], [C, 1], [G, 1], [G, 1], [A, 1], [A, 1], [G, 2],
        [F, 1], [F, 1], [E, 1], [E, 1], [D, 1], [D, 1], [C, 2]],
    },
    {
      id: "row-your-boat",
      title: { id: "Row, Row, Row Your Boat", en: "Row, Row, Row Your Boat" },
      notes: [[C, 1.5], [C, 1.5], [C, 1], [D, 0.5], [E, 1.5],
        [E, 1], [D, 0.5], [E, 1], [F, 0.5], [G, 3],
        [C2, 0.5], [C2, 0.5], [C2, 0.5], [G, 0.5], [G, 0.5], [G, 0.5],
        [E, 0.5], [E, 0.5], [E, 0.5], [C, 0.5], [C, 0.5], [C, 0.5],
        [G, 1], [F, 0.5], [E, 1], [D, 0.5], [C, 3]],
    },
  ].map((song) => Object.freeze(Object.assign({}, song, {
    notes: Object.freeze(song.notes.map(([bar, beats]) => Object.freeze({ bar, beats }))),
  })));
  const SONGS_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));

  // When each note starts and how long it rings, for playing a song back.
  function timeline(notes, bpm) {
    const beatMs = 60000 / bpm;
    let at = 0;
    return notes.map((note) => {
      const entry = { bar: note.bar, at: Math.round(at), duration: Math.round(note.beats * beatMs) };
      at += note.beats * beatMs;
      return entry;
    });
  }

  // Following a song: the bar tapped either is the next note (move on) or isn't (stay put).
  function follow(song, position, bar) {
    if (position >= song.notes.length) return { correct: false, position, done: true };
    const correct = song.notes[position].bar === bar;
    const next = correct ? position + 1 : position;
    return { correct, position: next, done: next === song.notes.length };
  }

  // ---- copy me ----------------------------------------------------------------------

  const ECHO_START = 2;
  const ECHO_MAX = 12;

  // One more random bar on the end. Never three of the same in a row: that's hard to hear
  // as a tune and easy to lose count of.
  function extendEcho(sequence, rng) {
    const random = rng || Math.random;
    let bar;
    do {
      bar = Math.floor(random() * BARS.length);
    } while (sequence.length >= 2 && sequence[sequence.length - 1] === bar && sequence[sequence.length - 2] === bar);
    return sequence.concat([bar]);
  }

  function newEcho(rng) {
    let sequence = [];
    while (sequence.length < ECHO_START) sequence = extendEcho(sequence, rng);
    return sequence;
  }

  // "wait" for more taps, "wrong" on the first mistake, "done" once the whole tune is copied.
  function checkEcho(sequence, taps) {
    for (let i = 0; i < taps.length; i++) {
      if (taps[i] !== sequence[i]) return "wrong";
    }
    return taps.length === sequence.length ? "done" : "wait";
  }

  const api = {
    BARS,
    SONGS,
    SONGS_BY_ID,
    ECHO_START,
    ECHO_MAX,
    frequency,
    timeline,
    follow,
    extendEcho,
    newEcho,
    checkEcho,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.KOLINTANG = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
