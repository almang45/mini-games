// Word lookup for Word Grid: a trie in flat typed arrays, built once from the
// sorted word list. Move generation walks it letter by letter, so it needs
// "child of this node for letter L" and "does a word end here", not just
// "is this a word". About 390k nodes, so objects per node would be heavy;
// typed arrays keep it to a few MB and build in a fraction of a second.
//
// Nodes are numbers; 0 is the root. Children of a node are a linked list in
// letter order (firstChild / nextSibling). Letters are 0-25 for A-Z.
(function (root) {
  "use strict";

  const A = 65;

  function buildLexicon(wordText) {
    const words = wordText.split("\n");
    // Upper bound on nodes: every letter of every word.
    let cap = 1;
    words.forEach((w) => { cap += w.length; });
    let letter = new Uint8Array(cap);
    let firstChild = new Int32Array(cap).fill(-1);
    const lastChild = new Int32Array(cap).fill(-1);
    let nextSibling = new Int32Array(cap).fill(-1);
    let terminal = new Uint8Array(cap);
    let count = 1;

    // Sorted input means each new word shares a prefix with the previous one
    // and only ever appends children after the last existing child.
    const path = [0];
    let prev = "";
    for (const word of words) {
      if (!word) continue;
      if (word <= prev) throw new Error("word list must be sorted and unique: " + prev + " then " + word);
      let common = 0;
      while (common < prev.length && common < word.length && prev[common] === word[common]) common++;
      path.length = common + 1;
      for (let i = common; i < word.length; i++) {
        const parent = path[i];
        const node = count++;
        letter[node] = word.charCodeAt(i) - A;
        if (lastChild[parent] === -1) firstChild[parent] = node;
        else nextSibling[lastChild[parent]] = node;
        lastChild[parent] = node;
        path.push(node);
      }
      terminal[path[word.length]] = 1;
      prev = word;
    }
    // Shared prefixes leave most of the upper bound unused; keep only what's used.
    letter = letter.slice(0, count);
    firstChild = firstChild.slice(0, count);
    nextSibling = nextSibling.slice(0, count);
    terminal = terminal.slice(0, count);

    function child(node, l) {
      for (let c = firstChild[node]; c !== -1; c = nextSibling[c]) {
        if (letter[c] === l) return c;
        if (letter[c] > l) return -1;
      }
      return -1;
    }

    // Node reached by spelling `text` from `from` (default root), or -1.
    function walk(text, from) {
      let node = from || 0;
      for (let i = 0; i < text.length && node !== -1; i++) node = child(node, text.charCodeAt(i) - A);
      return node;
    }

    return {
      size: count,
      wordCount: words.filter(Boolean).length,
      child,
      walk,
      isWord: (text) => { const n = walk(text.toUpperCase()); return n > 0 && terminal[n] === 1; },
      isTerminal: (node) => terminal[node] === 1,
      // Calls fn(letterIndex, childNode) for every child, in letter order.
      eachChild: (node, fn) => { for (let c = firstChild[node]; c !== -1; c = nextSibling[c]) fn(letter[c], c); },
    };
  }

  const api = { buildLexicon };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WORD_GRID_LEXICON = api;
})(typeof window !== "undefined" ? window : globalThis);
