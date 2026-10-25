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

let champions = {}; // id -> { id, name, img }
let state = null;    // { title, rows: [{ id, label, color, items: [champId] }] }
let editingRowId = null;

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState() {
  return {
    title: "League of Legends – All Champions Tier List",
    rows: DEFAULT_ROWS.map((r) => ({ id: uid(), ...r, items: [] })),
  };
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
  // Drop unknown champions and duplicates; make sure every row has an id.
  const seen = new Set();
  s.rows.forEach((r) => {
    r.id = r.id || uid();
    r.color = r.color || "#cfcfcf";
    r.label = r.label ?? "";
    r.items = r.items.filter((id) => champions[id] && !seen.has(id) && seen.add(id));
  });
  s.title = s.title || defaultState().title;
  return s;
}

// ---------- Rendering ----------
function champEl(id) {
  const c = champions[id];
  const el = document.createElement("div");
  el.className = "champ";
  el.dataset.id = id;
  el.title = c.name;
  el.innerHTML = `<img crossorigin="anonymous" src="${c.img}" alt="${c.name}" loading="lazy"><span class="name">${c.name}</span>`;
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

  // Pool = every champion not placed in a tier.
  const placed = new Set(state.rows.flatMap((r) => r.items));
  const pool = $("#pool");
  pool.innerHTML = "";
  Object.keys(champions).forEach((id) => { if (!placed.has(id)) pool.appendChild(champEl(id)); });

  applySearch();
  updateCount();
}

// ---------- Drag and drop (pointer events: mouse, pen and touch) ----------
let drag = null; // { el, ghost, offsetX, offsetY, startX, startY, active }

document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".champ");
  if (!el || e.button > 0) return;
  const rect = el.getBoundingClientRect();
  drag = {
    el, ghost: null, active: false,
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
    drag.el.classList.add("drag-placeholder");
    document.body.classList.add("dragging");
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.offsetX}px, ${e.clientY - drag.offsetY}px)`;

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const zone = under && under.closest(".tier-items, #pool, .tier-row");
  document.querySelectorAll(".drop-target").forEach((z) => z.classList.remove("drop-target"));
  if (!zone) return;
  // Dropping on a row's label or settings column puts the champion at the end of that row.
  const container = zone.classList.contains("tier-row") ? zone.querySelector(".tier-items") : zone;
  container.classList.add("drop-target");
  const before = container === zone ? insertionPoint(container, e.clientX, e.clientY) : null;
  if (before !== drag.el && before !== drag.el.nextSibling) container.insertBefore(drag.el, before);
  else if (drag.el.parentElement !== container) container.insertBefore(drag.el, before);
});

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
    document.body.classList.remove("dragging");
    document.querySelectorAll(".drop-target").forEach((z) => z.classList.remove("drop-target"));
    syncFromDom();
  }
  drag = null;
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

function syncFromDom() {
  document.querySelectorAll(".tier-row").forEach((rEl) => {
    const row = state.rows.find((r) => r.id === rEl.dataset.id);
    row.items = [...rEl.querySelectorAll(".champ")].map((c) => c.dataset.id);
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
  if (!confirm("Reset the tier list? All champions go back to the pool and rows return to S–D.")) return;
  state = defaultState(); save(); render();
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
