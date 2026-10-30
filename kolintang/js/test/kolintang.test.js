const assert = require("assert");
const K = require("../kolintang.js");
const MIX = require("../../../color-fusion/js/mix.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(function barsAreOneOctaveOfCMajor() {
  ok("eight bars", K.BARS.length === 8);
  const steps = K.BARS.slice(1).map((bar, i) => bar.midi - K.BARS[i].midi);
  ok("major scale steps: whole whole half whole whole whole half", steps.join() === "2,2,1,2,2,2,1", steps);
  ok("low do is middle C", Math.abs(K.frequency(K.BARS[0].midi) - 261.63) < 0.01);
  ok("la is A440", K.frequency(K.BARS[5].midi) === 440);
  ok("high do is an octave above low do", Math.abs(K.frequency(72) / K.frequency(60) - 2) < 1e-9);
  ok("not angka runs 1 to 7, then a dotted 1", K.BARS.map((b) => b.number).join(" ") === "1 2 3 4 5 6 7 1̇");
  const colors = K.BARS.map((b) => b.color);
  ok("colors run the mejikuhibiniu rainbow, Nila at la", colors.slice(0, 7).join() === "red,orange,yellow,green,blue,indigo,purple");
  ok("every bar has its own color", new Set(colors).size === colors.length);
  for (const color of colors) ok(color + " is a Color Fusion color", Boolean(MIX.NAMED_BY_ID[color]));
  ok("bar ids are unique", new Set(K.BARS.map((b) => b.id)).size === K.BARS.length);
})();

(function songsFitTheBars() {
  ok("song ids are unique", new Set(K.SONGS.map((s) => s.id)).size === K.SONGS.length);
  for (const song of K.SONGS) {
    ok(song.id + " has notes", song.notes.length >= 10);
    ok(song.id + " stays on the eight bars", song.notes.every((n) => Number.isInteger(n.bar) && n.bar >= 0 && n.bar < K.BARS.length));
    ok(song.id + " has positive note lengths", song.notes.every((n) => n.beats > 0));
    ok(song.id + " has titles in both languages", Boolean(song.title.id && song.title.en));
    ok(song.id + " ends on do, like a tune in C should", song.notes[song.notes.length - 1].bar === 0);
    ok(song.id + " is findable by id", K.SONGS_BY_ID[song.id] === song);
  }
  const spread = K.SONGS.map((s) => new Set(s.notes.map((n) => n.bar)).size);
  ok("songs go from fewest bars to most", spread.every((n, i) => i === 0 || n >= spread[i - 1]), spread);
  ok("the first song needs only three bars", spread[0] === 3);
})();

(function timelinePlaysBackInOrder() {
  const notes = [{ bar: 0, beats: 1 }, { bar: 1, beats: 0.5 }, { bar: 2, beats: 2 }];
  const line = K.timeline(notes, 120);
  ok("first note starts at once", line[0].at === 0);
  ok("each note starts when the last one's beats are up", line[1].at === 500 && line[2].at === 750);
  ok("durations follow the tempo", line[2].duration === 1000 && line[1].duration === 250);
  for (const song of K.SONGS) {
    const tl = K.timeline(song.notes, 100);
    ok(song.id + ": start times only go up", tl.every((e, i) => i === 0 || e.at > tl[i - 1].at));
  }
})();

(function followingASong() {
  const song = K.SONGS_BY_ID["hot-cross-buns"];
  let step = K.follow(song, 0, song.notes[0].bar);
  ok("the right bar moves on", step.correct && step.position === 1 && !step.done);
  step = K.follow(song, 1, 7);
  ok("a wrong bar stays put", !step.correct && step.position === 1);
  let position = 0;
  for (const note of song.notes) position = K.follow(song, position, note.bar).position;
  ok("playing every note finishes the song", position === song.notes.length);
  ok("the last note reports done", K.follow(song, song.notes.length - 1, song.notes[song.notes.length - 1].bar).done);
  ok("tapping after the end changes nothing", K.follow(song, song.notes.length, 0).position === song.notes.length);
})();

(function copyMe() {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seeded(seed);
    let seq = K.newEcho(rng);
    ok("starts with " + K.ECHO_START + " notes", seq.length === K.ECHO_START);
    while (seq.length < K.ECHO_MAX) seq = K.extendEcho(seq, rng);
    ok("only real bars", seq.every((b) => b >= 0 && b < K.BARS.length));
    const triple = seq.some((b, i) => i >= 2 && b === seq[i - 1] && b === seq[i - 2]);
    ok("never three of one bar in a row", !triple, seq);
  }
  const seq = [3, 5, 1];
  ok("a right start waits", K.checkEcho(seq, [3]) === "wait");
  ok("a wrong tap is wrong", K.checkEcho(seq, [3, 4]) === "wrong");
  ok("the whole tune is done", K.checkEcho(seq, [3, 5, 1]) === "done");
  ok("no taps yet waits", K.checkEcho(seq, []) === "wait");
  ok("extending doesn't change the old tune", K.extendEcho(seq, seeded(1)).slice(0, 3).join() === "3,5,1" && seq.length === 3);
})();

console.log("kolintang.test.js: " + passed + " assertions passed");
