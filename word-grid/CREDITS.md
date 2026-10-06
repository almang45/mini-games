# Word list credits

`js/words.js` is generated from **ENABLE** (Enhanced North American Benchmark
Lexicon), the word list compiled by Alan Beale and M. Cooper and placed in the
public domain by its authors. It is not the Official Scrabble Players
Dictionary, the Official Tournament and Club Word List, or Collins Scrabble
Words, all of which are licensed.

- Source used: `enable1.txt` from https://github.com/dolph/dictionary
  (https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt)
- SHA-256 of that file: `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`
  (172,823 lines; `tools/build-words.js` refuses any other file)
- Words longer than 15 letters are dropped (they can't fit the board),
  leaving 168,551.

To rebuild:

```
curl -o enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
node tools/build-words.js enable1.txt
```

ENABLE predates some later two-letter additions such as QI and ZA, so those
aren't playable here.
