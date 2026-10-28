// WTL Prep — League of Legends tier lists (TierMaker-style drag & drop) and draft practice.
// Champion data and portraits come from Riot's Data Dragon CDN, so new champions appear automatically.

const STORAGE_KEY = "lol-tierlist-v1";
const COLORS = [
  "#ff7f7f", "#ffbf7f", "#ffdf7f", "#ffff7f", "#bfff7f", "#7fff7f",
  "#7fffff", "#7fbfff", "#7f7fff", "#ff7fff", "#bf7fbf", "#cfcfcf",
];
const DEFAULT_ROWS = [
  { label: "S", color: "#ff7f7f" },
  { label: "A", color: "#ffbf7f" },
  { label: "B", color: "#ffdf7f" },
  { label: "C", color: "#ffff7f" },
  { label: "D", color: "#bfff7f" },
];

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const PLAYER_SLOTS = 5;
const ROLE_TAGS = { Top: "TOP", Jungle: "JGL", Mid: "MID", Bot: "BOT", Support: "SUP" };

// Tier list entries are keys: "Ahri" for an unassigned champion, or "Ahri|<playerId>" for a
// specific player's Ahri. That lets the same champion be ranked once per player.
const entryKey = (id, pid) => (pid ? `${id}|${pid}` : id);
const parseKey = (key) => { const [id, pid] = String(key).split("|"); return { id, pid: pid || null }; };
// Starters (always 5) plus any number of substitutes share the same shape.
const allPlayers = () => [...state.players, ...state.subs];
const playerById = (pid) => allPlayers().find((p) => p.id === pid);
const isSub = (p) => state.subs.includes(p);
function playerLabel(p) {
  if (p.name.trim()) return p.name.trim();
  return isSub(p) ? `Substitute ${state.subs.indexOf(p) + 1}` : `Player ${state.players.indexOf(p) + 1}`;
}
const roleTagText = (p) => (isSub(p) ? `SUB ${ROLE_TAGS[p.role]}` : ROLE_TAGS[p.role]);
// Bot lane pairings are tier list entries too: "pair:<pairId>", rendered as one "A & B" tile.
const isPairKey = (key) => String(key).startsWith("pair:");
const pairById = (id) => state.pairs.find((p) => p.id === id);
// Player and pair entries live in the Player Pools tab; dropping them on a pool unranks them.
const isOwnedKey = (key) => isPairKey(key) || !!parseKey(key).pid;
// A hidden player (or the hidden pairings card) keeps its tier list entries in place, just not shown.
function isHiddenKey(key) {
  if (isPairKey(key)) return state.pairsHidden;
  const { pid } = parseKey(key);
  return !!(pid && playerById(pid)?.hidden);
}

let champions = {}; // id -> { id, name, img }
let state = null;    // { title, rows: [{ id, label, color, items }], players: [{ id, name, role, champs }] }
let editingRowId = null;
let editingPlayerId = null;

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 9);

// Comps tab: named tiers, each holding comps of 5 slots (role + champion).
const newComp = () => ({
  id: uid(), name: "", side: "either", b1: null, notes: "",
  slots: ROLES.map((role) => ({ role, champ: null, alts: [null, null] })),
});
function defaultCompTiers() {
  return [
    { id: uid(), name: "S", color: "#ff7f7f", comps: [newComp()] },
    { id: uid(), name: "A", color: "#ffbf7f", comps: [] },
    { id: uid(), name: "B", color: "#ffdf7f", comps: [] },
  ];
}

function defaultState() {
  return {
    title: "League of Legends – All Champions Tier List",
    rows: DEFAULT_ROWS.map((r) => ({ id: uid(), ...r, items: [] })),
    players: defaultPlayers(),
    subs: [],
    pairs: [],
    pairsHidden: false,
    compTiers: defaultCompTiers(),
  };
}

function defaultPlayers() {
  return ROLES.map((role) => ({ id: uid(), name: "", role, champs: [], hidden: false }));
}

// ---------- Data ----------
async function loadChampions() {
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json());
  const v = versions[0];
  const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`).then((r) => r.json());
  Object.values(data.data)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => {
      champions[c.id] = {
        id: c.id,
        name: c.name,
        img: `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${c.image.full}`,
      };
    });
  $("#patch").textContent = `Patch data ${v} · ${Object.keys(champions).length} champions`;
}

// ---------- Persistence ----------
const changeListeners = [];
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  changeListeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
}

// Detaching tells the account code that the list on screen no longer belongs to a
// saved cloud list (it came from a share link or an imported file).
let loadedFromShareLink = false;
const detachFromCloud = () => window.dispatchEvent(new Event("tl:detach"));

function encodeState(s) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}
function decodeState(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str))));
}

function validState(s) {
  return s && Array.isArray(s.rows) && s.rows.every((r) => Array.isArray(r.items));
}

function loadState() {
  // A shared link (#list=...) takes priority over what's saved locally.
  const m = location.hash.match(/list=([^&]+)/);
  if (m) {
    try {
      const s = decodeState(decodeURIComponent(m[1]));
      if (validState(s)) {
        history.replaceState(null, "", location.pathname + location.search);
        loadedFromShareLink = true;
        return normalize(s);
      }
    } catch (_) {}
  }
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validState(s)) return normalize(s);
  } catch (_) {}
  return defaultState();
}

function normalize(s) {
  s.title = s.title || defaultState().title;

  // Always exactly 5 player slots; each pool holds known champions, no duplicates.
  const players = Array.isArray(s.players) ? s.players.slice(0, PLAYER_SLOTS) : [];
  while (players.length < PLAYER_SLOTS) players.push({ name: "", role: ROLES[players.length], champs: [] });
  const cleanPlayer = (p, defaultRole) => ({
    id: p.id || uid(),
    name: typeof p.name === "string" ? p.name : "",
    role: ROLES.includes(p.role) ? p.role : defaultRole,
    champs: [...new Set(Array.isArray(p.champs) ? p.champs : [])].filter((id) => champions[id]),
    hidden: !!p.hidden,
  });
  s.players = players.map((p, i) => cleanPlayer(p, ROLES[i]));
  s.subs = (Array.isArray(s.subs) ? s.subs : []).filter((p) => p && typeof p === "object").map((p) => cleanPlayer(p, ROLES[0]));
  s.pairsHidden = !!s.pairsHidden;
  s.compTiers = (Array.isArray(s.compTiers) ? s.compTiers : defaultCompTiers())
    .filter((t) => t && typeof t === "object")
    .map((t) => ({
      id: t.id || uid(),
      name: typeof t.name === "string" ? t.name : "",
      color: typeof t.color === "string" ? t.color : "#cfcfcf",
      comps: (Array.isArray(t.comps) ? t.comps : []).filter((c) => c && typeof c === "object").map((c) => ({
        id: c.id || uid(),
        name: typeof c.name === "string" ? c.name : "",
        side: ["blue", "red", "either"].includes(c.side) ? c.side : "either",
        b1: Number.isInteger(c.b1) && c.b1 >= 0 && c.b1 < 5 ? c.b1 : null,
        notes: typeof c.notes === "string" ? c.notes : "",
        slots: ROLES.map((role, i) => {
          const sl = (Array.isArray(c.slots) && c.slots[i]) || {};
          const alts = Array.isArray(sl.alts) ? sl.alts : [];
          return {
            role: ROLES.includes(sl.role) ? sl.role : role,
            champ: champions[sl.champ] ? sl.champ : null,
            alts: [0, 1].map((k) => (champions[alts[k]] ? alts[k] : null)), // two adaptation picks per role
          };
        }),
      })),
    }));
  const everyone = [...s.players, ...s.subs];

  // Bot lane pairings: any two known champions; the same champion can be in many pairs.
  s.pairs = (Array.isArray(s.pairs) ? s.pairs : [])
    .filter((p) => p && champions[p.a] && champions[p.b])
    .map((p) => ({ id: p.id || uid(), a: p.a, b: p.b }));

  // Drop unknown champions, entries for champions no longer in that player's pool, and duplicates.
  const seen = new Set();
  s.rows.forEach((r) => {
    r.id = r.id || uid();
    r.color = r.color || "#cfcfcf";
    r.label = r.label ?? "";
    r.items = r.items.filter((key) => {
      if (seen.has(key)) return false;
      if (isPairKey(key)) {
        if (!s.pairs.some((p) => `pair:${p.id}` === key)) return false;
        seen.add(key);
        return true;
      }
      const { id, pid } = parseKey(key);
      if (!champions[id]) return false;
      if (pid) {
        const pl = everyone.find((x) => x.id === pid);
        if (!pl || !pl.champs.includes(id)) return false;
      }
      seen.add(key);
      return true;
    });
  });
  return s;
}

// ---------- Rendering ----------
function itemEl(key) {
  return isPairKey(key) ? pairEl(key) : champEl(key);
}

function pairEl(key) {
  const pair = pairById(key.slice(5));
  const a = champions[pair.a], b = champions[pair.b];
  const el = document.createElement("div");
  el.className = "champ pair";
  el.dataset.key = key;
  el.dataset.pair = pair.id;
  el.title = `${a.name} & ${b.name}`;
  el.innerHTML = `
    <img crossorigin="anonymous" src="${a.img}" alt="${a.name}" loading="lazy">
    <span class="amp">&amp;</span>
    <img crossorigin="anonymous" src="${b.img}" alt="${b.name}" loading="lazy">
    <span class="name">${a.name} &amp; ${b.name}</span>
    <span class="role-tag role-duo">BOT LANE</span>`;
  return el;
}

function addTierBadge(el, row) {
  if (!row) return;
  const badge = document.createElement("span");
  badge.className = "tier-badge";
  badge.textContent = row.label.trim().slice(0, 3) || "•";
  badge.style.background = row.color;
  badge.title = `Ranked in ${row.label || "a tier"}`;
  el.appendChild(badge);
}

function removeButton(title, onClick) {
  const rm = document.createElement("button");
  rm.className = "remove";
  rm.title = title;
  rm.textContent = "×";
  rm.addEventListener("click", onClick);
  return rm;
}

function champEl(key) {
  const { id, pid } = parseKey(key);
  const c = champions[id];
  const el = document.createElement("div");
  el.className = "champ";
  el.dataset.id = id;
  el.dataset.key = key;
  el.title = c.name;
  el.innerHTML = `<img crossorigin="anonymous" src="${c.img}" alt="${c.name}" loading="lazy"><span class="name">${c.name}</span>`;
  const pl = pid && playerById(pid);
  if (pl) {
    const tag = document.createElement("span");
    tag.className = `role-tag role-${pl.role.toLowerCase()}`;
    tag.textContent = roleTagText(pl);
    el.appendChild(tag);
    el.title = `${c.name} — ${playerLabel(pl)} (${isSub(pl) ? "Sub " : ""}${pl.role})`;
  }
  return el;
}

function render() {
  $("#title").value = state.title;
  const list = $("#tierlist");
  // Only shown in the downloaded PNG: one WTL blue band with the logo, "WTL Prep" and the list title.
  list.innerHTML = `
    <div class="export-head">
      <div class="export-band">
        <img src="assets/wtl-logo.png" alt="WTL" width="66" height="40">
        <span class="export-brand">WTL <span class="brand-sub">Prep</span></span>
        <span class="export-title"></span>
      </div>
    </div>`;
  list.querySelector(".export-title").textContent = state.title;

  state.rows.forEach((row, i) => {
    const r = document.createElement("div");
    r.className = "tier-row";
    r.dataset.id = row.id;
    r.innerHTML = `
      <div class="tier-label" contenteditable="true" spellcheck="false" style="background:${row.color}"></div>
      <div class="tier-items" data-row="${row.id}"></div>
      <div class="row-settings">
        <button title="Row settings" data-act="settings">⚙</button>
        <button title="Move up" data-act="up" ${i === 0 ? "disabled" : ""}>▲</button>
        <button title="Move down" data-act="down" ${i === state.rows.length - 1 ? "disabled" : ""}>▼</button>
      </div>`;
    const label = r.querySelector(".tier-label");
    label.textContent = row.label;
    label.addEventListener("input", () => { row.label = label.textContent; save(); });
    label.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); label.blur(); } });

    const items = r.querySelector(".tier-items");
    row.items.filter((key) => !isHiddenKey(key)).forEach((key) => {
      const el = itemEl(key);
      el.appendChild(removeButton(`Remove ${el.title} from the tier list`, () => {
        // Unranks the entry: plain champions go back to the All Champions pool,
        // player and pair entries stay available in the Player Pools tab.
        row.items = row.items.filter((k) => k !== key);
        save(); render();
      }));
      items.appendChild(el);
    });

    r.querySelector(".row-settings").addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (act === "settings") openRowDialog(row.id);
      if (act === "up") moveRow(i, -1);
      if (act === "down") moveRow(i, 1);
    });
    list.appendChild(r);
  });

  // Pool = every champion whose unassigned entry isn't placed in a tier.
  const placed = new Set(state.rows.flatMap((r) => r.items));
  const pool = $("#pool");
  pool.innerHTML = "";
  Object.keys(champions).forEach((id) => { if (!placed.has(id)) pool.appendChild(champEl(id)); });

  applySearch();
  updateCount();
  renderPlayers();
  renderHiddenNote();
}

// A note under the toolbar so hidden entries are never a mystery.
function renderHiddenNote() {
  const hidden = allPlayers().filter((p) => p.hidden).map(playerLabel);
  if (state.pairsHidden) hidden.push("Bot Lane Pairings");
  const note = $("#hidden-note");
  note.hidden = !hidden.length;
  if (!hidden.length) return;
  note.innerHTML = `<span>Hidden on the tier list: <strong></strong></span> <button type="button" class="link-btn">Show all</button>`;
  note.querySelector("strong").textContent = hidden.join(", ");
  note.querySelector("button").addEventListener("click", () => {
    allPlayers().forEach((p) => (p.hidden = false));
    state.pairsHidden = false;
    save(); render();
  });
}

// ---------- Player pools ----------
function tierOf() {
  // entry key -> row, for the tier badges on player pool tiles
  const map = {};
  state.rows.forEach((r) => r.items.forEach((id) => (map[id] = r)));
  return map;
}

const EYE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function visibilityButton(hidden, onToggle) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn small vis-toggle" + (hidden ? " off" : "");
  b.title = hidden ? "Hidden from the tier list — click to show (the pool and positions are kept)" : "Shown on the tier list — click to hide (the pool and positions are kept)";
  b.innerHTML = `${hidden ? EYE_OFF : EYE}<span>${hidden ? "Hidden" : "Shown"}</span>`;
  b.addEventListener("click", onToggle);
  return b;
}

// Pools are edited in the Player Pools tab (editor cards) and shown read-only in the
// Tier List tab's Player Pools section (display cards, the drag source for the tier list).
function renderPlayers() {
  renderPoolDisplay();
  renderPoolEditor();
}

function renderPoolDisplay() {
  const tiers = tierOf();
  const wrap = $("#players");
  wrap.innerHTML = "";
  state.players.forEach((p) => wrap.appendChild(displayCard(p, tiers)));
  const pairs = $("#pairs");
  pairs.innerHTML = "";
  pairs.appendChild(pairsDisplayCard(tiers));
  const subs = $("#subs");
  subs.innerHTML = "";
  state.subs.forEach((p) => subs.appendChild(displayCard(p, tiers)));
  $("#subs-wrap").hidden = !state.subs.length;
}

function renderPoolEditor() {
  const tiers = tierOf();
  const wrap = $("#ed-players");
  wrap.innerHTML = "";
  state.players.forEach((p) => wrap.appendChild(editorCard(p, tiers)));
  const pairs = $("#ed-pairs");
  pairs.innerHTML = "";
  pairs.appendChild(pairsEditorCard(tiers));
  const subs = $("#ed-subs");
  subs.innerHTML = "";
  state.subs.forEach((p) => subs.appendChild(editorCard(p, tiers)));
  $("#subs-empty").hidden = state.subs.length > 0;
}

// Jump to the Player Pools tab, optionally to one card.
function goToPools(id) {
  window.TLShowView?.("pools");
  if (!id) return window.scrollTo({ top: 0 });
  const card = document.querySelector(`#view-pools .player-card[data-id="${id}"]`);
  card?.scrollIntoView({ block: "center" });
  card?.classList.add("flash");
  setTimeout(() => card?.classList.remove("flash"), 1200);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto=pools]");
  if (b) goToPools(b.dataset.id);
});

const placeholderFor = (p) => (isSub(p) ? `Substitute ${state.subs.indexOf(p) + 1}` : `Player ${state.players.indexOf(p) + 1}`);
const roleTagEl = (p) => `<span class="role-tag role-${p.role.toLowerCase()} head-role">${roleTagText(p)}</span>`;

// Read-only card in the Tier List tab: drag source, tier badges, show/hide.
function displayCard(p, tiers) {
  const card = document.createElement("div");
  card.className = "player-card display-card" + (isSub(p) ? " sub-card" : "") + (p.hidden ? " is-hidden" : "");
  card.dataset.id = p.id;
  card.innerHTML = `
    <div class="player-head">
      ${roleTagEl(p)}
      <span class="pc-name${p.name.trim() ? "" : " placeholder"}"></span>
      <span class="muted player-count">${p.champs.length} champ${p.champs.length === 1 ? "" : "s"}</span>
      <span class="head-actions"><button class="btn small" data-goto="pools" data-id="${p.id}">Edit</button></span>
    </div>
    <div class="player-pool"></div>`;
  card.querySelector(".pc-name").textContent = playerLabel(p);
  card.querySelector(".head-actions").prepend(visibilityButton(p.hidden, () => { p.hidden = !p.hidden; save(); render(); }));
  const pool = card.querySelector(".player-pool");
  if (!p.champs.length) {
    pool.innerHTML = `<button class="empty-pool" data-goto="pools" data-id="${p.id}">No champions yet — add them in the Player Pools tab</button>`;
  }
  p.champs.forEach((id) => {
    const el = champEl(id);
    el.classList.add("pp");
    el.dataset.owner = p.id;
    addTierBadge(el, tiers[entryKey(id, p.id)]);
    pool.appendChild(el);
  });
  return card;
}

// Editable card in the Player Pools tab: name, role, pool, delete (subs).
function editorCard(p, tiers) {
  const sub = isSub(p);
  const placeholder = placeholderFor(p);
  const card = document.createElement("div");
  card.className = "player-card editor-card" + (sub ? " sub-card" : "");
  card.dataset.id = p.id;
  card.innerHTML = `
    <div class="player-head">
      ${sub ? `<span class="sub-badge">SUB</span>` : ""}
      <input class="player-name" maxlength="24" placeholder="${placeholder}" aria-label="${placeholder} name" />
      <select class="player-role" aria-label="Role">${ROLES.map((r) => `<option${r === p.role ? " selected" : ""}>${r}</option>`).join("")}</select>
      <span class="muted player-count">${p.champs.length} champ${p.champs.length === 1 ? "" : "s"}</span>
      <span class="head-actions"><button class="btn small" data-act="edit">Edit pool</button></span>
    </div>
    <div class="player-pool"></div>`;
  if (sub) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn small danger";
    del.title = "Delete this substitute slot";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      if (p.champs.length && !confirm(`Delete ${playerLabel(p)}? Their pool and tier list entries will be removed.`)) return;
      state.subs = state.subs.filter((x) => x !== p);
      purgePlayerEntries();
      save(); render();
    });
    card.querySelector(".head-actions").appendChild(del);
  }

  const name = card.querySelector(".player-name");
  name.value = p.name;
  name.addEventListener("input", () => {
    p.name = name.value;
    save();
    // Update everything that shows the name without re-rendering this card (which would steal focus).
    document.querySelectorAll(`#tierlist .champ[data-key$="|${p.id}"]`).forEach((el) => {
      el.title = `${champions[el.dataset.id].name} — ${playerLabel(p)} (${sub ? "Sub " : ""}${p.role})`;
    });
    renderPoolDisplay();
    renderHiddenNote();
  });
  card.querySelector(".player-role").addEventListener("change", (e) => { p.role = e.target.value; save(); render(); });
  card.querySelector("[data-act=edit]").addEventListener("click", () => openPicker(p.id));

  const pool = card.querySelector(".player-pool");
  if (!p.champs.length) {
    pool.innerHTML = `<button class="empty-pool">+ Add champions</button>`;
    pool.querySelector("button").addEventListener("click", () => openPicker(p.id));
  }
  p.champs.forEach((id) => {
    const el = champEl(id);
    el.classList.add("static");
    addTierBadge(el, tiers[entryKey(id, p.id)]);
    el.appendChild(removeButton(`Remove ${champions[id].name} from pool`, () => {
      p.champs = p.champs.filter((c) => c !== id);
      purgePlayerEntries();
      save(); render();
    }));
    pool.appendChild(el);
  });
  return card;
}

$("#add-sub").addEventListener("click", () => {
  const p = { id: uid(), name: "", role: ROLES[0], champs: [], hidden: false };
  state.subs.push(p);
  save(); render();
  const input = document.querySelector(`#view-pools .player-card[data-id="${p.id}"] .player-name`);
  input?.scrollIntoView({ block: "center", behavior: "smooth" });
  input?.focus({ preventScroll: true });
});

// ---------- Bot lane pairings ----------
function pairsDisplayCard(tiers) {
  const card = document.createElement("div");
  card.className = "player-card pairs-card display-card" + (state.pairsHidden ? " is-hidden" : "");
  card.innerHTML = `
    <div class="player-head">
      <span class="pairs-title">Pairs</span>
      <span class="muted player-count">${state.pairs.length} pair${state.pairs.length === 1 ? "" : "s"}</span>
      <span class="head-actions"><button class="btn small" data-goto="pools" data-id="pairs">Edit</button></span>
    </div>
    <div class="player-pool"></div>`;
  card.querySelector(".head-actions").prepend(visibilityButton(state.pairsHidden, () => {
    state.pairsHidden = !state.pairsHidden; save(); render();
  }));
  const pool = card.querySelector(".player-pool");
  if (!state.pairs.length) {
    pool.innerHTML = `<button class="empty-pool" data-goto="pools" data-id="pairs">No pairs yet — create them in the Player Pools tab</button>`;
  }
  state.pairs.forEach((pair) => {
    const key = `pair:${pair.id}`;
    const el = pairEl(key);
    el.classList.add("pp");
    addTierBadge(el, tiers[key]);
    pool.appendChild(el);
  });
  return card;
}

function pairsEditorCard(tiers) {
  const card = document.createElement("div");
  card.className = "player-card pairs-card editor-card";
  card.dataset.id = "pairs";
  card.innerHTML = `
    <div class="player-head">
      <span class="pairs-title">Pairs</span>
      <span class="muted player-count">${state.pairs.length} pair${state.pairs.length === 1 ? "" : "s"}</span>
      <span class="head-actions"><button class="btn small" data-act="new-pair">+ New pair</button></span>
    </div>
    <div class="player-pool"></div>`;
  card.querySelector("[data-act=new-pair]").addEventListener("click", openPairDialog);
  const pool = card.querySelector(".player-pool");
  if (!state.pairs.length) {
    pool.innerHTML = `<button class="empty-pool">+ Create a bot lane pair</button>`;
    pool.querySelector("button").addEventListener("click", openPairDialog);
  }
  state.pairs.forEach((pair) => {
    const key = `pair:${pair.id}`;
    const el = pairEl(key);
    el.classList.add("static");
    addTierBadge(el, tiers[key]);
    el.appendChild(removeButton("Delete this pair", () => {
      state.pairs = state.pairs.filter((p) => p.id !== pair.id);
      state.rows.forEach((r) => (r.items = r.items.filter((k) => k !== key)));
      save(); render();
    }));
    pool.appendChild(el);
  });
  return card;
}

let pairDraft = { a: null, b: null };
let pairFilter = "all";

function openPairDialog() {
  pairDraft = { a: null, b: null };
  pairFilter = "all";
  $("#pair-search").value = "";
  renderPairDialog();
  $("#pair-dialog").showModal();
  $("#pair-search").focus();
}

function renderPairDialog() {
  // The two slots
  ["a", "b"].forEach((slot) => {
    const el = $(`#pair-slot-${slot}`);
    const c = champions[pairDraft[slot]];
    el.classList.toggle("filled", !!c);
    el.classList.toggle("next", !c && slot === (pairDraft.a ? "b" : "a"));
    el.querySelector(".slot-img").innerHTML = c ? `<img src="${c.img}" alt="">` : "?";
    el.querySelector(".slot-name").textContent = c ? c.name : slot === "a" ? "ADC" : "Support";
  });
  $("#pair-add").disabled = !(pairDraft.a && pairDraft.b);

  // Filter chips: all champions, or the Bot / Support players' pools
  document.querySelectorAll("#pair-filters .chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === pairFilter));
  let ids = Object.keys(champions);
  if (pairFilter !== "all") {
    const pool = new Set(allPlayers().filter((p) => p.role === pairFilter).flatMap((p) => p.champs));
    ids = ids.filter((id) => pool.has(id));
  }
  const q = $("#pair-search").value.trim().toLowerCase();
  if (q) ids = searchChampions(ids, q);
  const grid = $("#pair-grid");
  grid.innerHTML = ids.length ? "" : `<p class="muted">No champions here yet${pairFilter !== "all" ? ` — add some to your ${pairFilter} player's pool` : ""}.</p>`;
  ids.forEach((id) => {
    const c = champions[id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick" + (id === pairDraft.a || id === pairDraft.b ? " selected" : "");
    b.dataset.id = id;
    b.title = c.name;
    b.innerHTML = `<img src="${c.img}" alt="" loading="lazy"><span>${c.name}</span>`;
    grid.appendChild(b);
  });
  highlightFirstMatch($("#pair-search"), grid);
}

$("#pair-grid").addEventListener("click", (e) => {
  const b = e.target.closest(".pick");
  if (!b) return;
  const id = b.dataset.id;
  if (!pairDraft.a) pairDraft.a = id;
  else if (!pairDraft.b) pairDraft.b = id;
  else pairDraft.b = id; // both filled: replace the second champion
  $("#pair-search").value = ""; // ready to search for the next champion
  if (pairDraft.a && !pairDraft.b && pairFilter === "Bot") pairFilter = "Support";
  renderPairDialog();
});
["a", "b"].forEach((slot) =>
  $(`#pair-slot-${slot}`).addEventListener("click", () => { pairDraft[slot] = null; renderPairDialog(); })
);
$("#pair-search").addEventListener("input", renderPairDialog);
keyboardPicker($("#pair-search"), $("#pair-grid"), renderPairDialog);
$("#pair-filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) { pairFilter = chip.dataset.filter; renderPairDialog(); }
});
$("#pair-add").addEventListener("click", (e) => {
  e.preventDefault();
  if (!pairDraft.a || !pairDraft.b) return;
  state.pairs.push({ id: uid(), a: pairDraft.a, b: pairDraft.b });
  save(); render();
  toast(`Added ${champions[pairDraft.a].name} & ${champions[pairDraft.b].name}`);
  pairDraft = { a: null, b: null }; // stay open to build the next pair
  renderPairDialog();
});

// Role filter in the pool picker; opens on the player's own role.
let pickerRole = "all";

function openPicker(playerId) {
  editingPlayerId = playerId;
  const p = playerById(playerId);
  $("#picker-title").textContent = `${playerLabel(p)}'s champion pool`;
  $("#picker-search").value = "";
  pickerRole = p.role || "all";
  renderPicker();
  $("#picker-dialog").showModal();
  $("#picker-search").focus();
}

// Each role tab shows how many of its champions are already in this pool.
function renderPickerRoles(p) {
  document.querySelectorAll("#picker-roles .seg").forEach((b) => {
    const r = b.dataset.role;
    const n = r === "all" ? p.champs.length : p.champs.filter((id) => championRoles(id).includes(r)).length;
    b.setAttribute("aria-selected", String(r === pickerRole));
    b.innerHTML = `${r === "all" ? "All Roles" : r}${n ? `<span class="seg-count">${n}</span>` : ""}`;
  });
}

function renderPicker() {
  const p = playerById(editingPlayerId);
  if (!p) return;
  const q = $("#picker-search").value.trim().toLowerCase();
  const grid = $("#picker-grid");
  const selected = new Set(p.champs);
  grid.innerHTML = "";
  const inRole = (id) => pickerRole === "all" || championRoles(id).includes(pickerRole);
  const all = Object.keys(champions);
  renderPickerRoles(p);
  const ids = (q ? searchChampions(all, q) : all).filter(inRole);
  if (!ids.length) {
    // Searching for someone outside the selected role: offer to look in all roles.
    const elsewhere = q && pickerRole !== "all" ? searchChampions(all, q).length : 0;
    grid.innerHTML = `<p class="muted picker-empty">No ${pickerRole === "all" ? "" : pickerRole + " "}champions match.${elsewhere ? ` <button type="button" class="link-btn" id="picker-all">Search all roles (${elsewhere})</button>` : ""}</p>`;
    $("#picker-all")?.addEventListener("click", () => { pickerRole = "all"; renderPicker(); $("#picker-search").focus(); });
  }
  ids.map((id) => champions[id]).forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick" + (selected.has(c.id) ? " selected" : "");
    b.dataset.id = c.id;
    b.title = c.name;
    b.innerHTML = `<img src="${c.img}" alt="" loading="lazy"><span>${c.name}</span>`;
    grid.appendChild(b);
  });
  $("#picker-count").textContent = `${p.champs.length} selected`;
  highlightFirstMatch($("#picker-search"), grid);
}

$("#picker-grid").addEventListener("click", (e) => {
  const b = e.target.closest(".pick");
  const p = playerById(editingPlayerId);
  if (!b || !p) return;
  const id = b.dataset.id;
  if (p.champs.includes(id)) p.champs = p.champs.filter((c) => c !== id);
  else p.champs.push(id);
  b.classList.toggle("selected");
  $("#picker-count").textContent = `${p.champs.length} selected`;
  save();
  renderPickerRoles(p);
});
$("#picker-search").addEventListener("input", renderPicker);
$("#picker-roles").addEventListener("click", (e) => {
  const b = e.target.closest(".seg");
  if (!b) return;
  pickerRole = b.dataset.role;
  renderPicker();
  $("#picker-search").focus();
});
keyboardPicker($("#picker-search"), $("#picker-grid"), renderPicker);

// ---------- Keyboard selection in champion pickers ----------
// While typing, the first match is highlighted. Arrow keys move the highlight,
// Enter picks it (same as clicking) and clears the search for the next champion.
function searchChampions(ids, q) {
  // Best matches first: name starts with the text ("ka" → Kai'Sa before Akali),
  // then a word in the name starts with it ("sin" → Lee Sin), then anywhere in the name.
  const norm = (t) => t.toLowerCase().replace(/['.]/g, "");
  q = norm(q);
  const rank = (name) => {
    const n = norm(name);
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s&]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return ids
    .map((id) => ({ id, r: rank(champions[id].name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || champions[a.id].name.localeCompare(champions[b.id].name))
    .map((x) => x.id);
}

function highlightFirstMatch(input, grid) {
  setActivePick(grid, input.value.trim() ? 0 : -1);
}

function setActivePick(grid, i) {
  const picks = grid.querySelectorAll(".pick");
  picks.forEach((p) => p.classList.remove("active"));
  grid.dataset.active = i;
  if (i >= 0 && picks[i]) {
    picks[i].classList.add("active");
    picks[i].scrollIntoView({ block: "nearest" });
  }
}

function gridColumns(grid) {
  const picks = grid.querySelectorAll(".pick");
  if (!picks.length) return 1;
  const top = picks[0].offsetTop;
  let n = 0;
  while (n < picks.length && picks[n].offsetTop === top) n++;
  return n;
}

function keyboardPicker(input, grid, rerender) {
  input.addEventListener("keydown", (e) => {
    const picks = grid.querySelectorAll(".pick");
    let i = Number(grid.dataset.active);
    if (Number.isNaN(i)) i = -1;
    const cols = gridColumns(grid);
    const moves = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 };

    if (e.key in moves) {
      // Left/Right only take over once something is highlighted, so they still move the text cursor otherwise.
      if (!picks.length || (i < 0 && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) return;
      e.preventDefault();
      setActivePick(grid, i < 0 ? 0 : Math.min(picks.length - 1, Math.max(0, i + moves[e.key])));
    } else if (e.key === "Enter") {
      e.preventDefault(); // don't submit (close) the dialog
      if (i < 0 || !picks[i]) return;
      picks[i].click();
      input.value = "";
      rerender();
      input.focus();
    }
  });
}
$("#picker-dialog").addEventListener("close", () => { editingPlayerId = null; purgePlayerEntries(); save(); render(); });

function purgePlayerEntries() {
  // A champion removed from a player's pool also leaves the tier list for that player.
  state.rows.forEach((r) => {
    r.items = r.items.filter((key) => {
      if (isPairKey(key)) return true;
      const { id, pid } = parseKey(key);
      return !pid || (playerById(pid) && playerById(pid).champs.includes(id));
    });
  });
}

// ---------- Double-click "send to tier" menu ----------
// Double-click a champion in a player pool, a bot lane pair, a champion in the
// All Champions pool, or a tile already ranked to place it in a tier without dragging.
let menuKey = null;

function keyForTile(el) {
  if (el.closest("#pool, #tierlist")) return el.dataset.key;
  if (!el.classList.contains("pp")) return null;
  return el.dataset.pair ? `pair:${el.dataset.pair}` : entryKey(el.dataset.id, el.dataset.owner);
}

function tileLabel(key) {
  if (isPairKey(key)) {
    const p = pairById(key.slice(5));
    return `${champions[p.a].name} & ${champions[p.b].name}`;
  }
  const { id, pid } = parseKey(key);
  const pl = pid && playerById(pid);
  return pl ? `${champions[id].name} (${roleTagText(pl)})` : champions[id].name;
}

let menuScrollY = 0;
function openTierMenu(key, x, y) {
  menuKey = key;
  menuScrollY = window.scrollY;
  const current = state.rows.find((r) => r.items.includes(key));
  const menu = $("#tier-menu");
  menu.innerHTML = `<div class="menu-title"></div>`;
  menu.querySelector(".menu-title").textContent = tileLabel(key);
  state.rows.forEach((row) => {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "menuitem";
    b.dataset.row = row.id;
    b.innerHTML = `<span class="menu-swatch"></span><span class="menu-label"></span><span class="menu-check">${row === current ? "✓" : ""}</span>`;
    b.querySelector(".menu-swatch").style.background = row.color;
    b.querySelector(".menu-label").textContent = row.label.trim() || "(unnamed tier)";
    if (row === current) b.classList.add("current");
    menu.appendChild(b);
  });
  if (current) {
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "menu-remove";
    rm.dataset.row = "";
    rm.textContent = "Remove from tier list";
    menu.appendChild(rm);
  }
  menu.hidden = false;
  // Keep the menu on screen
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  menu.querySelector("button")?.focus();
}

function closeTierMenu() {
  $("#tier-menu").hidden = true;
  menuKey = null;
}

function sendToTier(key, rowId) {
  state.rows.forEach((r) => (r.items = r.items.filter((k) => k !== key)));
  const row = state.rows.find((r) => r.id === rowId);
  if (row) row.items.push(key);
  save();
  render();
  toast(row ? `${tileLabel(key)} → ${row.label.trim() || "tier"}` : `Removed ${tileLabel(key)}`);
}

document.addEventListener("dblclick", (e) => {
  if (e.target.closest(".remove") || e.target.closest(".is-hidden")) return;
  const tile = e.target.closest(".champ");
  const key = tile && keyForTile(tile);
  if (!key) return;
  e.preventDefault();
  window.getSelection()?.removeAllRanges();
  openTierMenu(key, e.clientX, e.clientY);
});

$("#tier-menu").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || menuKey === null) return;
  const key = menuKey;
  closeTierMenu();
  sendToTier(key, b.dataset.row);
});

$("#tier-menu").addEventListener("keydown", (e) => {
  const items = [...$("#tier-menu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  }
});

document.addEventListener("pointerdown", (e) => {
  if (!$("#tier-menu").hidden && !e.target.closest("#tier-menu")) closeTierMenu();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#tier-menu").hidden) closeTierMenu(); });
// Close on a real scroll, not a few pixels of trackpad drift.
window.addEventListener("scroll", () => {
  if (!$("#tier-menu").hidden && Math.abs(window.scrollY - menuScrollY) > 40) closeTierMenu();
}, { passive: true });
window.addEventListener("resize", closeTierMenu);

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", x === t);
    });
    $("#panel-all").hidden = t.dataset.tab !== "all";
    $("#panel-players").hidden = t.dataset.tab !== "players";
  })
);

// ---------- Drag and drop (pointer events: mouse, pen and touch) ----------
let drag = null; // { el, ghost, offsetX, offsetY, startX, startY, active }

document.addEventListener("pointerdown", (e) => {
  const source = e.target.closest(".champ");
  if (!source || e.button > 0 || e.target.closest(".remove")) return;
  if (source.classList.contains("static")) return; // pool editor tiles aren't draggable
  if (source.closest(".is-hidden")) {
    e.preventDefault();
    toast("This pool is hidden from the tier list — click Hidden to show it first");
    return;
  }
  // A tile in a player's pool stays put: dragging it places (or moves, if already ranked)
  // that player's own entry for the champion, tagged with their role.
  let el = source;
  if (source.classList.contains("pp")) {
    const key = source.dataset.pair ? `pair:${source.dataset.pair}` : entryKey(source.dataset.id, source.dataset.owner);
    el = document.querySelector(`#tierlist .champ[data-key="${key}"]`) || itemEl(key);
  }
  const rect = source.getBoundingClientRect();
  drag = {
    el, source, ghost: null, active: false,
    startX: e.clientX, startY: e.clientY,
    offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
  };
  e.preventDefault();
});

document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
    drag.active = true;
    drag.ghost = drag.el.cloneNode(true);
    drag.ghost.classList.add("drag-ghost");
    document.body.appendChild(drag.ghost);
    drag.el.classList.remove("hidden"); // might be filtered out of the pool by the search box
    drag.el.classList.add("drag-placeholder");
    drag.source.classList.add("drag-placeholder");
    document.body.classList.add("dragging");
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.offsetX}px, ${e.clientY - drag.offsetY}px)`;
  drag.x = e.clientX;
  drag.y = e.clientY;
  updateDropTarget(e.clientX, e.clientY);
  startAutoScroll();
});

// Scroll the page while dragging near the top/bottom edge, so a player's pool
// can be dragged up to the tier list (and back) on any screen size.
function startAutoScroll() {
  if (drag.scrolling) return;
  drag.scrolling = true;
  const step = () => {
    if (!drag || !drag.active) return;
    const edge = 70, h = window.innerHeight;
    let dy = 0;
    if (drag.y < edge) dy = -Math.ceil((edge - drag.y) / 4);
    else if (drag.y > h - edge) dy = Math.ceil((drag.y - (h - edge)) / 4);
    if (dy) {
      const before = window.scrollY;
      window.scrollBy(0, dy);
      if (window.scrollY !== before) updateDropTarget(drag.x, drag.y);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateDropTarget(x, y) {
  const under = document.elementFromPoint(x, y);
  const zone = under && under.closest(".tier-items, #pool, .tier-row, #panel-players");
  document.querySelectorAll(".drop-target").forEach((z) => z.classList.remove("drop-target"));
  if (!zone) return;
  // Dropping a player's entry back on the player pools (or the All Champions pool) unranks it.
  if (zone.id === "panel-players" || (zone.id === "pool" && isOwnedKey(drag.el.dataset.key))) {
    zone.classList.add("drop-target");
    if (zone.id === "panel-players" && !isOwnedKey(drag.el.dataset.key)) $("#pool").appendChild(drag.el);
    else drag.el.remove();
    return;
  }
  // Dropping on a row's label or settings column puts the champion at the end of that row.
  const container = zone.classList.contains("tier-row") ? zone.querySelector(".tier-items") : zone;
  container.classList.add("drop-target");
  const before = container === zone ? insertionPoint(container, x, y) : null;
  if (before !== drag.el && before !== drag.el.nextSibling) container.insertBefore(drag.el, before);
  else if (drag.el.parentElement !== container) container.insertBefore(drag.el, before);
}

function insertionPoint(container, x, y) {
  // Returns the visible tile the dragged one should go in front of (null = end), reading order L→R, top→bottom.
  const tiles = [...container.querySelectorAll(".champ:not(.drag-placeholder):not(.hidden)")];
  for (const t of tiles) {
    const r = t.getBoundingClientRect();
    if (y < r.top) return t;
    if (y <= r.bottom && x < r.left + r.width / 2) return t;
  }
  return null;
}

function endDrag() {
  if (!drag) return;
  if (drag.active) {
    drag.ghost.remove();
    drag.el.classList.remove("drag-placeholder");
    drag.source.classList.remove("drag-placeholder");
    document.body.classList.remove("dragging");
    document.querySelectorAll(".drop-target").forEach((z) => z.classList.remove("drop-target"));
    syncFromDom();
    render(); // rebuilds the pool and the tier badges
  }
  drag = null;
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

function syncFromDom() {
  document.querySelectorAll(".tier-row").forEach((rEl) => {
    const row = state.rows.find((r) => r.id === rEl.dataset.id);
    // Hidden entries aren't in the DOM. Each one stays right after the tile it
    // followed before (or at the start of the row), so it reappears in the same spot.
    const visible = [...rEl.querySelectorAll(".champ")].map((c) => c.dataset.key);
    const after = new Map(); // anchor key (null = row start) -> hidden keys
    let anchor = null;
    row.items.forEach((key) => {
      if (isHiddenKey(key)) {
        if (!after.has(anchor)) after.set(anchor, []);
        after.get(anchor).push(key);
      } else anchor = key;
    });
    const merged = [...(after.get(null) || [])];
    after.delete(null);
    visible.forEach((key) => {
      merged.push(key, ...(after.get(key) || []));
      after.delete(key);
    });
    after.forEach((keys) => merged.push(...keys)); // their anchor left this row
    row.items = merged;
  });
  save();
  updateCount();
}

function updateCount() {
  const total = Object.keys(champions).length;
  const left = $("#pool").children.length;
  $("#pool-count").textContent = `(${left} of ${total} unranked)`;
}

// Role sub-tabs in "All Champions" (roles come from roles.js). The choice is a viewing
// preference, so it's remembered in this browser rather than saved with the tier list.
const ROLE_PREF_KEY = "lol-tierlist-pool-role";
let poolRole = "all";
try { poolRole = localStorage.getItem(ROLE_PREF_KEY) || "all"; } catch (_) {}

const championRoles = (id) => (window.CHAMPION_ROLES && window.CHAMPION_ROLES[id]) || [];
const inPoolRole = (id) => poolRole === "all" || championRoles(id).includes(poolRole);

function applySearch() {
  const q = $("#search").value.trim().toLowerCase();
  $("#pool").querySelectorAll(".champ").forEach((el) => {
    const name = champions[el.dataset.id].name.toLowerCase();
    el.classList.toggle("hidden", (q && !name.includes(q)) || !inPoolRole(el.dataset.id));
  });
  renderRoleTabs();
}

function renderRoleTabs() {
  const unranked = [...$("#pool").querySelectorAll(".champ")].map((el) => el.dataset.id);
  document.querySelectorAll("#role-tabs .seg").forEach((b) => {
    const role = b.dataset.role;
    const n = role === "all" ? unranked.length : unranked.filter((id) => championRoles(id).includes(role)).length;
    const active = role === poolRole;
    b.setAttribute("aria-selected", String(active));
    b.innerHTML = `${role === "all" ? "All Roles" : role}<span class="seg-count">${n}</span>`;
  });
}

$("#role-tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".seg");
  if (!b) return;
  poolRole = b.dataset.role;
  try { localStorage.setItem(ROLE_PREF_KEY, poolRole); } catch (_) {}
  applySearch();
});

// ---------- Row operations ----------
function moveRow(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.rows.length) return;
  [state.rows[i], state.rows[j]] = [state.rows[j], state.rows[i]];
  save(); render();
}

function addRow(index) {
  state.rows.splice(index, 0, { id: uid(), label: "New", color: COLORS[11], items: [] });
  save(); render();
}

function openRowDialog(rowId) {
  editingRowId = rowId;
  const row = state.rows.find((r) => r.id === rowId);
  const sw = $("#swatches");
  sw.innerHTML = "";
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (c === row.color ? " active" : "");
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => {
      row.color = c;
      sw.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === b));
      save(); render();
    });
    sw.appendChild(b);
  });
  $("#row-label").value = row.label;
  $("#row-dialog").showModal();
}

$("#row-label").addEventListener("input", (e) => {
  const row = state.rows.find((r) => r.id === editingRowId);
  if (row) { row.label = e.target.value; save(); render(); }
});

document.querySelector(".dialog-actions").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const i = state.rows.findIndex((r) => r.id === editingRowId);
  if (i < 0) return;
  if (act === "above") addRow(i);
  if (act === "below") addRow(i + 1);
  if (act === "clear") { state.rows[i].items = []; save(); render(); }
  if (act === "delete") {
    if (state.rows.length === 1) return toast("A tier list needs at least one row");
    state.rows.splice(i, 1); save(); render();
  }
  $("#row-dialog").close();
});

// ---------- Toolbar ----------
$("#title").addEventListener("input", (e) => {
  state.title = e.target.value;
  const t = document.querySelector(".export-title");
  if (t) t.textContent = state.title;
  save();
});
$("#search").addEventListener("input", applySearch);
$("#btn-add-row").addEventListener("click", () => addRow(state.rows.length));

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Reset the tier list? All champions go back to the pool and rows return to S–D. Player pools, substitutes, bot lane pairs and comps are kept.")) return;
  const { players, subs, pairs, pairsHidden, compTiers } = state;
  state = { ...defaultState(), players, subs, pairs, pairsHidden, compTiers };
  save(); render();
});

$("#btn-share").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#list=${encodeURIComponent(encodeState(state))}`;
  try { await navigator.clipboard.writeText(url); toast("Share link copied — send it to your team"); }
  catch (_) { prompt("Copy this link:", url); }
});

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${slug(state.title)}.json`);
});

$("#file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (!validState(s)) throw new Error();
    detachFromCloud();
    state = normalize(s); save(); render(); toast("Tier list imported");
  } catch (_) { toast("That file isn't a valid tier list"); }
  e.target.value = "";
});

$("#btn-download").addEventListener("click", async () => {
  const list = $("#tierlist");
  list.classList.add("exporting");
  try {
    const canvas = await html2canvas(list, { useCORS: true, backgroundColor: "#010F19", scale: 2 });
    canvas.toBlob((b) => downloadBlob(b, `${slug(state.title)}.png`));
  } catch (err) {
    console.error(err);
    toast("Couldn't render the image");
  } finally {
    list.classList.remove("exporting");
  }
});

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (s) => (s || "tier-list").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tier-list";

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Boot ----------
(async function init() {
  try {
    await loadChampions();
  } catch (err) {
    $("#patch").textContent = "Couldn't load champions from Riot Data Dragon — check your connection.";
    console.error(err);
    return;
  }
  state = loadState();
  if (loadedFromShareLink) detachFromCloud();
  save();
  render();
  resolveReady();
})();

// ---------- Hooks for the account / cloud save code (cloud.js) ----------
let resolveReady;
window.TL = {
  ready: new Promise((r) => (resolveReady = r)),
  getState: () => JSON.parse(JSON.stringify(state)),
  replaceState(s) {
    if (!validState(s)) throw new Error("Not a valid tier list");
    state = normalize(s);
    save();
    render();
  },
  newList() {
    // A fresh list keeps the team (players, subs, pairs) but starts with empty S–D rows.
    const { players, subs, pairs, pairsHidden, compTiers } = state;
    state = { ...defaultState(), players, subs, pairs, pairsHidden, compTiers };
    save();
    render();
  },
  onChange: (fn) => changeListeners.push(fn),
  toast: (msg) => toast(msg),
};
