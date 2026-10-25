// Accounts: Google sign-in (Firebase Auth) and tier lists saved to the account (Cloud Firestore),
// so the same lists open on any device. Each user's lists live at users/{uid}/lists/{listId}.
//
// The list on screen can be "linked" to a saved list; while linked, every change autosaves to it.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const LINK_KEY = "tl-cloud-link"; // { uid, listId } for the list on screen

const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let fb = null;   // loaded Firebase modules + instances
let user = null;
let link = readLink();
let saveTimer = null;
let status = "idle"; // idle | saving | saved | error

function readLink() {
  try { return JSON.parse(localStorage.getItem(LINK_KEY)) || null; } catch (_) { return null; }
}
function writeLink(l) {
  link = l;
  try { l ? localStorage.setItem(LINK_KEY, JSON.stringify(l)) : localStorage.removeItem(LINK_KEY); } catch (_) {}
  renderStatus();
}
const linkedHere = () => !!(user && link && link.uid === user.uid);

// ---------- Firebase ----------
async function loadFirebase() {
  if (fb) return fb;
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg) return null;
  const [app, auth, store] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const instance = app.initializeApp(cfg);
  fb = { auth, store, a: auth.getAuth(instance), db: store.getFirestore(instance) };
  return fb;
}

const listsCol = () => fb.store.collection(fb.db, "users", user.uid, "lists");
const listDoc = (id) => fb.store.doc(fb.db, "users", user.uid, "lists", id);

async function fetchLists() {
  const q = fb.store.query(listsCol(), fb.store.orderBy("updatedAt", "desc"));
  const snap = await fb.store.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function payload() {
  const s = TL.getState();
  return { title: s.title || "Untitled tier list", data: JSON.stringify(s), updatedAt: fb.store.serverTimestamp() };
}

async function saveAsNew() {
  const ref = await fb.store.addDoc(listsCol(), { ...payload(), createdAt: fb.store.serverTimestamp() });
  writeLink({ uid: user.uid, listId: ref.id });
  setStatus("saved");
  return ref.id;
}

async function saveNow() {
  if (!linkedHere()) return;
  clearTimeout(saveTimer);
  setStatus("saving");
  try {
    await fb.store.setDoc(listDoc(link.listId), payload(), { merge: true });
    setStatus("saved");
  } catch (err) {
    console.error(err);
    setStatus("error");
  }
}

function scheduleSave() {
  if (!linkedHere()) return;
  setStatus("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1200);
}

// ---------- Header: sign-in button / account menu ----------
const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

function renderAccount() {
  const box = $("#account");
  if (!user) {
    box.innerHTML = `<button type="button" class="btn signin-btn" id="signin">${GOOGLE_G}<span>Sign in</span></button>`;
    $("#signin").addEventListener("click", signIn);
    return;
  }
  const name = user.displayName || user.email || "Account";
  const avatar = user.photoURL
    ? `<img class="avatar" src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar initial">${esc(name[0].toUpperCase())}</span>`;
  box.innerHTML = `
    <button type="button" class="account-btn" id="account-btn" aria-haspopup="menu" aria-expanded="false">
      ${avatar}<span class="account-name">${esc(name.split(" ")[0])}</span><span class="caret">▾</span>
    </button>
    <div class="account-menu" id="account-menu" role="menu" hidden>
      <div class="account-who"><strong>${esc(user.displayName || "")}</strong><span>${esc(user.email || "")}</span></div>
      <button type="button" role="menuitem" data-act="lists">My tier lists</button>
      <button type="button" role="menuitem" data-act="save">${linkedHere() ? "Save now" : "Save this list to my account"}</button>
      <button type="button" role="menuitem" data-act="signout" class="danger-item">Sign out</button>
    </div>`;
  const btn = $("#account-btn"), menu = $("#account-menu");
  btn.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", async (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    menu.hidden = true;
    if (act === "lists") openLists();
    if (act === "save") linkedHere() ? saveNow() : saveCurrentAsNew();
    if (act === "signout") {
      await fb.auth.signOut(fb.a);
      TL.toast("Signed out");
    }
  });
}

document.addEventListener("pointerdown", (e) => {
  const menu = $("#account-menu");
  if (menu && !menu.hidden && !e.target.closest("#account")) menu.hidden = true;
});

async function signIn() {
  if (!window.FIREBASE_CONFIG) {
    $("#setup-dialog").showModal();
    return;
  }
  try {
    await loadFirebase();
    const provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await fb.auth.signInWithPopup(fb.a, provider);
  } catch (err) {
    console.error(err);
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
    if (err.code === "auth/popup-blocked") return TL.toast("Your browser blocked the sign-in popup — allow popups for this site");
    if (err.code === "auth/unauthorized-domain") return TL.toast("This website isn't authorized in Firebase yet (Authentication → Settings → Authorized domains)");
    TL.toast("Sign-in failed — please try again");
  }
}

// ---------- Save status next to the title ----------
function setStatus(s) { status = s; renderStatus(); }

function renderStatus() {
  const el = $("#cloud-status");
  if (!user) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "cloud-status " + (linkedHere() ? status : "unsaved");
  if (!linkedHere()) {
    el.innerHTML = `Not saved to your account · <button type="button" class="link-btn" id="status-save">Save</button>`;
    $("#status-save").addEventListener("click", saveCurrentAsNew);
    return;
  }
  el.textContent = { saving: "Saving…", saved: "✓ Saved to your account", error: "⚠ Couldn't save — check your connection", idle: "✓ Saved to your account" }[status];
}

async function saveCurrentAsNew() {
  try {
    setStatus("saving");
    await saveAsNew();
    TL.toast("Saved to your account — it now autosaves");
    renderAccount();
  } catch (err) {
    console.error(err);
    setStatus("error");
    TL.toast("Couldn't save to your account");
  }
}

// ---------- "My tier lists" dialog ----------
async function openLists() {
  const dlg = $("#lists-dialog");
  if (!dlg.open) dlg.showModal();
  const box = $("#lists-body");
  box.innerHTML = `<p class="muted">Loading your tier lists…</p>`;
  let lists;
  try {
    lists = await fetchLists();
  } catch (err) {
    console.error(err);
    box.innerHTML = `<p class="muted">Couldn't load your tier lists. Check your connection and try again.</p>`;
    return;
  }
  if (!lists.length) {
    box.innerHTML = `<p class="muted">No saved tier lists yet. Use “Save current list” to store the one on screen.</p>`;
    return;
  }
  box.innerHTML = "";
  lists.forEach((l) => {
    const current = linkedHere() && link.listId === l.id;
    const when = l.updatedAt?.toDate ? l.updatedAt.toDate().toLocaleString() : "";
    const row = document.createElement("div");
    row.className = "list-row" + (current ? " current" : "");
    row.innerHTML = `
      <div class="list-info"><strong>${esc(l.title || "Untitled tier list")}</strong><span class="muted">${current ? "Open now · " : ""}${esc(when)}</span></div>
      <button type="button" class="btn small" data-act="open" ${current ? "disabled" : ""}>Open</button>
      <button type="button" class="btn small danger" data-act="delete">Delete</button>`;
    row.querySelector("[data-act=open]").addEventListener("click", () => openList(l));
    row.querySelector("[data-act=delete]").addEventListener("click", () => deleteList(l));
    box.appendChild(row);
  });
}

async function openList(l) {
  // Don't silently lose a list that only exists on this device.
  if (!linkedHere() && !confirm("Replace the tier list on screen with this saved one? The list on screen isn't saved to your account.")) return;
  if (linkedHere()) await saveNow();
  try {
    TL.replaceState(JSON.parse(l.data));
    writeLink({ uid: user.uid, listId: l.id });
    setStatus("saved");
    $("#lists-dialog").close();
    TL.toast(`Opened “${l.title || "Untitled tier list"}”`);
    renderAccount();
  } catch (err) {
    console.error(err);
    TL.toast("That saved list couldn't be opened");
  }
}

async function deleteList(l) {
  if (!confirm(`Delete “${l.title || "Untitled tier list"}” from your account? This can't be undone.`)) return;
  try {
    await fb.store.deleteDoc(listDoc(l.id));
    if (linkedHere() && link.listId === l.id) writeLink(null); // the list stays on screen, just unsaved
    renderAccount();
    openLists();
  } catch (err) {
    console.error(err);
    TL.toast("Couldn't delete that list");
  }
}

$("#lists-save").addEventListener("click", async () => {
  await saveCurrentAsNew();
  openLists();
});
$("#lists-new").addEventListener("click", async () => {
  if (linkedHere()) await saveNow();
  writeLink(null);         // detach first so the blank list doesn't overwrite the saved one
  TL.newList();
  await saveCurrentAsNew(); // and save the new list as its own entry
  $("#lists-dialog").close();
});

// ---------- Read-only access for the Draft tab ----------
window.TLCloud = {
  signedIn: () => !!user,
  linkedListId: () => (linkedHere() ? link.listId : null),
  fetchLists: () => (user ? fetchLists() : Promise.resolve([])),
};

// ---------- Wiring ----------
window.addEventListener("tl:detach", () => writeLink(null));

(async function start() {
  renderAccount();
  renderStatus();
  await TL.ready;
  TL.onChange(scheduleSave);
  if (!window.FIREBASE_CONFIG) return;
  try {
    await loadFirebase();
  } catch (err) {
    console.error("Couldn't load Firebase", err);
    return;
  }
  let refreshed = false;
  fb.auth.onAuthStateChanged(fb.a, async (u) => {
    user = u;
    renderAccount();
    renderStatus();
    window.dispatchEvent(new Event("tl:auth")); // lets the Draft tab refresh its list of saved tier lists
    if (!u) return;
    if (linkedHere()) {
      // Once per visit, pick up changes made to the linked list on another device.
      if (!refreshed) { refreshed = true; await refreshLinked(); }
      return;
    }
    // Signed in without a linked list: show their saved lists so they can open one.
    try {
      const lists = await fetchLists();
      if (lists.length) openLists();
    } catch (_) {}
  });
})();

async function refreshLinked() {
  try {
    const snap = await fb.store.getDoc(listDoc(link.listId));
    if (!snap.exists()) { writeLink(null); return; }
    const remote = snap.data().data;
    if (remote && remote !== JSON.stringify(TL.getState())) {
      TL.replaceState(JSON.parse(remote)); // also re-saves locally; the resulting autosave is a no-op content-wise
    }
    setStatus("saved");
  } catch (err) {
    console.error(err);
  }
}
