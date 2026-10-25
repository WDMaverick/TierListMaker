// League Tier List Maker — TierMaker-style drag & drop tier lists for League of Legends.
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
const playerById = (pid) => state.players.find((p) => p.id === pid);

let champions = {}; // id -> { id, name, img }
let state = null;    // { title, rows: [{ id, label, color, items }], players: [{ id, name, role, champs }] }
let editingRowId = null;
let editingPlayerId = null;

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState() {
  return {
    title: "League of Legends – All Champions Tier List",
    rows: DEFAULT_ROWS.map((r) => ({ id: uid(), ...r, items: [] })),
    players: defaultPlayers(),
  };
}

function defaultPlayers() {
  return ROLES.map((role) => ({ id: uid(), name: "", role, champs: [] }));
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
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

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
  s.players = players.map((p, i) => ({
    id: p.id || uid(),
    name: typeof p.name === "string" ? p.name : "",
    role: ROLES.includes(p.role) ? p.role : ROLES[i],
    champs: [...new Set(Array.isArray(p.champs) ? p.champs : [])].filter((id) => champions[id]),
  }));

  // Drop unknown champions, entries for champions no longer in that player's pool, and duplicates.
  const seen = new Set();
  s.rows.forEach((r) => {
    r.id = r.id || uid();
    r.color = r.color || "#cfcfcf";
    r.label = r.label ?? "";
    r.items = r.items.filter((key) => {
      const { id, pid } = parseKey(key);
      if (!champions[id] || seen.has(key)) return false;
      if (pid) {
        const pl = s.players.find((x) => x.id === pid);
        if (!pl || !pl.champs.includes(id)) return false;
      }
      seen.add(key);
      return true;
    });
  });
  return s;
}

// ---------- Rendering ----------
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
    const idx = state.players.indexOf(pl);
    const tag = document.createElement("span");
    tag.className = `role-tag role-${pl.role.toLowerCase()}`;
    tag.textContent = ROLE_TAGS[pl.role];
    el.appendChild(tag);
    el.title = `${c.name} — ${pl.name || `Player ${idx + 1}`} (${pl.role})`;
  }
  return el;
}

function render() {
  $("#title").value = state.title;
  const list = $("#tierlist");
  list.innerHTML = `<div class="export-title"></div>`;
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
    row.items.forEach((id) => items.appendChild(champEl(id)));

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
}

// ---------- Player pools ----------
function tierOf() {
  // entry key -> row, for the tier badges on player pool tiles
  const map = {};
  state.rows.forEach((r) => r.items.forEach((id) => (map[id] = r)));
  return map;
}

function renderPlayers() {
  const wrap = $("#players");
  const tiers = tierOf();
  wrap.innerHTML = "";
  state.players.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "player-card";
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="player-head">
        <input class="player-name" maxlength="24" placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name" />
        <select class="player-role" aria-label="Role">${ROLES.map((r) => `<option${r === p.role ? " selected" : ""}>${r}</option>`).join("")}</select>
        <span class="muted player-count">${p.champs.length} champ${p.champs.length === 1 ? "" : "s"}</span>
        <button class="btn small" data-act="edit">Edit pool</button>
      </div>
      <div class="player-pool"></div>`;
    const name = card.querySelector(".player-name");
    name.value = p.name;
    name.addEventListener("input", () => {
      p.name = name.value; save();
      // keep tile tooltips current without re-rendering (which would steal focus)
      document.querySelectorAll(`#tierlist .champ[data-key$="|${p.id}"]`).forEach((el) => {
        el.title = `${champions[el.dataset.id].name} — ${p.name || `Player ${i + 1}`} (${p.role})`;
      });
    });
    card.querySelector(".player-role").addEventListener("change", (e) => { p.role = e.target.value; save(); render(); });
    card.querySelector("[data-act=edit]").addEventListener("click", () => openPicker(p.id));

    const pool = card.querySelector(".player-pool");
    if (!p.champs.length) {
      pool.innerHTML = `<button class="empty-pool" data-act="edit">+ Add champions</button>`;
      pool.querySelector("button").addEventListener("click", () => openPicker(p.id));
    }
    p.champs.forEach((id) => {
      const el = champEl(id);
      el.classList.add("pp");
      el.dataset.owner = p.id;
      const row = tiers[entryKey(id, p.id)];
      if (row) {
        const badge = document.createElement("span");
        badge.className = "tier-badge";
        badge.textContent = row.label.trim().slice(0, 3) || "•";
        badge.style.background = row.color;
        badge.title = `Ranked in ${row.label || "a tier"}`;
        el.appendChild(badge);
      }
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.title = `Remove ${champions[id].name} from pool`;
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        p.champs = p.champs.filter((c) => c !== id);
        purgePlayerEntries();
        save(); render();
      });
      el.appendChild(rm);
      pool.appendChild(el);
    });
    wrap.appendChild(card);
  });
}

function openPicker(playerId) {
  editingPlayerId = playerId;
  const p = state.players.find((x) => x.id === playerId);
  const idx = state.players.indexOf(p);
  $("#picker-title").textContent = `${p.name || `Player ${idx + 1}`}'s champion pool`;
  $("#picker-search").value = "";
  renderPicker();
  $("#picker-dialog").showModal();
  $("#picker-search").focus();
}

function renderPicker() {
  const p = state.players.find((x) => x.id === editingPlayerId);
  if (!p) return;
  const q = $("#picker-search").value.trim().toLowerCase();
  const grid = $("#picker-grid");
  const selected = new Set(p.champs);
  grid.innerHTML = "";
  Object.values(champions).forEach((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick" + (selected.has(c.id) ? " selected" : "");
    b.dataset.id = c.id;
    b.title = c.name;
    b.innerHTML = `<img src="${c.img}" alt="" loading="lazy"><span>${c.name}</span>`;
    grid.appendChild(b);
  });
  $("#picker-count").textContent = `${p.champs.length} selected`;
}

$("#picker-grid").addEventListener("click", (e) => {
  const b = e.target.closest(".pick");
  const p = state.players.find((x) => x.id === editingPlayerId);
  if (!b || !p) return;
  const id = b.dataset.id;
  if (p.champs.includes(id)) p.champs = p.champs.filter((c) => c !== id);
  else p.champs.push(id);
  b.classList.toggle("selected");
  $("#picker-count").textContent = `${p.champs.length} selected`;
  save();
});
$("#picker-search").addEventListener("input", renderPicker);
$("#picker-dialog").addEventListener("close", () => { editingPlayerId = null; purgePlayerEntries(); save(); render(); });

function purgePlayerEntries() {
  // A champion removed from a player's pool also leaves the tier list for that player.
  state.rows.forEach((r) => {
    r.items = r.items.filter((key) => {
      const { id, pid } = parseKey(key);
      return !pid || (playerById(pid) && playerById(pid).champs.includes(id));
    });
  });
}

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
  // A tile in a player's pool stays put: dragging it places (or moves, if already ranked)
  // that player's own entry for the champion, tagged with their role.
  let el = source;
  if (source.classList.contains("pp")) {
    const key = entryKey(source.dataset.id, source.dataset.owner);
    el = document.querySelector(`#tierlist .champ[data-key="${key}"]`) || champEl(key);
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
  if (zone.id === "panel-players" || (zone.id === "pool" && parseKey(drag.el.dataset.key).pid)) {
    zone.classList.add("drop-target");
    if (zone.id === "panel-players" && !parseKey(drag.el.dataset.key).pid) $("#pool").appendChild(drag.el);
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
    row.items = [...rEl.querySelectorAll(".champ")].map((c) => c.dataset.key);
  });
  save();
  updateCount();
}

function updateCount() {
  const total = Object.keys(champions).length;
  const left = $("#pool").children.length;
  $("#pool-count").textContent = `(${left} of ${total} unranked)`;
}

function applySearch() {
  const q = $("#search").value.trim().toLowerCase();
  $("#pool").querySelectorAll(".champ").forEach((el) => {
    const name = champions[el.dataset.id].name.toLowerCase();
    el.classList.toggle("hidden", q && !name.includes(q));
  });
}

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
  if (!confirm("Reset the tier list? All champions go back to the pool and rows return to S–D. Player pools are kept.")) return;
  const players = state.players;
  state = defaultState(); state.players = players; save(); render();
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
    state = normalize(s); save(); render(); toast("Tier list imported");
  } catch (_) { toast("That file isn't a valid tier list"); }
  e.target.value = "";
});

$("#btn-download").addEventListener("click", async () => {
  const list = $("#tierlist");
  list.classList.add("exporting");
  try {
    const canvas = await html2canvas(list, { useCORS: true, backgroundColor: "#1a1a17", scale: 2 });
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
  save();
  render();
})();
