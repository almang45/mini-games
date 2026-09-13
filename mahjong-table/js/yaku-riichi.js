// Riichi (Japanese) yaku detection + fu calculation. Pure functions, no DOM.
// NOTE on scope: implements all common 1-6 han yaku and the standard yakuman set,
// EXCEPT Tenhou/Chiihou/Renhou (blessing hands), which need turn-history context
// beyond a single hand's tile shape and are intentionally out of scope.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"), require("./hand.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { yakuRiichi: factory(root.MJ.tiles, root.MJ.hand) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, hand) {
  "use strict";

  const GREEN_KINDS = [tiles.indexOf("s", 2), tiles.indexOf("s", 3), tiles.indexOf("s", 4), tiles.indexOf("s", 6), tiles.indexOf("s", 8), 32 /* hatsu */];

  function buildGroups(concealedSets, openMelds, winTile, winBy) {
    const groups = [];
    for (const m of openMelds) {
      if (m.type === "chi") groups.push({ type: "run", tile: m.tiles[0], concealed: false });
      else if (m.type === "pon") groups.push({ type: "triplet", tile: m.tiles[0], concealed: false });
      else if (m.type === "kan") groups.push({ type: "kan", tile: m.tiles[0], concealed: !!m.concealed });
    }
    for (const s of concealedSets) {
      if (s.type === "triplet") {
        const wonByRonHere = s.tile === winTile && winBy === "ron";
        groups.push({ type: "triplet", tile: s.tile, concealed: !wonByRonHere });
      } else {
        groups.push({ type: "run", tile: s.tile, concealed: true });
      }
    }
    return groups;
  }

  function classifyWait(concealedSets, pairKind, winTile) {
    if (pairKind === winTile) return "tanki";
    for (const s of concealedSets) {
      if (s.type === "triplet" && s.tile === winTile) return "shanpon";
      if (s.type === "run") {
        const r = tiles.rankOf(s.tile);
        if (winTile === s.tile) return r === 7 ? "penchan" : "ryanmen";
        if (winTile === s.tile + 1) return "kanchan";
        if (winTile === s.tile + 2) return r === 1 ? "penchan" : "ryanmen";
      }
    }
    return "ryanmen";
  }

  function groupHasTerminalOrHonor(g) {
    if (g.type === "run") { const r = tiles.rankOf(g.tile); return r === 1 || r === 7; }
    return tiles.isTerminalOrHonor(g.tile);
  }
  function groupIsHonor(g) {
    return g.type !== "run" && tiles.isHonor(g.tile);
  }
  function groupIsSimpleOnly(g) {
    if (g.type === "run") { const r = tiles.rankOf(g.tile); return r >= 2 && r <= 6; }
    return tiles.isSimple(g.tile);
  }
  function groupSuit(g) { return g.type === "run" ? tiles.suitOf(g.tile) : (tiles.isHonor(g.tile) ? "z" : tiles.suitOf(g.tile)); }

  function computeYaku(concealedSets, pairKind, groups, isMenzen, winBy, seatWind, roundWind, flags, wait) {
    const yaku = [];
    const push = (name, han, yakuman) => yaku.push({ name, han, yakuman: !!yakuman });

    // --- yakuman (checked first; if any fire, caller keeps only these) ---
    const nonRunGroups = groups.filter((g) => g.type !== "run");
    const concealedNonRun = nonRunGroups.filter((g) => g.concealed).length;
    if (nonRunGroups.length === 4 && concealedNonRun === 4) push("Suuankou (Four Concealed Triplets)", 13, true);
    const dragonTriplets = nonRunGroups.filter((g) => tiles.isDragon(g.tile));
    if (dragonTriplets.length === 3) push("Daisangen (Big Three Dragons)", 13, true);
    const windTriplets = nonRunGroups.filter((g) => tiles.isWind(g.tile));
    if (windTriplets.length === 4) push("Daisuushi (Big Four Winds)", 13, true);
    if (windTriplets.length === 3 && tiles.isWind(pairKind)) push("Shousuushi (Small Four Winds)", 13, true);
    if (groups.every((g) => groupIsHonor(g)) && tiles.isHonor(pairKind)) push("Tsuuiisou (All Honors)", 13, true);
    if (groups.every((g) => g.type !== "run" && tiles.isTerminal(g.tile)) && tiles.isTerminal(pairKind)) {
      push("Chinroutou (All Terminals)", 13, true);
    }
    const allGreen = groups.every((g) => {
      if (g.type === "run") return g.tile === tiles.indexOf("s", 2); // 234s is the only all-green run
      return GREEN_KINDS.includes(g.tile);
    }) && GREEN_KINDS.includes(pairKind);
    if (allGreen) push("Ryuuiisou (All Green)", 13, true);

    if (yaku.some((y) => y.yakuman)) return yaku; // yakuman found; skip normal yaku entirely

    // --- 1 han ---
    if (flags.doubleRiichi) push("Double Riichi", 2);
    else if (flags.riichi) push("Riichi", 1);
    if (flags.riichi && flags.ippatsu) push("Ippatsu", 1);
    if (isMenzen && winBy === "tsumo") push("Menzen Tsumo", 1);
    if (flags.haitei && winBy === "tsumo") push("Haitei Raoyue", 1);
    if (flags.houtei && winBy === "ron") push("Houtei Raoyui", 1);
    if (flags.rinshan) push("Rinshan Kaihou", 1);
    if (flags.chankan) push("Chankan", 1);

    const allSimplesOnly = groups.every(groupIsSimpleOnly) && tiles.isSimple(pairKind);
    if (allSimplesOnly) push("Tanyao (All Simples)", 1);

    for (const g of nonRunGroups) {
      if (tiles.isDragon(g.tile)) push("Yakuhai (" + tiles.nameOf(g.tile) + ")", 1);
      if (g.tile === seatWind) push("Yakuhai (Seat Wind)", 1);
      if (g.tile === roundWind) push("Yakuhai (Round Wind)", 1);
    }

    if (isMenzen && wait === "ryanmen" && !tiles.isDragon(pairKind) && pairKind !== seatWind && pairKind !== roundWind && groups.every((g) => g.type === "run")) {
      push("Pinfu", 1);
    }

    if (isMenzen) {
      const runTiles = {};
      for (const s of concealedSets) if (s.type === "run") runTiles[s.tile] = (runTiles[s.tile] || 0) + 1;
      const pairCount = Object.values(runTiles).filter((c) => c >= 2).length;
      if (pairCount >= 2) push("Ryanpeikou (Two Sets of Identical Sequences)", 3);
      else if (pairCount === 1) push("Iipeikou (One Set of Identical Sequences)", 1);
    }

    // --- 2 han family ---
    const bySuitStart = { m: new Set(), s: new Set(), p: new Set() };
    for (const g of groups) if (g.type === "run") bySuitStart[groupSuit(g)].add(tiles.rankOf(g.tile));
    for (const r of bySuitStart.m) {
      if (bySuitStart.s.has(r) && bySuitStart.p.has(r)) push("Sanshoku Doujun (Three Color Straight)", isMenzen ? 2 : 1);
    }
    for (const suit of ["m", "s", "p"]) {
      if (bySuitStart[suit].has(1) && bySuitStart[suit].has(4) && bySuitStart[suit].has(7)) {
        push("Ittsu (Pure Straight)", isMenzen ? 2 : 1);
      }
    }

    const chantaAll = groups.every(groupHasTerminalOrHonor) && (tiles.isTerminal(pairKind) || tiles.isHonor(pairKind));
    if (chantaAll) {
      const anyHonor = groups.some(groupIsHonor) || tiles.isHonor(pairKind);
      if (anyHonor) push("Chanta (Terminal/Honor in Every Group)", isMenzen ? 2 : 1);
      else push("Junchan (Terminal in Every Group)", isMenzen ? 3 : 2);
    }

    if (nonRunGroups.length === 4) push("Toitoitsu (All Triplets)", 2);
    if (concealedNonRun >= 3 && nonRunGroups.length >= 3) push("Sanankou (Three Concealed Triplets)", 2);
    if (groups.every((g) => g.type !== "run" && tiles.isTerminalOrHonor(g.tile)) && tiles.isTerminalOrHonor(pairKind)) {
      push("Honroutou (All Terminals and Honors)", 2);
    }
    if (dragonTriplets.length === 2 && tiles.isDragon(pairKind)) push("Shousangen (Small Three Dragons)", 2);

    // --- honitsu / chinitsu ---
    const suitsUsed = new Set();
    let hasHonorTile = tiles.isHonor(pairKind);
    for (const g of groups) {
      if (g.type === "run") suitsUsed.add(groupSuit(g));
      else if (tiles.isHonor(g.tile)) hasHonorTile = true;
      else suitsUsed.add(tiles.suitOf(g.tile));
    }
    if (!tiles.isHonor(pairKind)) suitsUsed.add(tiles.suitOf(pairKind));
    if (suitsUsed.size === 1) {
      if (hasHonorTile) push("Honitsu (Half Flush)", isMenzen ? 3 : 2);
      else push("Chinitsu (Full Flush)", isMenzen ? 6 : 5);
    }

    return yaku;
  }

  function computeFu(groups, pairKind, wait, winBy, isMenzen, seatWind, roundWind, isPinfu) {
    if (isPinfu) return winBy === "tsumo" ? 20 : 30;
    let fu = 20;
    for (const g of groups) {
      if (g.type === "run") continue;
      const th = tiles.isTerminalOrHonor(g.tile);
      if (g.type === "triplet") fu += g.concealed ? (th ? 8 : 4) : (th ? 4 : 2);
      else fu += g.concealed ? (th ? 32 : 16) : (th ? 16 : 8);
    }
    if (tiles.isDragon(pairKind)) fu += 2;
    if (pairKind === seatWind) fu += 2;
    if (pairKind === roundWind) fu += 2;
    fu += { ryanmen: 0, penchan: 2, kanchan: 2, tanki: 2, shanpon: 0 }[wait] || 0;
    if (winBy === "tsumo") fu += 2;
    if (winBy === "ron" && isMenzen) fu += 10;
    return Math.ceil(fu / 10) * 10;
  }

  function countDora(fullCounts, indicators) {
    let n = 0;
    for (const ind of indicators) n += fullCounts[tiles.nextDoraKind(ind)];
    return n;
  }

  function buildFullCounts(concealedCounts, openMelds) {
    const full = concealedCounts.slice();
    for (const m of openMelds) {
      if (m.type === "chi") { full[m.tiles[0]]++; full[m.tiles[0] + 1]++; full[m.tiles[0] + 2]++; }
      else if (m.type === "pon") full[m.tiles[0]] += 3;
      else if (m.type === "kan") full[m.tiles[0]] += 4;
    }
    return full;
  }

  // input: { concealedCounts[34] (includes the winning tile), openMelds:[{type:'chi'|'pon'|'kan', tiles:[kindIdx,...], concealed?}],
  //          winTile, winBy:'ron'|'tsumo', seatWind, roundWind, flags:{riichi,doubleRiichi,ippatsu,haitei,houtei,rinshan,chankan},
  //          doraIndicators:[kindIdx], uraDoraIndicators:[kindIdx] }
  // returns null if not a valid win (no yaku), else { yaku, han, fu, isYakuman }
  function evaluateWin(input) {
    const openMelds = input.openMelds || [];
    const flags = input.flags || {};
    const doraIndicators = input.doraIndicators || [];
    const uraDoraIndicators = input.uraDoraIndicators || [];
    const isMenzen = openMelds.every((m) => m.type === "kan" && m.concealed);
    const setsNeeded = 4 - openMelds.length;
    const fullCounts = buildFullCounts(input.concealedCounts, openMelds);

    const candidates = [];

    if (openMelds.length === 0 && hand.isChiitoi(input.concealedCounts)) {
      const yaku = [{ name: "Chiitoitsu (Seven Pairs)", han: 2 }];
      if (flags.doubleRiichi) yaku.push({ name: "Double Riichi", han: 2 });
      else if (flags.riichi) yaku.push({ name: "Riichi", han: 1 });
      if (flags.riichi && flags.ippatsu) yaku.push({ name: "Ippatsu", han: 1 });
      if (input.winBy === "tsumo") yaku.push({ name: "Menzen Tsumo", han: 1 });
      if (flags.haitei && input.winBy === "tsumo") yaku.push({ name: "Haitei Raoyue", han: 1 });
      if (flags.houtei && input.winBy === "ron") yaku.push({ name: "Houtei Raoyui", han: 1 });
      const suits = new Set();
      let honors = false;
      for (let i = 0; i < 34; i++) if (input.concealedCounts[i] > 0) (tiles.isHonor(i) ? (honors = true) : suits.add(tiles.suitOf(i)));
      if (suits.size === 1) yaku.push({ name: honors ? "Honitsu (Half Flush)" : "Chinitsu (Full Flush)", han: honors ? 3 : 6 });
      const hanFromYaku = yaku.reduce((a, y) => a + y.han, 0);
      const dora = countDora(fullCounts, doraIndicators) + (flags.riichi ? countDora(fullCounts, uraDoraIndicators) : 0);
      const finalYaku = dora > 0 ? yaku.concat([{ name: "Dora", han: dora }]) : yaku;
      candidates.push({ yaku: finalYaku, han: hanFromYaku + dora, fu: 25, isYakuman: false, hanFromYaku });
    }

    if (openMelds.length === 0 && hand.isKokushi(input.concealedCounts)) {
      candidates.push({ yaku: [{ name: "Kokushi Musou (Thirteen Orphans)", han: 13, yakuman: true }], han: 13, fu: 0, isYakuman: true, hanFromYaku: 13 });
    }

    const decomps = hand.decomposeConcealed(input.concealedCounts, setsNeeded);
    for (const d of decomps) {
      const groups = buildGroups(d.sets, openMelds, input.winTile, input.winBy);
      const wait = classifyWait(d.sets, d.pair, input.winTile);
      const yakuList = computeYaku(d.sets, d.pair, groups, isMenzen, input.winBy, input.seatWind, input.roundWind, flags, wait);
      const isYakumanHand = yakuList.some((y) => y.yakuman);
      let relevant = isYakumanHand ? yakuList.filter((y) => y.yakuman) : yakuList;
      const hanFromYaku = relevant.reduce((a, y) => a + y.han, 0);
      let dora = 0;
      if (!isYakumanHand) {
        dora = countDora(fullCounts, doraIndicators) + (flags.riichi ? countDora(fullCounts, uraDoraIndicators) : 0);
        if (dora > 0) relevant = relevant.concat([{ name: "Dora", han: dora }]);
      }
      const han = hanFromYaku + dora;
      const isPinfu = relevant.some((y) => y.name === "Pinfu");
      const fu = isYakumanHand ? 0 : computeFu(groups, d.pair, wait, input.winBy, isMenzen, input.seatWind, input.roundWind, isPinfu);
      candidates.push({ yaku: relevant, han, fu, isYakuman: isYakumanHand, hanFromYaku });
    }

    const valid = candidates.filter((c) => c.isYakuman || c.hanFromYaku >= 1);
    if (valid.length === 0) return null;
    valid.sort((a, b) => (b.isYakuman - a.isYakuman) || (b.han - a.han) || (b.fu - a.fu));
    return valid[0];
  }

  return { evaluateWin, buildGroups, classifyWait, computeFu, countDora };
});
