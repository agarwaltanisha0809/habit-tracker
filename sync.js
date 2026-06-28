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
      mergeRemoteHabits(data.customHabits, data.updatedAt);
    });

  syncUnsubscribes = [unsubDays, unsubHabits];
}

function mergeRemoteDay(date, entries, updatedAt) {
  if (!entries || !updatedAt) return;
  const state = getState();
  const localUpdatedAt = state.meta.updatedAt[date] || 0;
  if (updatedAt <= localUpdatedAt) return;

  if (date === state.date) {
    state.entries = entries;
  } else {
    state.history[date] = entries;
  }
  state.meta.updatedAt[date] = updatedAt;
  saveRaw(state, { silent: true });
  if (typeof refreshApp === "function") refreshApp();
}

function mergeRemoteHabits(customHabits, updatedAt) {
  if (!updatedAt) return;
  const state = getState();
  const localUpdatedAt = state.meta.updatedAt.__habits__ || 0;
  if (updatedAt <= localUpdatedAt) return;

  state.customHabits = customHabits || [];
  state.meta.updatedAt.__habits__ = updatedAt;
  ALL_HABITS = BASE_HABITS.concat(state.customHabits);
  ALL_HABITS.forEach((h) => {
    if (!(h.id in state.entries)) state.entries[h.id] = defaultEntry(h);
  });
  saveRaw(state, { silent: true });
  if (typeof refreshApp === "function") refreshApp();
  if (typeof renderCustomHabitsList === "function") renderCustomHabitsList();
}

function pushDirty(state, dates) {
  const code = getSyncCode();
  if (!code || !dates.length) return;
  const base = syncDocRef(code);
  dates.forEach((date) => {
    if (date === "__habits__") {
      base.collection("meta").doc("habits").set({
        customHabits: state.customHabits,
        updatedAt: state.meta.updatedAt.__habits__,
      });
    } else {
      const entries = date === state.date ? state.entries : state.history[date];
      if (!entries) return;
      base.collection("days").doc(date).set({
        entries,
        updatedAt: state.meta.updatedAt[date],
      });
    }
  });
}

// Hook called by storage.js after every non-silent local save.
onStateChange = function (state, dirty) {
  pushDirty(state, dirty);
};

// First device generating a code: seed Firestore with everything we have so far.
function enableSyncAsHost(code) {
  localStorage.setItem(SYNC_CODE_KEY, code);
  const state = getState();
  const allDates = Object.keys(state.history).concat([state.date]);
  allDates.forEach((d) => markDirty(state, d));
  markDirty(state, "__habits__");
  saveRaw(state, { silent: true });
  pushDirty(state, allDates.concat(["__habits__"]));
  startSync(code);
}

// Second device joining with an existing code: just start listening and let
// the remote data merge in (it's newer than this device's empty/older state).
function enableSyncAsGuest(code) {
  localStorage.setItem(SYNC_CODE_KEY, code);
  startSync(code);
}

function disableSync() {
  localStorage.removeItem(SYNC_CODE_KEY);
  stopSync();
}

function initSyncOnLoad() {
  const code = getSyncCode();
  if (code) startSync(code);
}
