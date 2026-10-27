// Draft simulator: blue/red bans and picks in tournament order, a champion grid with
// search and role filters, and a read-only tier list underneath that greys out every
// champion already picked or banned. Uses champions, roles and tier lists from app.js.
(function () {
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const DRAFT_KEY = "lol-tierlist-draft";
  const VIEW_KEY = "lol-tierlist-view";
  const TL_PICK_KEY = "lol-tierlist-draft-tl";
  const TL_SHOW_KEY = "lol-tierlist-draft-tl-show";
  const SIDES = ["blue", "red"];

  // Standard tournament draft: 3 bans each, 3 picks each, 2 bans each, 2 picks each.
  const SEQUENCE = [
    "blue.bans.0", "red.bans.0", "blue.bans.1", "red.bans.1", "blue.bans.2", "red.bans.2",
    "blue.picks.0", "red.picks.0", "red.picks.1", "blue.picks.1", "blue.picks.2", "red.picks.2",
    "red.bans.3", "blue.bans.3", "red.bans.4", "blue.bans.4",
    "red.picks.3", "blue.picks.3", "blue.picks.4", "red.picks.4",
  ];

  const emptyDraft = () => ({
    blue: { name: "Blue Team", bans: Array(5).fill(null), picks: Array(5).fill(null) },
    red: { name: "Red Team", bans: Array(5).fill(null), picks: Array(5).fill(null) },
  });

  const GAMES = 5;
  // A best-of-5 series: one draft per game. With fearless on, champions picked in an
  // earlier game can't be picked (or banned) again in a later one.
  let series = loadSeries();
  let draft = series.games[series.current];
  let target = null;   // slot ref clicked by the user ("blue.picks.2"), overrides the sequence
  let preview = null;  // champion id waiting to be locked in
  let role = "all";
  const history = [];  // snapshots for Undo
  let savedLists = []; // tier lists from the signed-in account

  function cleanDraft(d) {
    const base = emptyDraft();
    if (!d || !d.blue || !d.red) return base;
    SIDES.forEach((s) => {
      base[s].name = typeof d[s].name === "string" ? d[s].name : base[s].name;
      ["bans", "picks"].forEach((k) => {
        base[s][k] = base[s][k].map((_, i) => (Array.isArray(d[s][k]) && d[s][k][i]) || null);
      });
    });
    return base;
  }
  function emptySeries(names) {
    const games = Array.from({ length: GAMES }, emptyDraft);
    if (names) games.forEach((g) => SIDES.forEach((s) => (g[s].name = names[s])));
    return { games, current: 0, fearless: true };
  }
  function loadSeries() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (d && Array.isArray(d.games)) {
        const out = emptySeries();
        out.games = out.games.map((_, i) => cleanDraft(d.games[i]));
        out.current = Math.min(GAMES - 1, Math.max(0, +d.current || 0));
        out.fearless = d.fearless !== false;
        return out;
      }
      if (d && d.blue && d.red) {
        // Saved before the series existed: it becomes Game 1.
        const out = emptySeries({ blue: d.blue.name || "Blue Team", red: d.red.name || "Red Team" });
        out.games[0] = cleanDraft(d);
        return out;
      }
    } catch (_) {}
    return emptySeries();
  }
  const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(series)); } catch (_) {} };

  const getSlot = (ref) => { const [s, k, i] = ref.split("."); return draft[s][k][+i]; };
  const setSlot = (ref, v) => { const [s, k, i] = ref.split("."); draft[s][k][+i] = v; };
  // Champions that can't be chosen in the current game:
  // champion id -> "ban" | "blue" | "red" (this game) or "G1".."G4" (picked in that earlier game, fearless)
  const takenIds = () => {
    const out = new Map();
    if (series.fearless) {
      series.games.slice(0, series.current).forEach((g, gi) => {
        SIDES.forEach((s) => g[s].picks.forEach((id) => id && out.set(id, `G${gi + 1}`)));
      });
    }
    SIDES.forEach((s) => {
      draft[s].bans.forEach((id) => id && out.set(id, "ban"));
      draft[s].picks.forEach((id) => id && out.set(id, s));
    });
    return out;
  };
  const isFearless = (t) => typeof t === "string" && t[0] === "G";
  const takenText = (t) => (t === "ban" ? "banned" : isFearless(t) ? `picked in Game ${t.slice(1)} (fearless)` : `picked by ${draft[t].name}`);
  const activeRef = () => target || SEQUENCE.find((ref) => !getSlot(ref)) || null;
  const refLabel = (ref) => {
    const [s, k, i] = ref.split(".");
    return `${draft[s].name || (s === "blue" ? "Blue Team" : "Red Team")} ${k === "bans" ? "ban" : "pick"} ${+i + 1}`;
  };

  function snapshot() {
    history.push(JSON.stringify(series));
    if (history.length > 100) history.shift();
  }

  // ---------- Team panels ----------
  function renderTeams() {
    const active = activeRef();
    SIDES.forEach((side) => {
      const bans = q(`.ban-row[data-side="${side}"]`);
      bans.innerHTML = "";
      draft[side].bans.forEach((id, i) => bans.appendChild(slotEl(`${side}.bans.${i}`, id, active, true)));
      const picks = q(`.pick-list[data-side="${side}"]`);
      picks.innerHTML = "";
      draft[side].picks.forEach((id, i) => picks.appendChild(slotEl(`${side}.picks.${i}`, id, active, false)));
      const nameInput = q(`#${side}-name`);
      if (document.activeElement !== nameInput) nameInput.value = draft[side].name;
    });
  }

  function slotEl(ref, id, active, isBan) {
    const i = +ref.split(".")[2];
    const showing = id || (ref === active && preview) || null;
    const c = showing && champions[showing];
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${isBan ? "ban-slot" : "pick-slot"}${ref === active ? " active" : ""}${!id && c ? " previewing" : ""}${id ? " filled" : ""}`;
    el.dataset.ref = ref;
    el.title = id ? `${champions[id].name} — right-click to clear` : `${refLabel(ref)}${ref === active ? " (up next)" : ""}`;
    const art = c ? `<img src="${c.img}" alt="">` : `<span class="slot-num">${i + 1}</span>`;
    if (isBan) {
      el.innerHTML = art;
    } else {
      el.innerHTML = `
        <span class="pick-art">${art}</span>
        <span class="pick-text"><span class="pick-label">Pick ${i + 1}</span><span class="pick-name">${c ? c.name : "Unselected"}</span></span>`;
    }
    if (id) {
      const x = document.createElement("span");
      x.className = "slot-clear";
      x.title = "Clear";
      x.textContent = "×";
      el.appendChild(x);
    }
    return el;
  }

  // Click a slot: target it (fill out of order / replace). Right-click or ×: clear it.
  function onSlotClick(e) {
    const el = e.target.closest("[data-ref]");
    if (!el) return;
    const ref = el.dataset.ref;
    if (e.target.closest(".slot-clear")) return clearSlot(ref);
    target = target === ref ? null : ref;
    render();
  }
  function clearSlot(ref) {
    if (!getSlot(ref)) return;
    snapshot();
    setSlot(ref, null);
    if (target === ref) target = null;
    saveDraft();
    render();
  }
  qa(".ban-row, .pick-list").forEach((box) => {
    box.addEventListener("click", onSlotClick);
    box.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-ref]");
      if (!el) return;
      e.preventDefault();
      clearSlot(el.dataset.ref);
    });
  });

  SIDES.forEach((side) => {
    q(`#${side}-name`).addEventListener("input", (e) => {
      series.games.forEach((g) => (g[side].name = e.target.value)); // names apply to the whole series
      saveDraft();
      renderTurn();
      renderDraftTierList();
    });
  });

  // ---------- Turn indicator ----------
  function renderTurn() {
    const ref = activeRef();
    const box = q("#draft-turn");
    if (!ref) {
      box.innerHTML = `<span class="turn-done">Draft complete</span>`;
      delete q(".draft").dataset.turn;
      return;
    }
    const [side, kind] = ref.split(".");
    q(".draft").dataset.turn = side;
    const step = SEQUENCE.indexOf(ref) + 1;
    box.innerHTML = `
      <span class="turn-chip b${side === "blue" ? " on" : ""}">B</span>
      <span class="turn-chip r${side === "red" ? " on" : ""}">R</span>
      <span class="turn-chip kind ${kind === "bans" ? "ban" : "pick"}">${kind === "bans" ? "Ban" : "Pick"}</span>
      <span class="turn-text"></span>`;
    q(".turn-text", box).textContent = target ? `Editing ${refLabel(ref)}` : `Step ${step} / ${SEQUENCE.length} · ${refLabel(ref)}`;
    q("#draft-lock").disabled = !preview;
  }

  // ---------- Champion grid ----------
  function visibleIds() {
    const text = q("#draft-search").value.trim();
    let ids = Object.keys(champions).sort((a, b) => champions[a].name.localeCompare(champions[b].name));
    if (role !== "all") ids = ids.filter((id) => (window.CHAMPION_ROLES?.[id] || []).includes(role));
    if (text) ids = searchChampions(ids, text);
    return ids;
  }

  function renderGrid() {
    const grid = q("#draft-grid");
    const taken = takenIds();
    const ids = visibleIds();
    q("#draft-count").textContent = ids.length;
    grid.innerHTML = "";
    ids.forEach((id) => {
      const c = champions[id];
      const b = document.createElement("button");
      b.type = "button";
      const t = taken.get(id);
      b.className = "dchamp" + (t ? " taken" : "") + (id === preview ? " selected" : "");
      b.dataset.id = id;
      b.disabled = !!t;
      b.title = t ? `${c.name} — ${takenText(t)}` : c.name;
      b.innerHTML = `<span class="dchamp-art"><img src="${c.img}" alt="" loading="lazy">${isFearless(t) ? `<span class="fearless-mark">${t}</span>` : ""}</span><span class="dchamp-name">${c.name}</span>`;
      grid.appendChild(b);
    });
    if (!ids.length) grid.innerHTML = `<p class="muted draft-empty">No champions match.</p>`;
  }

  q("#draft-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".dchamp");
    if (!b || b.disabled) return;
    if (preview === b.dataset.id) return lockIn(); // second click confirms
    preview = b.dataset.id;
    render();
  });
  q("#draft-grid").addEventListener("dblclick", (e) => {
    const b = e.target.closest(".dchamp");
    if (b && !b.disabled && preview === b.dataset.id) lockIn();
  });

  function lockIn() {
    const ref = activeRef();
    if (!preview || !ref) return;
    if (takenIds().has(preview)) { preview = null; return render(); }
    snapshot();
    setSlot(ref, preview);
    preview = null;
    target = null;
    q("#draft-search").value = "";
    saveDraft();
    render();
  }

  function cancel() {
    if (preview || target || q("#draft-search").value) {
      preview = null;
      target = null;
      q("#draft-search").value = "";
      render();
    }
  }

  // Typing previews the first available match; arrows move the preview; Enter locks in.
  q("#draft-search").addEventListener("input", () => {
    const taken = takenIds();
    const first = q("#draft-search").value.trim() ? visibleIds().find((id) => !taken.has(id)) : null;
    preview = first || null;
    render();
  });
  q("#draft-search").addEventListener("keydown", (e) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: gridCols(), ArrowUp: -gridCols() };
    if (!(e.key in moves) || !preview) return;
    e.preventDefault();
    const taken = takenIds();
    const ids = visibleIds();
    let i = ids.indexOf(preview);
    const step = moves[e.key];
    do { i += step; } while (i >= 0 && i < ids.length && taken.has(ids[i]));
    if (i >= 0 && i < ids.length) { preview = ids[i]; render(); q(".dchamp.selected")?.scrollIntoView({ block: "nearest" }); }
  });
  function gridCols() {
    const tiles = qa(".dchamp");
    if (!tiles.length) return 1;
    const top = tiles[0].offsetTop;
    let n = 0;
    while (n < tiles.length && tiles[n].offsetTop === top) n++;
    return n;
  }

  q("#draft-roles").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    role = b.dataset.role;
    qa("#draft-roles button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    renderGrid();
  });

  q("#draft-lock").addEventListener("click", lockIn);
  q("#draft-undo").addEventListener("click", () => {
    if (!history.length) return toast("Nothing to undo");
    series = JSON.parse(history.pop());
    draft = series.games[series.current];
    preview = null;
    target = null;
    saveDraft();
    render();
  });
  q("#draft-reset").addEventListener("click", () => {
    const any = SIDES.some((s) => [...draft[s].bans, ...draft[s].picks].some(Boolean));
    if (any && !confirm(`Clear all bans and picks in Game ${series.current + 1}?`)) return;
    snapshot();
    const names = { blue: draft.blue.name, red: draft.red.name };
    draft = emptyDraft();
    draft.blue.name = names.blue;
    draft.red.name = names.red;
    series.games[series.current] = draft;
    preview = null;
    target = null;
    saveDraft();
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (q("#view-draft").hidden || document.querySelector("dialog[open]")) return;
    const typing = e.target.matches("input, textarea, select, [contenteditable]");
    if (e.key === "/" && !typing) {
      e.preventDefault();
      q("#draft-search").focus();
    } else if (e.key === "Enter" && (!typing || e.target.id === "draft-search")) {
      e.preventDefault();
      lockIn();
    } else if (e.key === "Escape" && (!typing || e.target.id === "draft-search")) {
      e.preventDefault();
      cancel();
    }
  });

  // ---------- Tier list under the draft ----------
  function tierListChoice() {
    try { return localStorage.getItem(TL_PICK_KEY) || "local"; } catch (_) { return "local"; }
  }

  function renderTierListPicker() {
    const sel = q("#draft-tl-pick");
    const choice = tierListChoice();
    const opts = [`<option value="local">Tier list on this device: ${escapeHtml(TL.getState().title || "Untitled")}</option>`];
    savedLists.forEach((l) => opts.push(`<option value="cloud:${l.id}">Saved: ${escapeHtml(l.title || "Untitled tier list")}</option>`));
    sel.innerHTML = opts.join("");
    sel.value = [...sel.options].some((o) => o.value === choice) ? choice : "local";
  }

  async function refreshSavedLists() {
    if (!window.TLCloud || !TLCloud.signedIn()) { savedLists = []; renderTierListPicker(); renderDraftTierList(); return; }
    try { savedLists = await TLCloud.fetchLists(); } catch (_) { savedLists = []; }
    renderTierListPicker();
    renderDraftTierList();
  }

  function chosenTierList() {
    const choice = q("#draft-tl-pick").value || "local";
    if (choice.startsWith("cloud:")) {
      // The saved list that's open on this device is the live one, so use it as edited.
      if (window.TLCloud && TLCloud.linkedListId() === choice.slice(6)) return TL.getState();
      const l = savedLists.find((x) => x.id === choice.slice(6));
      if (l) { try { return JSON.parse(l.data); } catch (_) {} }
    }
    return TL.getState();
  }

  function renderDraftTierList() {
    const box = q("#draft-tl");
    const show = q("#draft-tl-show").checked;
    q("#draft-tl-pick").disabled = !show;
    box.hidden = !show;
    if (!show) return;
    const s = chosenTierList();
    const taken = takenIds();
    const people = [...(s.players || []), ...(s.subs || [])];
    const subs = new Set((s.subs || []).map((p) => p.id));
    box.innerHTML = "";
    (s.rows || []).forEach((row) => {
      const r = document.createElement("div");
      r.className = "tier-row";
      r.innerHTML = `<div class="tier-label" style="background:${row.color || "#cfcfcf"}"></div><div class="tier-items"></div>`;
      q(".tier-label", r).textContent = row.label || "";
      const items = q(".tier-items", r);
      (row.items || []).forEach((key) => {
        const tile = tileFor(key, s, people, subs, taken);
        if (tile) items.appendChild(tile);
      });
      box.appendChild(r);
    });
  }

  // Builds a read-only tile for a tier list entry, greyed out if any of its champions is taken.
  function tileFor(key, s, people, subs, taken) {
    const el = document.createElement("div");
    el.className = "tl-tile";
    let ids;
    if (String(key).startsWith("pair:")) {
      if (s.pairsHidden) return null;
      const p = (s.pairs || []).find((x) => `pair:${x.id}` === key);
      if (!p || !champions[p.a] || !champions[p.b]) return null;
      ids = [p.a, p.b];
      el.classList.add("pair");
      el.title = `${champions[p.a].name} & ${champions[p.b].name}`;
      el.innerHTML = `<img src="${champions[p.a].img}" alt=""><span class="amp">&amp;</span><img src="${champions[p.b].img}" alt=""><span class="role-tag role-duo">BOT LANE</span>`;
    } else {
      const [id, pid] = String(key).split("|");
      if (!champions[id]) return null;
      ids = [id];
      el.title = champions[id].name;
      el.innerHTML = `<img src="${champions[id].img}" alt="">`;
      if (pid) {
        const pl = people.find((x) => x.id === pid);
        if (!pl || pl.hidden) return null;
        const tag = document.createElement("span");
        tag.className = `role-tag role-${String(pl.role).toLowerCase()}`;
        tag.textContent = (subs.has(pid) ? "SUB " : "") + (ROLE_TAGS[pl.role] || "");
        el.appendChild(tag);
        el.title += ` — ${pl.name || pl.role}`;
      }
    }
    const hit = ids.map((id) => taken.get(id)).find(Boolean);
    if (hit) {
      el.classList.add("taken");
      const mark = document.createElement("span");
      mark.className = `taken-mark ${isFearless(hit) ? "fearless" : hit}`;
      mark.textContent = hit === "ban" ? "BAN" : hit === "blue" ? "B" : hit === "red" ? "R" : hit;
      el.appendChild(mark);
      el.title += ` — ${takenText(hit)}`;
    }
    return el;
  }

  q("#draft-tl-pick").addEventListener("change", (e) => {
    try { localStorage.setItem(TL_PICK_KEY, e.target.value); } catch (_) {}
    renderDraftTierList();
  });
  q("#draft-tl-show").addEventListener("change", (e) => {
    try { localStorage.setItem(TL_SHOW_KEY, e.target.checked ? "1" : "0"); } catch (_) {}
    renderDraftTierList();
  });

  // ---------- Views (Tier List / Draft) ----------
  function showView(view) {
    if (!["tierlist", "draft", "pools"].includes(view)) view = "tierlist";
    const isDraft = view === "draft";
    q("#view-tierlist").hidden = view !== "tierlist";
    q("#view-draft").hidden = !isDraft;
    q("#view-pools").hidden = view !== "pools";
    q("#main").classList.toggle("wide", isDraft);
    qa(".view-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === view)));
    try { localStorage.setItem(VIEW_KEY, view); } catch (_) {}
    if (isDraft) {
      render();
      refreshSavedLists();
    }
  }
  qa(".view-tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  window.TLShowView = showView;

  // ---------- Game tabs (Game 1..5) ----------
  function gameProgress(g) {
    return SEQUENCE.filter((ref) => { const [s, k, i] = ref.split("."); return g[s][k][+i]; }).length;
  }
  function renderGames() {
    const box = q("#game-tabs");
    box.innerHTML = "";
    series.games.forEach((g, i) => {
      const n = gameProgress(g);
      const b = document.createElement("button");
      b.type = "button";
      b.role = "tab";
      b.className = "game-tab";
      b.setAttribute("aria-selected", String(i === series.current));
      b.innerHTML = `Game ${i + 1}<span class="game-state${n === SEQUENCE.length ? " done" : ""}">${n === SEQUENCE.length ? "✓" : n ? `${n}/${SEQUENCE.length}` : "—"}</span>`;
      b.addEventListener("click", () => switchGame(i));
      box.appendChild(b);
    });
    q("#fearless").checked = series.fearless;
  }
  function switchGame(i) {
    if (i === series.current) return;
    series.current = i;
    draft = series.games[i];
    preview = null;
    target = null;
    q("#draft-search").value = "";
    saveDraft();
    render();
  }
  q("#fearless").addEventListener("change", (e) => {
    series.fearless = e.target.checked;
    preview = null;
    saveDraft();
    render();
  });
  q("#series-reset").addEventListener("click", () => {
    const any = series.games.some((g) => gameProgress(g));
    if (any && !confirm("Clear all five games of the series?")) return;
    snapshot();
    const names = { blue: draft.blue.name, red: draft.red.name };
    const fearless = series.fearless;
    series = emptySeries(names);
    series.fearless = fearless;
    draft = series.games[0];
    preview = null;
    target = null;
    saveDraft();
    render();
  });

  function render() {
    renderGames();
    renderTeams();
    renderTurn();
    renderGrid();
    renderDraftTierList();
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  saveDraft(); // stores a draft from before the series (now Game 1) in the new format

  TL.ready.then(() => {
    try { q("#draft-tl-show").checked = localStorage.getItem(TL_SHOW_KEY) !== "0"; } catch (_) {}
    renderTierListPicker();
    let view = "tierlist";
    try { view = localStorage.getItem(VIEW_KEY) || "tierlist"; } catch (_) {}
    showView(view);
    // Keep the draft's tier list in step with edits made in the Tier List view.
    TL.onChange(() => {
      if (q("#view-draft").hidden) return;
      renderTierListPicker();
      renderDraftTierList();
    });
  });
  window.addEventListener("tl:auth", () => { if (!q("#view-draft").hidden) refreshSavedLists(); else savedLists = []; });
})();
