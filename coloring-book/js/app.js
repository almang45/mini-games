// Buku Mewarnai controller: draws the pictures from js/pictures.js as SVG, fills a region with
// the chosen crayon on tap, keeps undo and saved fills through js/book.js, and exports a PNG.
// Crayon colors and their names come from color-fusion/js/mix.js; speech, sound and the header
// toggles from shared/kids/kids.js.
(function () {
  "use strict";
  const MIX = window.MIX;
  const KIDS = window.KIDS;
  const PIC = window.PICTURES;
  const BOOK = window.BOOK;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = "coloring-book.v1";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const INK = "#22324b";
  const BLANK = "#ffffff";
  const EXPORT_PX = 1200;
  const CRAYONS = ["red", "pink", "orange", "yellow", "light-green", "green", "light-blue",
    "blue", "indigo", "purple", "brown", "gray", "black", "white"];

  const STRINGS = {
    id: {
      back: "← Semua Game",
      language: "Bahasa",
      sound: "Suara",
      title: "Buku Mewarnai",
      pictures: "Gambar",
      crayons: "Krayon",
      undo: "Ups",
      undoLabel: "Batalkan warna terakhir",
      clear: "Hapus",
      clearLabel: "Hapus semua warna",
      save: "Simpan",
      saveLabel: "Simpan gambar",
      saved: "Gambar disimpan!",
      saveFailed: "Gambar tidak bisa disimpan",
      done: "Gambar selesai! Bagus sekali!",
      picture: "{name}, {n} dari {total} bagian diwarnai",
      file: "buku-mewarnai",
    },
    en: {
      back: "← All Games",
      language: "Language",
      sound: "Sound",
      title: "Coloring Book",
      pictures: "Pictures",
      crayons: "Crayons",
      undo: "Oops",
      undoLabel: "Undo the last color",
      clear: "Clear",
      clearLabel: "Clear all colors",
      save: "Save",
      saveLabel: "Save the picture",
      saved: "Picture saved!",
      saveFailed: "Couldn't save the picture",
      done: "All colored in! Beautiful!",
      picture: "{name}, {n} of {total} parts colored",
      file: "coloring-book",
    },
  };
  const t = KIDS.translator(STRINGS);

  // ---- saved pictures ------------------------------------------------------------

  const regionIds = (picture) => picture.regions.map((r) => r.id);

  function loadSave() {
    const data = KIDS.load(STORE_KEY) || {};
    const fills = {};
    for (const picture of PIC.PICTURES) {
      const raw = data.fills && typeof data.fills === "object" ? data.fills[picture.id] : null;
      fills[picture.id] = BOOK.sanitizeFills(raw, regionIds(picture), CRAYONS);
    }
    return {
      picture: PIC.PICTURES_BY_ID[data.picture] ? data.picture : PIC.PICTURES[0].id,
      crayon: CRAYONS.includes(data.crayon) ? data.crayon : "red",
      fills,
    };
  }

  const saved = loadSave();
  // Undo history lives only as long as the page; the fills themselves are saved.
  const states = Object.fromEntries(PIC.PICTURES.map((p) => [p.id, BOOK.createState(saved.fills[p.id])]));
  const celebrated = new Set(PIC.PICTURES.filter((p) => BOOK.coloredShare(saved.fills[p.id], regionIds(p)) === 1).map((p) => p.id));

  function persist() {
    const fills = Object.fromEntries(PIC.PICTURES.map((p) => [p.id, states[p.id].fills]));
    KIDS.save(STORE_KEY, { picture: saved.picture, crayon: saved.crayon, fills });
  }

  const picture = () => PIC.PICTURES_BY_ID[saved.picture];
  const state = () => states[saved.picture];
  const colorHex = (id) => MIX.toHex(MIX.NAMED_BY_ID[id].rgb);
  const colorName = (id) => MIX.NAMED_BY_ID[id].name[KIDS.prefs.lang];

  // ---- drawing --------------------------------------------------------------------

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    return el;
  }

  let renderCount = 0;

  // Draws `pic` with `fills` into `svg`. Everything is set as attributes rather than CSS so a
  // serialized copy (the PNG export) looks the same. `prefix` keeps clip-path ids unique when
  // the page and its thumbnail are both on screen.
  function drawPicture(svg, pic, fills, interactive) {
    const prefix = "pic" + ++renderCount + "-";
    const stroke = { stroke: INK, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" };
    svg.setAttribute("viewBox", "0 0 " + PIC.SIZE + " " + PIC.SIZE);
    const defs = svgEl("defs", {});
    const page = svgEl("clipPath", { id: prefix + "page" });
    page.append(svgEl("rect", { x: 0, y: 0, width: PIC.SIZE, height: PIC.SIZE, rx: 22 }));
    defs.append(page);
    const group = svgEl("g", { "clip-path": "url(#" + prefix + "page)" });
    const byId = {};
    for (const region of pic.regions) {
      byId[region.id] = region;
      const attrs = Object.assign({ fill: fills[region.id] ? colorHex(fills[region.id]) : BLANK }, stroke, region.attrs);
      if (region.clip) {
        const clip = svgEl("clipPath", { id: prefix + "clip-" + region.id });
        const shape = byId[region.clip];
        clip.append(svgEl(shape.tag, shape.attrs));
        defs.append(clip);
        attrs["clip-path"] = "url(#" + prefix + "clip-" + region.id + ")";
      }
      const el = svgEl(region.tag, attrs);
      if (interactive) el.setAttribute("data-region", region.id);
      group.append(el);
    }
    for (const d of pic.lines) group.append(svgEl("path", Object.assign({ d, fill: "none", "pointer-events": "none" }, stroke)));
    // The page edge, drawn last so fills never cover it.
    group.append(svgEl("rect", { x: 2, y: 2, width: PIC.SIZE - 4, height: PIC.SIZE - 4, rx: 20, fill: "none", stroke: INK, "stroke-width": 4, "pointer-events": "none" }));
    svg.replaceChildren(defs, group);
  }

  function crayonSvg(color) {
    const fill = colorHex(color);
    const svg = svgEl("svg", { viewBox: "0 0 40 68", "aria-hidden": "true" });
    const edge = color === "white" ? { stroke: "rgba(34,50,75,0.3)", "stroke-width": 1.5 } : {};
    svg.append(
      svgEl("path", Object.assign({ d: "M11 18 L18 2 Q20 -1 22 2 L29 18 Z", fill }, edge)),
      svgEl("rect", Object.assign({ x: 9, y: 16, width: 22, height: 50, rx: 3, fill }, edge)),
      svgEl("rect", { x: 9, y: 26, width: 22, height: 4, fill: "rgba(0,0,0,0.18)" }),
      svgEl("rect", { x: 9, y: 54, width: 22, height: 4, fill: "rgba(0,0,0,0.18)" }),
      svgEl("rect", { x: 12.5, y: 20, width: 3.5, height: 42, rx: 1.5, fill: "rgba(255,255,255,0.4)" }),
    );
    return svg;
  }

  // ---- coloring --------------------------------------------------------------------

  const pictureEl = $("picture");
  const easelEl = $("easel");

  function paint(regionId) {
    const before = state();
    const after = BOOK.paint(before, regionId, saved.crayon);
    if (after === before) return;
    states[saved.picture] = after;
    KIDS.sfx.pop();
    const el = pictureEl.querySelector('[data-region="' + regionId + '"]');
    if (el) el.setAttribute("fill", colorHex(saved.crayon));
    afterChange();
    const done = BOOK.coloredShare(after.fills, regionIds(picture())) === 1;
    if (done && !celebrated.has(saved.picture)) {
      celebrated.add(saved.picture);
      KIDS.sfx.fanfare();
      KIDS.burst(KIDS.centerOf(pictureEl), CRAYONS.slice(0, 10).map(colorHex), 30);
      KIDS.toast("🎉 " + t("done"));
      KIDS.speak(t("done"), 300);
    }
  }

  function afterChange() {
    persist();
    renderPageLabel();
    renderButtons();
    renderThumb(saved.picture);
  }

  function undo() {
    states[saved.picture] = BOOK.undo(state());
    drawPicture(pictureEl, picture(), state().fills, true);
    afterChange();
  }

  function clearPage() {
    states[saved.picture] = BOOK.clear(state());
    celebrated.delete(saved.picture);
    drawPicture(pictureEl, picture(), state().fills, true);
    afterChange();
  }

  function choosePicture(id) {
    if (id === saved.picture) return;
    saved.picture = id;
    persist();
    renderAll();
    KIDS.speak(picture().name[KIDS.prefs.lang], 0);
  }

  function chooseCrayon(color) {
    saved.crayon = color;
    persist();
    renderCrayons();
    KIDS.sfx.tap();
    KIDS.speak(colorName(color), 0);
  }

  // ---- saving a PNG --------------------------------------------------------------------

  function savePng() {
    // XMLSerializer adds the namespace itself; setting xmlns as an attribute can duplicate it.
    const copy = svgEl("svg", { width: EXPORT_PX, height: EXPORT_PX });
    drawPicture(copy, picture(), state().fills, false);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
    const img = new Image();
    const fail = (err) => {
      URL.revokeObjectURL(url);
      console.warn("Buku Mewarnai: couldn't save the picture", err);
      KIDS.toast(t("saveFailed"));
    };
    img.onerror = fail;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_PX;
      canvas.height = EXPORT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) { fail(new Error("no 2D canvas")); return; }
      ctx.drawImage(img, 0, 0, EXPORT_PX, EXPORT_PX);
      canvas.toBlob((blob) => {
        if (!blob) { fail(new Error("empty PNG")); return; }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = t("file") + "-" + picture().name[KIDS.prefs.lang].toLowerCase().replace(/\s+/g, "-") + ".png";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        KIDS.sfx.chime();
        KIDS.toast("💾 " + t("saved"));
      }, "image/png");
    };
    img.src = url;
  }

  // ---- rendering ---------------------------------------------------------------------------

  const thumbs = {};

  function renderPages() {
    $("pages").replaceChildren(...PIC.PICTURES.map((pic) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-thumb";
      btn.setAttribute("aria-current", String(pic.id === saved.picture));
      btn.setAttribute("aria-label", pic.name[KIDS.prefs.lang]);
      const svg = svgEl("svg", { "aria-hidden": "true" });
      drawPicture(svg, pic, states[pic.id].fills, false);
      btn.append(svg);
      btn.addEventListener("click", () => choosePicture(pic.id));
      thumbs[pic.id] = svg;
      return btn;
    }));
    const current = $("pages").querySelector('[aria-current="true"]');
    if (current && typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function renderThumb(id) {
    if (thumbs[id]) drawPicture(thumbs[id], PIC.PICTURES_BY_ID[id], states[id].fills, false);
  }

  function renderCrayons() {
    $("crayons").replaceChildren(...CRAYONS.map((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crayon";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(color === saved.crayon));
      btn.setAttribute("aria-label", colorName(color));
      btn.dataset.color = color;
      btn.append(crayonSvg(color));
      btn.addEventListener("click", () => chooseCrayon(color));
      return btn;
    }));
  }

  function renderPageLabel() {
    const ids = regionIds(picture());
    const colored = ids.filter((id) => state().fills[id]).length;
    pictureEl.setAttribute("aria-label", t("picture", { name: picture().name[KIDS.prefs.lang], n: colored, total: ids.length }));
  }

  function renderButtons() {
    $("btnUndo").disabled = state().history.length === 0;
    $("btnClear").disabled = Object.keys(state().fills).length === 0;
  }

  function fitPage() {
    const style = getComputedStyle(easelEl);
    const w = easelEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = easelEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    pictureEl.style.setProperty("--page", Math.max(0, Math.floor(Math.min(w, h))) + "px");
  }

  function renderAll() {
    drawPicture(pictureEl, picture(), state().fills, true);
    renderPages();
    renderCrayons();
    renderPageLabel();
    renderButtons();
  }

  // ---- wiring -------------------------------------------------------------------------------

  pictureEl.addEventListener("click", (e) => {
    const region = e.target.closest("[data-region]");
    if (region) paint(region.getAttribute("data-region"));
  });
  $("btnUndo").addEventListener("click", undo);
  $("btnClear").addEventListener("click", clearPage);
  $("btnSave").addEventListener("click", savePng);

  if (typeof ResizeObserver === "function") new ResizeObserver(fitPage).observe(easelEl);
  else window.addEventListener("resize", fitPage);

  KIDS.bindHeader();
  KIDS.onPrefs(() => {
    KIDS.applyText(t);
    renderAll();
  });
  KIDS.applyText(t);
  renderAll();
  fitPage();
})();
