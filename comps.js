// Comps tab: plan team compositions. Named tiers (like a tier list) each hold any number of
// comps; a comp is a vertical column of five slots, each with a role and a champion shown
// over the champion's splash art. Clicking a comp's title zooms into its details: side
// (blue / red / either), the B1 first pick, two adaptation picks per role, and notes.
// Stored in the tier list state (state.compTiers), so comps are saved with the list,
// to the signed-in account and in share links.
(function () {
  const q = (sel, root = document) => root.querySelector(sel);
  const SPLASH = (id) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
  const ROLE_SHORT = { Top: "Top", Jungle: "Jgl", Mid: "Mid", Bot: "Bot", Support: "Sup" };
  const SIDE_LABEL = { blue: "Blue", red: "Red", either: "Either" };

  // Small lane icons in the style of the in-game position icons.
  const ROLE_ICON = {
    Top: '<path d="M2 2h10l-3 3H5v4l-3 3z"/><path opacity=".45" d="M8 8h6v6H8z"/>',
    Jungle: '<path d="M8 1.5c-.6 3.2-3.4 4.2-3.4 7.6A3.4 3.4 0 008 12.5a3.4 3.4 0 003.4-3.4C11.4 5.7 8.6 4.7 8 1.5z"/><path d="M3 4c1.5 1.4 1.8 3.5 1.4 6.2C3.1 8.6 2.6 6.4 3 4zM13 4c.4 2.4-.1 4.6-1.4 6.2-.4-2.7-.1-4.8 1.4-6.2z" opacity=".55"/><path d="M7.3 12.5h1.4L8 15z"/>',
    Mid: '<path d="M2 12.2L12.2 2H14v1.8L3.8 14H2z"/><path opacity=".45" d="M2 2h5L2 7zM14 14H9l5-5z"/>',
    Bot: '<path d="M14 14H4l3-3h4V7l3-3z"/><path opacity=".45" d="M2 2h6v6H2z"/>',
    Support: '<path d="M6 2.5h4L9 4.5H7z"/><path d="M1.5 5.5h4.3L8 7.7l2.2-2.2h4.3L11 9H9.2L8 14.5 6.8 9H5z"/>',
  };
  const icon = (role) => `<svg class="role-ico" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">${ROLE_ICON[role] || ""}</svg>`;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Re-render on outside changes (opening a saved list, import, share link), not on our own saves.
  let ownSave = false;
  const commit = (rerender = true) => {
    ownSave = true;
    save();
    ownSave = false;
    if (rerender) { renderComps(); renderDetail(); }
  };
  const tiers = () => state.compTiers;
  const findComp = (compId) => {
    for (const t of tiers()) {
      const i = t.comps.findIndex((c) => c.id === compId);
      if (i >= 0) return { tier: t, comp: t.comps[i], index: i };
    }
    return null;
  };
  const showsB1 = (c) => c.side !== "red";

  // ---------- Rendering ----------
  function renderComps() {
    const box = q("#comp-tiers");
    if (!box || !state) return;
    box.innerHTML = "";
    tiers().forEach((t, ti) => box.appendChild(tierEl(t, ti)));
    if (!tiers().length) box.innerHTML = `<p class="muted">No tiers yet. Add one below.</p>`;
  }
  window.renderComps = renderComps;

  function tierEl(t, ti) {
    const el = document.createElement("section");
    el.className = "comp-tier";
    el.dataset.id = t.id;
    el.innerHTML = `
      <div class="comp-tier-label" style="background:${t.color}">
        <textarea class="comp-tier-name" rows="2" maxlength="40" placeholder="Tier name" aria-label="Tier name"></textarea>
        <div class="comp-tier-tools">
          <button type="button" data-act="color" title="Change colour">●</button>
          <button type="button" data-act="up" title="Move tier up" ${ti === 0 ? "disabled" : ""}>▲</button>
          <button type="button" data-act="down" title="Move tier down" ${ti === tiers().length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" data-act="delete" title="Delete tier">✕</button>
        </div>
      </div>
      <div class="comp-row"></div>`;
    const name = q(".comp-tier-name", el);
    name.value = t.name;
    name.addEventListener("input", () => { t.name = name.value; commit(false); });
    q(".comp-tier-tools", el).addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;
      const list = tiers();
      const i = list.indexOf(t);
      if (act === "color") t.color = COLORS[(COLORS.indexOf(t.color) + 1) % COLORS.length];
      if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      if (act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      if (act === "delete") {
        if (t.comps.length && !confirm(`Delete the tier “${t.name || "Untitled"}” and its ${t.comps.length} comp${t.comps.length === 1 ? "" : "s"}?`)) return;
        list.splice(i, 1);
      }
      commit();
    });
    const row = q(".comp-row", el);
    t.comps.forEach((c) => row.appendChild(compEl(c)));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "comp-add";
    add.innerHTML = `<span>+</span>Add comp`;
    add.addEventListener("click", () => {
      const c = newComp();
      t.comps.push(c);
      commit();
      openDetail(c.id);
      q("#cd-name").focus();
    });
    row.appendChild(add);
    return el;
  }

  function compEl(c) {
    const el = document.createElement("div");
    el.className = "comp";
    el.dataset.id = c.id;
    el.innerHTML = `
      <div class="comp-head">
        <button type="button" class="comp-title" title="Open comp details">
          <span class="comp-title-text${c.name.trim() ? "" : " placeholder"}"></span>
          <svg class="comp-zoom" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
        <span class="side-chip ${c.side}" title="${SIDE_LABEL[c.side]} side">${SIDE_LABEL[c.side]}</span>
        ${c.notes.trim() ? `<span class="note-ico" title="Has notes">✎</span>` : ""}
        <button type="button" class="comp-more" title="Move, duplicate or delete" aria-haspopup="menu">⋯</button>
      </div>
      <div class="comp-slots"></div>`;
    q(".comp-title-text", el).textContent = c.name.trim() || "Untitled comp";
    q(".comp-title", el).addEventListener("click", () => openDetail(c.id, el));
    q(".comp-more", el).addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openCompMenu(c.id, r.right, r.bottom + 4);
    });
    const slots = q(".comp-slots", el);
    c.slots.forEach((slot, i) => {
      const card = slotCard(slot.champ, slot.role, "+ Choose champion");
      if (showsB1(c) && c.b1 === i && slot.champ) card.appendChild(markEl("b1-mark", "B1"));
      const n = slot.alts.filter(Boolean).length;
      if (n) card.appendChild(markEl("alt-mark", `+${n}`, `${n} adaptation${n === 1 ? "" : "s"}: ${slot.alts.filter(Boolean).map((id) => champions[id].name).join(", ")}`));
      card.addEventListener("click", () => openChooser(c.id, i, null));
      slots.appendChild(card);
    });
    return el;
  }

  function markEl(cls, text, title) {
    const m = document.createElement("span");
    m.className = cls;
    m.textContent = text;
    if (title) m.title = title;
    return m;
  }

  // A champion card: splash art, role pill top-left, name bottom-left.
  function slotCard(champId, role, emptyText, pillText) {
    const champ = champId && champions[champId];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "comp-slot" + (champ ? " filled" : "");
    b.title = champ ? `${champ.name} (${role}) — click to change` : `Choose a ${role} champion`;
    b.innerHTML = `
      ${champ ? `<img class="slot-art" src="${SPLASH(champ.id)}" alt="" loading="lazy">` : ""}
      <span class="slot-shade"></span>
      <span class="role-pill">${icon(role)}<span>${esc(pillText || role)}</span></span>
      <span class="slot-champ">${champ ? esc(champ.name) : esc(emptyText)}</span>`;
    // No splash available (e.g. a brand-new champion): use the square portrait instead.
    const art = q(".slot-art", b);
    if (art) art.addEventListener("error", () => { art.src = champ.img; art.classList.add("fallback"); }, { once: true });
    return b;
  }

  // ---------- Comp details (zoomed-in view) ----------
  let detailId = null;

  function openDetail(compId, fromEl) {
    const dlg = q("#comp-detail");
    detailId = compId;
    renderDetail();
    if (!dlg.open) dlg.showModal();
    q("#comp-detail .cd-body").scrollTop = 0;
    // Zoom out of the comp card that was clicked.
    const r = fromEl?.getBoundingClientRect();
    const d = dlg.getBoundingClientRect();
    if (r && dlg.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dlg.style.transformOrigin = `${r.left + r.width / 2 - d.left}px ${r.top + r.height / 2 - d.top}px`;
      dlg.animate([{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }

  function renderDetail() {
    const dlg = q("#comp-detail");
    if (!dlg.open && !detailId) return;
    const f = detailId && findComp(detailId);
    if (!f) { if (dlg.open) dlg.close(); return; }
    const c = f.comp;
    const name = q("#cd-name");
    if (document.activeElement !== name) name.value = c.name;
    q("#cd-tier").innerHTML = `<span class="menu-swatch" style="background:${f.tier.color}"></span>${esc(f.tier.name.trim() || "Untitled tier")}`;
    const notes = q("#cd-notes");
    if (document.activeElement !== notes) notes.value = c.notes;

    document.querySelectorAll("#cd-side button").forEach((b) => {
      const on = b.dataset.side === c.side;
      b.className = `side-btn ${b.dataset.side}${on ? " on" : ""}`;
      b.setAttribute("aria-checked", String(on));
    });

    // B1: which main pick goes first (blue side, or either side when on blue).
    q("#cd-b1-field").hidden = !showsB1(c);
    q("#cd-b1-label").textContent = c.side === "either" ? "First pick if on blue side (B1)" : "First pick (B1)";
    const b1 = q("#cd-b1");
    b1.innerHTML = "";
    c.slots.forEach((slot, i) => {
      const champ = slot.champ && champions[slot.champ];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "b1-opt" + (c.b1 === i && champ ? " on" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(c.b1 === i && !!champ));
      b.disabled = !champ;
      b.title = champ ? `${champ.name} (${slot.role})` : `No ${slot.role} pick yet`;
      b.innerHTML = champ
        ? `<img src="${champ.img}" alt=""><span>${esc(champ.name)}</span>`
        : `<span class="b1-empty">${icon(slot.role)}</span><span>${slot.role}</span>`;
      b.addEventListener("click", () => { c.b1 = c.b1 === i ? null : i; commit(); });
      b1.appendChild(b);
    });

    // Lineup: each role's main pick plus two adaptations.
    const rows = q("#cd-rows");
    rows.innerHTML = "";
    c.slots.forEach((slot, i) => {
      const row = document.createElement("div");
      row.className = "cd-row";
      const main = slotCard(slot.champ, slot.role, "+ Choose champion");
      main.classList.add("main");
      if (showsB1(c) && c.b1 === i && slot.champ) main.appendChild(markEl("b1-mark", "B1"));
      main.addEventListener("click", () => openChooser(c.id, i, null));
      row.appendChild(main);
      slot.alts.forEach((alt, k) => {
        const card = slotCard(alt, slot.role, "+ Adaptation", `${ROLE_SHORT[slot.role]} · alt ${k + 1}`);
        card.classList.add("alt");
        card.addEventListener("click", () => openChooser(c.id, i, k));
        row.appendChild(card);
      });
      rows.appendChild(row);
    });
  }

  q("#cd-name").addEventListener("input", (e) => {
    const f = detailId && findComp(detailId);
    if (!f) return;
    f.comp.name = e.target.value;
    commit(false);
    renderComps();
  });
  q("#cd-notes").addEventListener("input", (e) => {
    const f = detailId && findComp(detailId);
    if (!f) return;
    const had = !!f.comp.notes.trim();
    f.comp.notes = e.target.value;
    commit(false);
    if (had !== !!f.comp.notes.trim()) renderComps(); // note icon on the card
  });
  q("#cd-side").addEventListener("click", (e) => {
    const b = e.target.closest("[data-side]");
    const f = detailId && findComp(detailId);
    if (!b || !f) return;
    f.comp.side = b.dataset.side;
    commit();
  });
  q("#cd-close").addEventListener("click", () => q("#comp-detail").close());
  q("#comp-detail").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // backdrop
  q("#comp-detail").addEventListener("close", () => { detailId = null; });

  // ---------- Comp menu (⋯) ----------
  let menuComp = null;
  function openCompMenu(compId, x, y) {
    menuComp = compId;
    const f = findComp(compId);
    if (!f) return;
    const menu = q("#comp-menu");
    const others = tiers().filter((t) => t !== f.tier);
    menu.innerHTML = `
      <div class="menu-title"></div>
      <button type="button" data-act="open"><span class="menu-label">Open details</span></button>
      <button type="button" data-act="left" ${f.index === 0 ? "disabled" : ""}><span class="menu-label">◀ Move left</span></button>
      <button type="button" data-act="right" ${f.index === f.tier.comps.length - 1 ? "disabled" : ""}><span class="menu-label">Move right ▶</span></button>
      ${others.map((t) => `<button type="button" data-act="to" data-tier="${t.id}"><span class="menu-swatch" style="background:${t.color}"></span><span class="menu-label"></span></button>`).join("")}
      <button type="button" data-act="dup"><span class="menu-label">Duplicate</span></button>
      <button type="button" data-act="delete" class="menu-remove">Delete comp</button>`;
    q(".menu-title", menu).textContent = f.comp.name || "Untitled comp";
    menu.querySelectorAll('[data-act="to"] .menu-label').forEach((s, i) => (s.textContent = `Move to ${others[i].name.trim() || "untitled tier"}`));
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x - w, window.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  }
  const closeCompMenu = () => { q("#comp-menu").hidden = true; menuComp = null; };
  q("#comp-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const f = findComp(menuComp);
    closeCompMenu();
    if (!f) return;
    const list = f.tier.comps, i = f.index;
    if (b.dataset.act === "open") return openDetail(f.comp.id, q(`.comp[data-id="${f.comp.id}"]`));
    if (b.dataset.act === "left") [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (b.dataset.act === "right") [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (b.dataset.act === "to") {
      list.splice(i, 1);
      tiers().find((t) => t.id === b.dataset.tier)?.comps.push(f.comp);
    }
    if (b.dataset.act === "dup") {
      const copy = JSON.parse(JSON.stringify(f.comp));
      copy.id = uid();
      copy.name = f.comp.name ? `${f.comp.name} (copy)` : "";
      list.splice(i + 1, 0, copy);
    }
    if (b.dataset.act === "delete") {
      if (f.comp.slots.some((s) => s.champ || s.alts.some(Boolean)) && !confirm(`Delete ${f.comp.name ? `“${f.comp.name}”` : "this comp"}?`)) return;
      list.splice(i, 1);
    }
    commit();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!q("#comp-menu").hidden && !e.target.closest("#comp-menu") && !e.target.closest(".comp-more")) closeCompMenu();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !q("#comp-menu").hidden) closeCompMenu(); });
  window.addEventListener("scroll", closeCompMenu, { passive: true });

  // ---------- Slot chooser (role + champion) ----------
  // Editing a main pick: role buttons set the slot's role and filter the grid.
  // Editing an adaptation: role buttons only filter (the row's role stays).
  let editing = null;     // { compId, slot, alt: null | 0 | 1 }
  let filterRole = "all";

  function openChooser(compId, i, alt) {
    const f = findComp(compId);
    if (!f) return;
    editing = { compId, slot: i, alt };
    filterRole = f.comp.slots[i].role;
    q("#comp-search").value = "";
    renderChooser();
    q("#comp-dialog").showModal();
    q("#comp-search").focus();
  }
  const current = (slot) => (editing.alt === null ? slot.champ : slot.alts[editing.alt]);
  const setCurrent = (slot, v) => { if (editing.alt === null) slot.champ = v; else slot.alts[editing.alt] = v; };

  function renderChooser() {
    const f = editing && findComp(editing.compId);
    if (!f) return;
    const slot = f.comp.slots[editing.slot];
    const isAlt = editing.alt !== null;
    q("#comp-dialog-title").textContent = isAlt
      ? `${f.comp.name || "Comp"} · ${slot.role} adaptation ${editing.alt + 1}`
      : `${f.comp.name || "Comp"} · slot ${editing.slot + 1}`;
    q("#comp-clear").disabled = !current(slot);

    const roles = q("#comp-roles");
    roles.innerHTML =
      `<button type="button" class="seg" data-role="all" aria-selected="${filterRole === "all"}">All roles</button>` +
      ROLES.map((r) => `<button type="button" class="seg role-seg${slot.role === r ? " is-role" : ""}" data-role="${r}" aria-selected="${filterRole === r}" title="${isAlt ? `Show ${r} champions` : `Set this slot to ${r}`}">${icon(r)}${ROLE_SHORT[r]}</button>`).join("");

    // Already used: other main picks (for a main pick), or the rest of this role's row (for an adaptation).
    const used = new Map();
    if (isAlt) {
      if (slot.champ) used.set(slot.champ, "main pick");
      slot.alts.forEach((id, k) => { if (id && k !== editing.alt) used.set(id, `adaptation ${k + 1}`); });
    } else {
      f.comp.slots.forEach((s, i) => { if (s.champ && i !== editing.slot) used.set(s.champ, s.role); });
    }
    const text = q("#comp-search").value.trim();
    const all = Object.keys(champions).sort((a, b) => champions[a].name.localeCompare(champions[b].name));
    let ids = filterRole === "all" ? all : all.filter((id) => championRoles(id).includes(filterRole));
    if (text) ids = searchChampions(ids, text);
    const grid = q("#comp-grid");
    grid.innerHTML = "";
    if (!ids.length) {
      const elsewhere = text && filterRole !== "all" ? searchChampions(all, text).length : 0;
      grid.innerHTML = `<p class="muted picker-empty">No ${filterRole === "all" ? "" : filterRole + " "}champions match.${elsewhere ? ` <button type="button" class="link-btn" id="comp-all">Search all roles (${elsewhere})</button>` : ""}</p>`;
      q("#comp-all")?.addEventListener("click", () => { filterRole = "all"; renderChooser(); q("#comp-search").focus(); });
    }
    ids.forEach((id) => {
      const c = champions[id];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick" + (id === current(slot) ? " selected" : "") + (used.has(id) ? " taken" : "");
      b.dataset.id = id;
      b.title = used.has(id) ? `${c.name} — already used (${used.get(id)})` : c.name;
      b.innerHTML = `<img src="${c.img}" alt="" loading="lazy"><span>${c.name}</span>`;
      grid.appendChild(b);
    });
    highlightFirstMatch(q("#comp-search"), grid);
  }

  q("#comp-roles").addEventListener("click", (e) => {
    const b = e.target.closest(".seg");
    const f = editing && findComp(editing.compId);
    if (!b || !f) return;
    filterRole = b.dataset.role;
    if (filterRole !== "all" && editing.alt === null) { f.comp.slots[editing.slot].role = filterRole; commit(); }
    renderChooser();
    q("#comp-search").focus();
  });

  q("#comp-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".pick");
    const f = editing && findComp(editing.compId);
    if (!b || !f) return;
    if (b.classList.contains("taken")) return toast("That champion is already used here");
    setCurrent(f.comp.slots[editing.slot], b.dataset.id);
    commit();
    q("#comp-dialog").close();
  });
  q("#comp-search").addEventListener("input", renderChooser);
  keyboardPicker(q("#comp-search"), q("#comp-grid"), renderChooser);

  q("#comp-clear").addEventListener("click", () => {
    const f = editing && findComp(editing.compId);
    if (!f) return;
    setCurrent(f.comp.slots[editing.slot], null);
    commit();
    q("#comp-dialog").close();
  });
  q("#comp-dialog").addEventListener("close", () => { editing = null; });

  q("#add-comp-tier").addEventListener("click", () => {
    const used = new Set(tiers().map((t) => t.color));
    tiers().push({ id: uid(), name: "", color: COLORS.find((c) => !used.has(c)) || COLORS[11], comps: [] });
    commit();
    const names = document.querySelectorAll(".comp-tier-name");
    names[names.length - 1]?.focus();
  });

  TL.ready.then(() => {
    TL.onChange(() => {
      if (ownSave) return;
      if (!q("#view-comps").hidden) renderComps();
      renderDetail();
    });
    if (!q("#view-comps").hidden) renderComps();
  });
})();
