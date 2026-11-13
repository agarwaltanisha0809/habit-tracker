// Optional cross-device sync via Firebase Firestore. The app works fully offline
// without this — sync only activates once a 6-character pairing code is set.
// Merge strategy: last-write-wins per calendar day, compared via meta.updatedAt.
const firebaseConfig = {
  apiKey: "AIzaSyAXMW6e28k6ZUwgsTn-hRopbnFpCBpTnqA",
  authDomain: "habit-tracker-667bc.firebaseapp.com",
  projectId: "habit-tracker-667bc",
  storageBucket: "habit-tracker-667bc.firebasestorage.app",
  messagingSenderId: "548154873572",
  appId: "1:548154873572:web:e536dbe54402a69412fef1",
};

const SYNC_CODE_KEY = "habitTracker.syncCode";
const SYNC_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, easy to read aloud

let syncDb = null;
let syncUnsubscribes = [];

function getDb() {
  if (!syncDb) {
    firebase.initializeApp(firebaseConfig);
    syncDb = firebase.firestore();
  }
  return syncDb;
}

function getSyncCode() {
  return localStorage.getItem(SYNC_CODE_KEY) || "";
}

function generateSyncCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SYNC_CODE_CHARS[Math.floor(Math.random() * SYNC_CODE_CHARS.length)];
  }
  return code;
}

function stopSync() {
  syncUnsubscribes.forEach((unsub) => unsub());
  syncUnsubscribes = [];
}

function syncDocRef(code) {
  return getDb().collection("syncs").doc(code);
}

function startSync(code) {
  stopSync();
  bindSyncTriggers();
  const base = syncDocRef(code);

  const unsubDays = base.collection("days").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "removed") return;
      const data = change.doc.data();
      mergeRemoteDay(change.doc.id, data.entries, data.updatedAt);
    });
  });

  const unsubHabits = base
    .collection("meta")
    .doc("habits")
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();
      mergeRemoteHabits(data.habits, data.updatedAt);
    });

  syncUnsubscribes = [unsubDays, unsubHabits];
}

function mergeRemoteDay(date, entries, updatedAt) {
  if (!entries || !updatedAt) return;
  const state = getState();
  const localUpdatedAt = state.meta.updatedAt[date] || 0;
  if (updatedAt < localUpdatedAt) {
    // Cloud is older than this device: an earlier write never made it up.
    // Never overwrite local with it — push local instead.
    enqueuePending([date]);
    flushPending();
    return;
  }
  if (updatedAt === localUpdatedAt) return;

  if (date === state.date) {
    state.entries = entries;
  } else {
    state.history[date] = entries;
  }
  state.meta.updatedAt[date] = updatedAt;
  saveRaw(state, { silent: true });
  if (typeof refreshApp === "function") refreshApp();
}

function mergeRemoteHabits(habits, updatedAt) {
  if (!updatedAt) return;
  const state = getState();
  const localUpdatedAt = state.meta.updatedAt.__habits__ || 0;
  if (updatedAt < localUpdatedAt) {
    enqueuePending(["__habits__"]);
    flushPending();
    return;
  }
  if (updatedAt === localUpdatedAt) return;

  state.habits = habits || [];
  state.meta.updatedAt.__habits__ = updatedAt;
  ALL_HABITS = state.habits;
  ALL_HABITS.forEach((h) => {
    if (isScheduledForDate(h, state.date) && !(h.id in state.entries)) {
      state.entries[h.id] = defaultEntry(h);
    }
  });
  saveRaw(state, { silent: true });
  if (typeof refreshApp === "function") refreshApp();
  if (typeof renderHabitsList === "function") renderHabitsList();
}

// --- Durable outbox -------------------------------------------------------
// Every local change is recorded in localStorage (SYNC_PENDING_KEY) *before*
// any network call, and only removed once Firestore confirms that exact
// version. Previously writes were fire-and-forget: the Firestore SDK's own
// offline queue is in-memory only (persistence is not enabled), so a write
// that hadn't reached the server when the app was backgrounded, killed, or
// the phone went offline/off was silently lost and never retried.
const SYNC_PENDING_KEY = "habitTracker.syncPending";
const SYNC_WRITE_TIMEOUT_MS = 15000;
let syncFlushing = false;
let syncRetryTimer = null;
let syncRetryDelay = 5000;
let syncTriggersBound = false;
let syncLastError = null;

function loadPending() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function savePending(list) {
  localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(list));
  updateSyncIndicator();
}

function enqueuePending(keys) {
  if (!getSyncCode()) return;
  const set = new Set(loadPending());
  keys.forEach((k) => set.add(k));
  savePending(Array.from(set));
}

function removePending(key) {
  savePending(loadPending().filter((k) => k !== key));
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("sync write timed out")), ms))]);
}

function stampFor(state, key) {
  return state.meta.updatedAt[key];
}

async function flushPending() {
  const code = getSyncCode();
  if (!code || syncFlushing) return;
  if (!loadPending().length) return;
  syncFlushing = true;
  let failed = false;
  try {
    for (const key of loadPending()) {
      const state = getState();
      const stamp = stampFor(state, key);
      let ref;
      let payload;
      if (key === "__habits__") {
        ref = syncDocRef(code).collection("meta").doc("habits");
        payload = { habits: state.habits, updatedAt: stamp };
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        const entries = key === state.date ? state.entries : state.history[key];
        if (!entries) {
          removePending(key);
          continue;
        }
        ref = syncDocRef(code).collection("days").doc(key);
        payload = { entries, updatedAt: stamp };
      } else {
        // Unknown key (e.g. __shelf__, which has no cloud doc) — nothing to send.
        removePending(key);
        continue;
      }
      try {
        await withTimeout(ref.set(payload), SYNC_WRITE_TIMEOUT_MS);
        // Only clear if nothing newer was written while this was in flight.
        if (stampFor(getState(), key) === stamp) removePending(key);
        syncLastError = null;
      } catch (e) {
        syncLastError = e;
        failed = true;
        break;
      }
    }
  } finally {
    syncFlushing = false;
  }
  if (failed) {
    scheduleSyncRetry();
  } else {
    syncRetryDelay = 5000;
    if (loadPending().length) flushPending();
  }
  updateSyncIndicator();
}

function scheduleSyncRetry() {
  clearTimeout(syncRetryTimer);
  syncRetryTimer = setTimeout(flushPending, syncRetryDelay);
  syncRetryDelay = Math.min(syncRetryDelay * 2, 60000);
}

function updateSyncIndicator() {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  const pending = getSyncCode() ? loadPending().filter((k) => k !== "__shelf__").length : 0;
  el.hidden = pending === 0;
  if (pending === 0) return;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  el.textContent = offline ? `Offline · ${pending} unsynced` : `Unsynced · ${pending}`;
  el.title = syncLastError ? `Last error: ${syncLastError.message}. Tap to retry.` : "Waiting to sync. Tap to retry.";
}

// Flush whenever the app could be about to lose the page or has regained
// the network. The pending list is already persisted, so even if the page
// dies mid-write the change is retried on next open.
function bindSyncTriggers() {
  if (syncTriggersBound) return;
  syncTriggersBound = true;
  window.addEventListener("online", () => {
    syncRetryDelay = 5000;
    updateSyncIndicator();
    flushPending();
  });
  window.addEventListener("offline", updateSyncIndicator);
  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
    else {
      syncRetryDelay = 5000;
      flushPending();
    }
  });
  const btn = document.getElementById("syncStatus");
  if (btn) btn.addEventListener("click", () => {
    syncRetryDelay = 5000;
    flushPending();
  });
}

// Hook called by storage.js after every non-silent local save.
onStateChange = function (state, dirty) {
  enqueuePending(dirty);
  flushPending();
};

// First device generating a code: seed Firestore with everything we have so far.
function enableSyncAsHost(code) {
  localStorage.setItem(SYNC_CODE_KEY, code);
  const state = getState();
  const allDates = Object.keys(state.history).concat([state.date]);
  allDates.forEach((d) => markDirty(state, d));
  markDirty(state, "__habits__");
  saveRaw(state, { silent: true });
  enqueuePending(allDates.concat(["__habits__"]));
  startSync(code);
  flushPending();
}

// Second device joining with an existing code: just start listening and let
// the remote data merge in (it's newer than this device's empty/older state).
function enableSyncAsGuest(code) {
  localStorage.setItem(SYNC_CODE_KEY, code);
  startSync(code);
}

function disableSync() {
  localStorage.removeItem(SYNC_CODE_KEY);
  localStorage.removeItem(SYNC_PENDING_KEY);
  stopSync();
  updateSyncIndicator();
}

function initSyncOnLoad() {
  const code = getSyncCode();
  if (code) {
    startSync(code);
    flushPending();
  }
  updateSyncIndicator();
}
