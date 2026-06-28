// Persistence layer — all localStorage reads/writes live here.
// Streaks are derived from history each time they're needed (not incrementally
// tracked) so editing a past day's entries always keeps streaks correct.
const STORAGE_KEY = "habitTracker.v3";
const LEGACY_V2_KEY = "habitTracker.v2";
const HISTORY_DAYS_CAP = 120;

let ALL_HABITS = BASE_HABITS;
function getHabits() {
  return ALL_HABITS;
}

function todayKey(offsetDays = 0) {
  return addDays(formatDate(new Date()), offsetDays);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

function isCompleted(habit, entry) {
  if (!entry) return false;
  if (habit.type === "counter") {
    const threshold = habit.completionThreshold || habit.target;
    return (entry.count || 0) >= threshold;
  }
  return !!entry.done;
}

function defaultEntry(habit) {
  return habit.type === "counter" ? { count: 0, note: "" } : { done: false, note: "" };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Dates (or "__habits__") changed since the last save — read and cleared by sync.js.
let dirtyDates = [];

// Default no-op; sync.js (if loaded) overrides this to push changes to Firestore.
let onStateChange = function () {};

function markDirty(state, date) {
  state.meta.updatedAt[date] = Date.now();
  dirtyDates.push(date);
}

function saveRaw(state, opts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const dirty = dirtyDates;
  dirtyDates = [];
  if (!(opts && opts.silent) && dirty.length) {
    onStateChange(state, dirty);
  }
}

function freshState() {
  const entries = {};
  BASE_HABITS.forEach((h) => {
    entries[h.id] = defaultEntry(h);
  });
  return { date: todayKey(), entries, history: {}, customHabits: [], meta: { updatedAt: {} } };
}

// Migrates the v2 (pre-custom-habits, incremental-streak) schema if present.
function migrateLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_V2_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw);
    localStorage.removeItem(LEGACY_V2_KEY);
    return {
      date: legacy.date || todayKey(),
      entries: legacy.entries || {},
      history: legacy.history || {},
      customHabits: [],
    };
  } catch (e) {
    return null;
  }
}

function trimHistory(history) {
  const dates = Object.keys(history).sort();
  while (dates.length > HISTORY_DAYS_CAP) {
    delete history[dates.shift()];
  }
}

// Ensures state matches today's date, archiving the previous day into history on rollover.
function getState() {
  let state = loadRaw();
  if (!state) {
    state = migrateLegacyState() || freshState();
  }
  if (!state.history) state.history = {};
  if (!state.customHabits) state.customHabits = [];
  if (!state.meta) state.meta = { updatedAt: {} };
  if (!state.meta.updatedAt) state.meta.updatedAt = {};

  ALL_HABITS = BASE_HABITS.concat(state.customHabits);

  ALL_HABITS.forEach((h) => {
    if (!(h.id in state.entries)) state.entries[h.id] = defaultEntry(h);
  });

  const today = todayKey();
  if (state.date !== today) {
    state.history[state.date] = state.entries;
    trimHistory(state.history);

    const entries = {};
    ALL_HABITS.forEach((h) => {
      entries[h.id] = defaultEntry(h);
    });
    state.entries = entries;
    state.date = today;
  }

  saveRaw(state);
  return state;
}

function setCheckDone(habitId, done) {
  const state = getState();
  state.entries[habitId] = { ...state.entries[habitId], done };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

function setCounterCount(habitId, count) {
  const state = getState();
  state.entries[habitId] = { ...state.entries[habitId], count: Math.max(0, count) };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

function setNote(habitId, note) {
  const state = getState();
  state.entries[habitId] = { ...state.entries[habitId], note };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

// --- Editing a day other than today (past days, from the heatmap/weekly view) ---

function getAllDaysMap(state) {
  return { ...state.history, [state.date]: state.entries };
}

function getEntriesForDate(state, date) {
  if (date === state.date) return state.entries;
  return state.history[date] || null;
}

function setEntryForDate(date, habitId, patch) {
  const state = getState();
  const habit = ALL_HABITS.find((h) => h.id === habitId);
  if (date === state.date) {
    state.entries[habitId] = { ...state.entries[habitId], ...patch };
  } else {
    const bucket = state.history[date] || {};
    bucket[habitId] = { ...(bucket[habitId] || defaultEntry(habit)), ...patch };
    state.history[date] = bucket;
  }
  markDirty(state, date);
  saveRaw(state);
  return state;
}

// --- Custom habits ---

function addHabit({ label, emoji, type, target, unitMl }) {
  const state = getState();
  const id = "custom-" + Date.now().toString(36);
  const color = CUSTOM_HABIT_COLORS[state.customHabits.length % CUSTOM_HABIT_COLORS.length];
  const habit =
    type === "counter"
      ? {
          id,
          emoji: emoji || "⭐",
          label,
          sublabel: "",
          type: "counter",
          unit: "x",
          unitMl: unitMl || 0,
          target: Math.max(1, target || 1),
          completionThreshold: Math.max(1, target || 1),
          color,
        }
      : { id, emoji: emoji || "⭐", label, sublabel: "", type: "check", color };

  state.customHabits.push(habit);
  state.entries[id] = defaultEntry(habit);
  ALL_HABITS = BASE_HABITS.concat(state.customHabits);
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

function removeHabit(habitId) {
  const state = getState();
  state.customHabits = state.customHabits.filter((h) => h.id !== habitId);
  delete state.entries[habitId];
  ALL_HABITS = BASE_HABITS.concat(state.customHabits);
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// --- Derived stats (computed from history each call, never stored) ---

function computeCurrentStreak(habit, daysMap, fromDate) {
  let streak = 0;
  let cursor = fromDate;
  while (isCompleted(habit, daysMap[cursor])) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function computeLongestStreak(habit, daysMap) {
  const dates = Object.keys(daysMap).sort();
  let longest = 0;
  let run = 0;
  let prevDate = null;
  dates.forEach((date) => {
    const completed = isCompleted(habit, daysMap[date]);
    const consecutive = prevDate && addDays(prevDate, 1) === date;
    if (completed) {
      run = consecutive ? run + 1 : 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    prevDate = date;
  });
  return longest;
}

// Returns [{ date, entries }] for the last n days (oldest first), including today.
function getLastNDays(state, n) {
  const daysMap = getAllDaysMap(state);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(state.date, -i);
    days.push({ date, entries: daysMap[date] || null });
  }
  return days;
}

function completedCountForEntries(entries) {
  if (!entries) return 0;
  return ALL_HABITS.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
}
