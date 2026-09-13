const assert = require("assert");
const CARDS = require("../core/cards.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const deck = CARDS.buildDeck();
ok("deck has 52 cards", deck.length === 52);
ok("deck has unique ids", new Set(deck.map((c) => c.id)).size === 52);
CARDS.SUITS.forEach((suit) => {
  ok("13 cards of suit " + suit, deck.filter((c) => c.suit === suit).length === 13);
});
for (let r = 2; r <= 14; r++) {
  ok("4 cards of rank " + r, deck.filter((c) => c.rank === r).length === 4);
}

const rng = CARDS.makeRng(42);
const shuffled = CARDS.shuffle(deck, rng);
ok("shuffle preserves count", shuffled.length === 52);
ok("shuffle preserves card set", new Set(shuffled.map((c) => c.id)).size === 52);
ok("shuffle actually reorders", shuffled.map((c) => c.id).join(",") !== deck.map((c) => c.id).join(","));

const rngA = CARDS.makeRng(7);
const rngB = CARDS.makeRng(7);
const shuffledA = CARDS.shuffle(deck, rngA).map((c) => c.id).join(",");
const shuffledB = CARDS.shuffle(deck, rngB).map((c) => c.id).join(",");
ok("same seed reproduces same shuffle", shuffledA === shuffledB);

const hands4 = CARDS.dealEven(CARDS.buildDeck(), 4);
ok("4-way deal gives 4 hands", hands4.length === 4);
hands4.forEach((h, i) => ok("hand " + i + " has 13 cards", h.length === 13));
const allDealt = hands4.flat();
ok("dealEven conserves all 52 cards", new Set(allDealt.map((c) => c.id)).size === 52);

ok("presidentValue: 2 is highest", CARDS.presidentValue({ rank: 2 }) > CARDS.presidentValue({ rank: 14 }));
ok("presidentValue: ace beats king", CARDS.presidentValue({ rank: 14 }) > CARDS.presidentValue({ rank: 13 }));
ok("presidentValue: 3 is lowest", CARDS.presidentValue({ rank: 3 }) < CARDS.presidentValue({ rank: 4 }));

const hand = [{ suit: "S", rank: 14, id: "14S" }, { suit: "C", rank: 3, id: "3C" }];
CARDS.removeCard(hand, { suit: "C", rank: 3, id: "3C" });
ok("removeCard removes the right card", hand.length === 1 && hand[0].id === "14S");
assert.throws(() => CARDS.removeCard(hand, { id: "99X" }), "removeCard throws on missing card");
passed++;

console.log("cards.test.js: " + passed + " assertions passed");
