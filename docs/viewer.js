"use strict";

const API = "https://api.scryfall.com/cards/collection";
const CACHE_KEY = "dahlia-viewer-cards-v1";
const CACHE_MS = 24 * 3600 * 1000;       // Scryfall updates prices daily
const RARITY = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };
const SYMBOL = { eur: "EUR", usd: "USD" };

const $ = (id) => document.getElementById(id);
const state = { rows: [], cards: new Map(), view: "grid", currency: "eur" };

// --- CSV ---------------------------------------------------------------------------------
function parseCsv(text) {
  const out = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = ""; out.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

const pick = (r, ...names) => { for (const n of names) if (r[n] && r[n].trim()) return r[n].trim(); return ""; };

function finishOf(v) {
  v = v.toLowerCase();
  return v.includes("etched") ? "etched" : (v === "foil" || v === "true" || v === "yes") ? "foil" : "nonfoil";
}

// Column names are matched loosely, as the Dahlia app does when importing.
function rowsFromCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("The file has no rows.");
  const head = table[0].map((h) => h.trim().toLowerCase());
  const rows = [], problems = [];
  table.slice(1).forEach((cells, n) => {
    const r = {}; head.forEach((h, i) => { r[h] = cells[i] || ""; });
    const id = pick(r, "scryfall id", "scryfall_id", "scryfallid");
    const name = pick(r, "name", "card name", "card");
    const set = pick(r, "set code", "set", "edition code", "set_code").toLowerCase();
    const cn = pick(r, "collector number", "card number", "number", "collector_number", "cn");
    let ident;
    if (id) ident = { id };
    else if (set && cn) ident = { set, collector_number: cn };
    else if (name && set) ident = { name, set };
    else if (name) ident = { name };
    else { problems.push(`line ${n + 2}: no card name, set or Scryfall ID`); return; }
    const qty = Math.round(parseFloat(pick(r, "quantity", "count", "qty") || "1"));
    if (!(qty >= 1)) return;
    const paid = parseFloat(pick(r, "purchase price", "price paid", "purchase_price"));
    rows.push({
      ident, key: JSON.stringify(ident), name, set, qty,
      binder: pick(r, "binder name", "binder", "list name") || "Collection",
      kind: pick(r, "binder type").toLowerCase() || "binder",
      finish: finishOf(pick(r, "foil", "finish", "printing")),
      condition: pick(r, "condition").toLowerCase().replace(/ /g, "_") || "near_mint",
      language: pick(r, "language", "lang") || "en",
      paid: Number.isFinite(paid) ? paid : null,
      paidCurrency: pick(r, "purchase price currency", "purchase currency", "currency").toLowerCase(),
      added: pick(r, "added", "date added"),
    });
  });
  return { rows, problems };
}

// --- Scryfall ----------------------------------------------------------------------------
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* full or blocked: fine */ }
}

function slim(c) {
  const face = (c.card_faces && c.card_faces[0]) || {};
  const img = (c.image_uris || face.image_uris || {});
  return {
    id: c.id, name: c.name, set: c.set, cn: c.collector_number, setName: c.set_name, rarity: c.rarity,
    img: img.normal || img.small || "", small: img.small || img.normal || "", uri: c.scryfall_uri,
    finishes: c.finishes || [], prices: c.prices || {},
    faces: (c.card_faces || []).map((f) => f.name.toLowerCase()),
  };
}

function matches(card, ident) {
  if (ident.id) return card.id === ident.id;
  if (ident.collector_number) return card.set === ident.set && card.cn.toLowerCase() === ident.collector_number.toLowerCase();
  const n = ident.name.toLowerCase();
  return (card.name.toLowerCase() === n || card.faces.includes(n)) && (!ident.set || card.set === ident.set);
}

async function fetchCards(rows, onProgress) {
  const cache = loadCache(), now = Date.now();
  const need = new Map();
  for (const r of rows) {
    const hit = cache[r.key];
    if (hit && now - hit.t < CACHE_MS) state.cards.set(r.key, hit.card);
    else need.set(r.key, r.ident);
  }
  const list = [...need.entries()];
  for (let i = 0; i < list.length; i += 75) {
    onProgress(i, list.length);
    const chunk = list.slice(i, i + 75);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: chunk.map(([, id]) => id) }),
    });
    if (!res.ok) throw new Error(`Scryfall answered ${res.status}.`);
    const body = await res.json();
    const found = (body.data || []).map(slim);
    for (const [key, ident] of chunk) {
      const card = found.find((c) => matches(c, ident));
      if (card) { state.cards.set(key, card); cache[key] = { t: now, card }; }
    }
    if (i + 75 < list.length) await new Promise((r) => setTimeout(r, 120));   // Scryfall asks for 50-100 ms between calls
  }
  saveCache(cache);
}

// --- Money -------------------------------------------------------------------------------
const fmt = (v, cur = state.currency) =>
  v == null ? "–" : new Intl.NumberFormat(undefined, { style: "currency", currency: SYMBOL[cur] }).format(v);

function unitPrice(item) {
  const c = item.card;
  if (!c) return null;
  const p = c.prices, cur = state.currency;
  const suffix = item.finish === "foil" ? "_foil" : item.finish === "etched" ? "_etched" : "";
  const v = parseFloat(p[cur + suffix]);
  return Number.isFinite(v) ? v : null;
}

// --- View --------------------------------------------------------------------------------
function items() {
  const q = $("q").value.trim().toLowerCase(), binder = $("binder").value, finish = $("finish").value;
  const list = state.rows.map((r) => ({ ...r, card: state.cards.get(r.key) || null }))
    .filter((i) => (!binder || i.binder === binder) && (!finish || i.finish === finish))
    .filter((i) => !q || `${i.card ? i.card.name : i.name} ${i.card ? i.card.setName + " " + i.card.set : i.set}`.toLowerCase().includes(q));
  const nm = (i) => (i.card ? i.card.name : i.name);
  const by = {
    name: (a, b) => nm(a).localeCompare(nm(b)),
    price: (a, b) => (unitPrice(b) ?? -1) - (unitPrice(a) ?? -1),
    total: (a, b) => (unitPrice(b) ?? -1) * b.qty - (unitPrice(a) ?? -1) * a.qty,
    set: (a, b) => (a.card ? a.card.set : a.set).localeCompare(b.card ? b.card.set : b.set) || nm(a).localeCompare(nm(b)),
    rarity: (a, b) => (RARITY[b.card?.rarity] ?? -1) - (RARITY[a.card?.rarity] ?? -1) || nm(a).localeCompare(nm(b)),
    added: (a, b) => b.added.localeCompare(a.added),
  }[$("sort").value];
  return list.sort(by);
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pretty = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function renderStats(list) {
  let copies = 0, value = 0, paid = 0, paidKnown = 0, unpriced = 0;
  for (const i of list) {
    copies += i.qty;
    const u = unitPrice(i);
    if (u == null) unpriced += i.qty; else value += u * i.qty;
    if (i.paid != null && (i.paidCurrency === state.currency || !i.paidCurrency) && u != null) {
      paid += i.paid * i.qty; paidKnown += u * i.qty;
    }
  }
  const stats = $("stats"); stats.replaceChildren();
  const add = (big, small, cls) => { const d = el("div", "stat"); d.append(el("b", cls, big), el("small", null, small)); stats.append(d); };
  add(String(copies), `cards (${list.length} entries)`);
  add(fmt(value), unpriced ? `current value (${unpriced} unpriced)` : "current value");
  if (paid > 0) {
    add(fmt(paid), "paid, where recorded");
    const diff = paidKnown - paid;
    add((diff >= 0 ? "+" : "") + fmt(diff), "gain on those cards", diff >= 0 ? "up" : "down");
  }
}

function renderGrid(list) {
  const g = $("grid"); g.replaceChildren();
  for (const i of list) {
    const c = i.card, u = unitPrice(i);
    const card = el("article", "card");
    const art = el("a", "art" + (i.finish !== "nonfoil" ? " shine" : ""));
    if (c) { art.href = c.uri; art.target = "_blank"; art.rel = "noopener"; }
    if (c && c.img) { const img = el("img"); img.src = c.img; img.alt = c.name; img.loading = "lazy"; art.append(img); }
    if (i.qty > 1) art.append(el("span", "qty", "×" + i.qty));
    const meta = el("div", "meta");
    meta.append(el("div", "nm", c ? c.name : i.name));
    meta.append(el("div", "sub", [c ? `${c.set.toUpperCase()} #${c.cn}` : i.set.toUpperCase(),
      i.finish !== "nonfoil" ? pretty(i.finish) : "", pretty(i.condition)].filter(Boolean).join(" · ")));
    const price = el("div", "price"); price.append(el("span", null, fmt(u)));
    if (i.qty > 1 && u != null) price.append(el("span", "sub", fmt(u * i.qty)));
    meta.append(price);
    card.append(art, meta); g.append(card);
  }
}

function renderTable(list) {
  const body = $("table").tBodies[0]; body.replaceChildren();
  for (const i of list) {
    const c = i.card, u = unitPrice(i), tr = el("tr");
    const name = el("td", "nm");
    if (c && c.small) { const img = el("img"); img.src = c.small; img.alt = ""; img.loading = "lazy"; name.append(img); }
    name.append(document.createTextNode(c ? c.name : i.name));
    tr.append(name, el("td", null, c ? `${c.setName} (${c.set.toUpperCase()}) #${c.cn}` : i.set.toUpperCase()),
      el("td", null, pretty(i.finish)), el("td", null, pretty(i.condition)), el("td", "n", String(i.qty)),
      el("td", "n", fmt(u)), el("td", "n", u == null ? "–" : fmt(u * i.qty)),
      el("td", "n", i.paid == null ? "–" : fmt(i.paid, SYMBOL[i.paidCurrency] ? i.paidCurrency : state.currency)),
      el("td", null, i.binder));
    body.append(tr);
  }
}

function render() {
  const list = items();
  renderStats(list);
  $("grid").hidden = state.view !== "grid";
  $("tablewrap").hidden = state.view !== "table";
  (state.view === "grid" ? renderGrid : renderTable)(list);
}

function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.className = "status" + (err ? " err" : ""); }

async function load(text) {
  let parsed;
  try { parsed = rowsFromCsv(text); } catch (e) { alert(e.message); return; }
  state.rows = parsed.rows; state.cards.clear();
  $("drop").hidden = true; $("app").hidden = false;
  const binders = [...new Set(state.rows.map((r) => r.binder))].sort();
  $("binder").replaceChildren(new Option("All binders and lists", ""), ...binders.map((b) => new Option(b, b)));
  render();
  const note = parsed.problems.length ? ` Skipped ${parsed.problems.length} rows (${parsed.problems[0]}).` : "";
  try {
    setStatus("Fetching card images and prices from Scryfall…");
    await fetchCards(state.rows, (done, total) => setStatus(`Fetching from Scryfall… ${done} of ${total}`));
    const missing = state.rows.filter((r) => !state.cards.has(r.key)).length;
    setStatus((missing ? `${missing} rows were not found on Scryfall.` : "Prices are Scryfall's, updated daily.") + note, missing > 0);
  } catch (e) {
    setStatus(`Couldn't reach Scryfall: ${e.message} Showing the file without images or prices.` + note, true);
  }
  render();
}

// --- Wiring ------------------------------------------------------------------------------
const readFile = (f) => f.text().then(load);
$("file").addEventListener("change", (e) => e.target.files[0] && readFile(e.target.files[0]));
$("sample").addEventListener("click", () => fetch("sample.csv").then((r) => r.text()).then(load));
const drop = $("drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
["q", "binder", "finish", "sort"].forEach((id) => $(id).addEventListener("input", render));
$("currency").addEventListener("change", (e) => { state.currency = e.target.value; render(); });
for (const v of ["grid", "table"]) {
  $("v-" + v).addEventListener("click", () => {
    state.view = v;
    $("v-grid").setAttribute("aria-pressed", v === "grid");
    $("v-table").setAttribute("aria-pressed", v === "table");
    render();
  });
}
