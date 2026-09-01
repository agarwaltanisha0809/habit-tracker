// Persistence layer — all localStorage reads/writes live here.
// Streaks are derived from history each time they're needed (never stored),
// and are schedule-aware: only days a habit was actually scheduled count
// toward or break a streak, so a "weekdays only" habit doesn't lose its
// streak over a weekend it was never supposed to run on.
const STORAGE_KEY = "habitTracker.v4";
const LEGACY_V3_KEY = "habitTracker.v3";
const HISTORY_DAYS_CAP = 180;

// Manual backup — a plain JSON export/import independent of Sync, so there's
// always a way to save your data yourself (e.g. before clearing Safari data,
// updating iOS, or anything else that could evict local storage).
function exportBackup() {
  return localStorage.getItem(STORAGE_KEY) || "{}";
}

function importBackup(jsonString) {
  const parsed = JSON.parse(jsonString); // throws on invalid input, caller should catch
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.habits)) {
    throw new Error("This doesn't look like a Habits backup file.");
  }
  localStorage.setItem(STORAGE_KEY, jsonString);
}

let ALL_HABITS = [];
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
  if (habit.type === "sleep") {
    return (entry.hours || 0) > 0;
  }
  return !!entry.done;
}

function defaultEntry(habit) {
  if (habit.type === "counter") return { count: 0, note: "" };
  if (habit.type === "sleep") return { startAt: null, endAt: null, hours: 0, note: "" };
  return { done: false, note: "" };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

let dirtyDates = [];
let onStateChange = function () {}; // sync.js overrides this if loaded

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
  return { date: todayKey(), entries: {}, history: {}, habits: [], shelf: [], meta: { updatedAt: {} } };
}

// Migrates the v3 (fixed daily-list, no scheduling) schema if present.
function migrateLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_V3_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw);
    localStorage.removeItem(LEGACY_V3_KEY);
    const migratedHabits = (legacy.customHabits || []).map((h) => ({
      ...h,
      schedule: { kind: "daily" },
      createdAt: Date.now(),
    }));
    return {
      date: legacy.date || todayKey(),
      entries: legacy.entries || {},
      history: legacy.history || {},
      habits: migratedHabits,
      meta: { updatedAt: {} },
    };
  } catch (e) {
    return null;
  }
}

function ensureEntry(state, date, habitId) {
  const habit = ALL_HABITS.find((h) => h.id === habitId);
  if (!habit) return;
  const bucket = date === state.date ? state.entries : state.history[date] || (state.history[date] = {});
  if (!(habitId in bucket)) bucket[habitId] = defaultEntry(habit);
}

// Ensures state matches today's date, archiving the previous day into history on rollover.
function getState() {
  let state = loadRaw();
  if (!state) {
    state = migrateLegacyState() || freshState();
  }
  if (!state.history) state.history = {};
  if (!state.habits) state.habits = [];
  if (!state.shelf) state.shelf = [];
  if (!state.meta) state.meta = { updatedAt: {} };
  if (!state.meta.updatedAt) state.meta.updatedAt = {};

  if (!state.habits.some((h) => h.type === "sleep")) {
    state.habits.push({
      id: "sleep",
      emoji: "😴",
      label: "Sleep",
      color: "purple",
      type: "sleep",
      schedule: { kind: "daily" },
      createdAt: Date.now(),
      excludeFromTracker: null,
    });
  }
  ALL_HABITS = state.habits;

  const today = todayKey();
  if (state.date !== today) {
    // Remember the last date the app was actually open, so carry-over can
    // catch up on the whole gap (e.g. the app wasn't opened for 3 days) —
    // not just "yesterday". This naturally self-corrects: a normal
    // day-to-day gap of 1 still only looks at yesterday, same as before.
    state.pendingCarryOverFrom = state.date;
    state.history[state.date] = state.entries;
    trimHistory(state.history);
    state.entries = {};
    state.date = today;
  }

  ALL_HABITS.forEach((h) => {
    if (isScheduledForDate(h, state.date) && !(h.id in state.entries)) {
      state.entries[h.id] = defaultEntry(h);
    }
  });

  saveRaw(state, { silent: true });
  return state;
}

function trimHistory(history) {
  const dates = Object.keys(history).sort();
  while (dates.length > HISTORY_DAYS_CAP) {
    delete history[dates.shift()];
  }
}

// Sleep is logged as two taps (bedtime, wake time), never a live-running
// timer. Bedtime is usually tapped the night before wake time, so "end"
// looks back at yesterday's entry (in history) if today has no open start.
function startSleep(habitId) {
  const state = getState();
  ensureEntry(state, state.date, habitId);
  state.entries[habitId] = { ...state.entries[habitId], startAt: Date.now(), endAt: null, hours: 0 };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

function endSleep(habitId) {
  const state = getState();
  let targetDate = state.date;
  let entry = state.entries[habitId];

  if (!entry || !entry.startAt || entry.endAt) {
    const yesterday = addDays(state.date, -1);
    const yEntry = state.history[yesterday] && state.history[yesterday][habitId];
    if (yEntry && yEntry.startAt && !yEntry.endAt) {
      targetDate = yesterday;
      entry = yEntry;
    }
  }
  if (!entry || !entry.startAt || entry.endAt) return state;

  const endAt = Date.now();
  const hours = Math.round(((endAt - entry.startAt) / 3600000) * 10) / 10;
  const updated = { ...entry, endAt, hours };

  if (targetDate === state.date) state.entries[habitId] = updated;
  else state.history[targetDate][habitId] = updated;

  markDirty(state, targetDate);
  saveRaw(state);
  return state;
}

function resetSleep(habitId) {
  const state = getState();
  const note = (state.entries[habitId] && state.entries[habitId].note) || "";
  state.entries[habitId] = { startAt: null, endAt: null, hours: 0, note };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

function setNote(habitId, note) {
  const state = getState();
  ensureEntry(state, state.date, habitId);
  state.entries[habitId] = { ...state.entries[habitId], note };
  markDirty(state, state.date);
  saveRaw(state);
  return state;
}

// --- Editing any date (past, today) from the calendar, heatmap, or weekly view ---

function getAllDaysMap(state) {
  return { ...state.history, [state.date]: state.entries };
}

function getEntriesForDate(state, date) {
  if (date === state.date) return state.entries;
  return state.history[date] || null;
}

// Stamps completedAt the moment an entry transitions to completed (cleared
// if it's un-checked), used to break "Best day" ties by whichever tied day
// finished all its habits earliest — see tracker.js.
function withCompletionStamp(habit, previousEntry, nextEntry) {
  const wasCompleted = isCompleted(habit, previousEntry);
  const nowCompleted = isCompleted(habit, nextEntry);
  if (nowCompleted && !wasCompleted) return { ...nextEntry, completedAt: Date.now() };
  if (!nowCompleted && wasCompleted) return { ...nextEntry, completedAt: null };
  return nextEntry;
}

function setEntryForDate(date, habitId, patch) {
  const state = getState();
  const habit = ALL_HABITS.find((h) => h.id === habitId);
  if (!habit) return state;
  if (date === state.date) {
    const previous = state.entries[habitId] || defaultEntry(habit);
    const next = { ...previous, ...patch };
    state.entries[habitId] = withCompletionStamp(habit, previous, next);
  } else {
    const bucket = state.history[date] || {};
    const previous = bucket[habitId] || defaultEntry(habit);
    const next = { ...previous, ...patch };
    bucket[habitId] = withCompletionStamp(habit, previous, next);
    state.history[date] = bucket;
  }
  markDirty(state, date);
  saveRaw(state);
  return state;
}

// --- Habits ---

function addHabit({ label, emoji, type, schedule, target, unitMl }) {
  const state = getState();
  // Date.now() alone can collide when habits are created in fast succession
  // (same millisecond), silently merging two habits' entries — add randomness.
  const id = "habit-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const color = COLOR_THEME_KEYS[state.habits.length % COLOR_THEME_KEYS.length];
  const finalSchedule = schedule || { kind: "daily" };
  // A recurring habit shouldn't retroactively appear on days before it was
  // created (e.g. adding "Read daily" today shouldn't show up on last
  // week's heatmap/tracker) — stamp today as its start date. Not applied to
  // "once" tasks: those already carry their own explicit single date, which
  // can legitimately be a past date (logging something for yesterday), so a
  // separate start-date restriction would wrongly block that.
  if (finalSchedule.kind !== "once") finalSchedule.startDate = todayKey();
  const base = {
    id,
    emoji: emoji || "⭐",
    label,
    color,
    schedule: finalSchedule,
    createdAt: Date.now(),
    excludeFromTracker: null, // null = auto-decide, true/false = manual override
  };
  const habit =
    type === "counter"
      ? {
          ...base,
          type: "counter",
          unit: "x",
          unitMl: unitMl || 0,
          target: Math.max(1, target || 1),
          completionThreshold: Math.max(1, target || 1),
        }
      : type === "sleep"
      ? { ...base, type: "sleep" }
      : { ...base, type: "check" };

  state.habits.push(habit);
  ALL_HABITS = state.habits;
  if (isScheduledForDate(habit, state.date)) state.entries[id] = defaultEntry(habit);
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// Edits an existing habit in place (name, emoji, schedule, target) without
// touching its id, color, or any past entries/history.
function updateHabit(habitId, { label, emoji, schedule, target, unitMl }) {
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;

  if (label != null) habit.label = label;
  if (emoji != null) habit.emoji = emoji;
  if (schedule != null) {
    // Editing a habit's schedule (e.g. daily -> weekdays) shouldn't reset
    // its start date — that would make it retroactively reappear on days
    // before it was ever created, the exact bug this field exists to
    // prevent. Carry the existing startDate forward unless the new
    // schedule is "once" (which doesn't use one).
    const preservedStart = habit.schedule && habit.schedule.startDate;
    habit.schedule = schedule.kind !== "once" && preservedStart ? { ...schedule, startDate: preservedStart } : schedule;
  }
  if (habit.type === "counter") {
    if (target != null) {
      habit.target = Math.max(1, target);
      habit.completionThreshold = Math.max(1, target);
    }
    if (unitMl != null) habit.unitMl = unitMl;
  }

  ALL_HABITS = state.habits;
  if (isScheduledForDate(habit, state.date) && !(habitId in state.entries)) {
    state.entries[habitId] = defaultEntry(habit);
  }
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

function removeHabit(habitId) {
  const state = getState();
  state.habits = state.habits.filter((h) => h.id !== habitId);
  delete state.entries[habitId];
  ALL_HABITS = state.habits;
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// Removes a recurring habit from a single date only (e.g. "just this day"
// in the delete-scope picker) without affecting other occurrences.
function skipHabitOnDate(habitId, date) {
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  habit.skipDates = (habit.skipDates || []).concat(date);
  if (date === state.date) delete state.entries[habitId];
  ALL_HABITS = state.habits;
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// Ends a recurring habit's schedule the day before `date`, so it stops
// appearing from `date` onward but past occurrences are untouched.
function endHabitRecurrenceFrom(habitId, date) {
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  habit.schedule = { ...habit.schedule, until: addDays(date, -1) };
  if (date === state.date) delete state.entries[habitId];
  ALL_HABITS = state.habits;
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// --- Carry-over (one-off "once" tasks only, never recurring habits) ---
// A task typed for a past date that never got done doesn't just vanish —
// it's surfaced once per day so the user can decide to bring it into today
// or drop it, instead of either losing it silently or having it nag forever.

function getOverdueOnceTasks(state) {
  // Surfaces undone tasks from the *actual gap* since the app was last
  // opened — normally that's just yesterday, but if the app wasn't opened
  // for 2-3 days, this catches all of those skipped days at once instead of
  // only the most recent one. `pendingCarryOverFrom` is set once per real
  // rollover (see getState()) to the last date the app was open before the
  // gap, so it naturally resets to "yesterday" for the common one-day case
  // and doesn't accumulate indefinitely — a task keeps getting surfaced
  // only within its own gap, not forever.
  const windowStart = state.pendingCarryOverFrom || addDays(state.date, -1);
  return state.habits.filter((h) => {
    if (!h.schedule || h.schedule.kind !== "once") return false;
    if (h.schedule.date < windowStart || h.schedule.date >= state.date) return false;
    if (h.carryOverDismissedDate === state.date) return false; // already answered today
    const entry = state.history[h.schedule.date] && state.history[h.schedule.date][h.id];
    return !isCompleted(h, entry);
  });
}

function carryOverTask(habitId, targetDate) {
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  habit.schedule = { ...habit.schedule, date: targetDate };
  habit.carryOverDismissedDate = null;
  ALL_HABITS = state.habits;
  if (isScheduledForDate(habit, state.date) && !(habitId in state.entries)) {
    state.entries[habitId] = defaultEntry(habit);
  }
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

function dismissCarryOver(habitId, todayDate) {
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  habit.carryOverDismissedDate = todayDate;
  ALL_HABITS = state.habits;
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// --- Shelf: undated "someday" items (books, ideas, projects to start
// later). No schedule, no completion, no streaks — a pressure-free parking
// lot, separate from both habits and tasks. "Promoting" an item just means
// removing it here and creating a real habit/task elsewhere; the shelf
// itself has no notion of that, it's purely a flat list. ---

function addShelfItem({ label, emoji, category }) {
  const state = getState();
  const id = "shelf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  state.shelf.push({
    id,
    emoji: emoji || "📌",
    label,
    category: category || "Other",
    createdAt: Date.now(),
  });
  markDirty(state, "__shelf__");
  saveRaw(state);
  return state;
}

function removeShelfItem(itemId) {
  const state = getState();
  state.shelf = state.shelf.filter((s) => s.id !== itemId);
  markDirty(state, "__shelf__");
  saveRaw(state);
  return state;
}

function setTrackerOverride(habitId, override) {
  // override: true (force show), false (force hide), null (auto-decide)
  const state = getState();
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return state;
  habit.excludeFromTracker = override === null ? null : !override;
  ALL_HABITS = state.habits;
  markDirty(state, "__habits__");
  saveRaw(state);
  return state;
}

// --- Derived stats (computed from history each call, never stored) ---

function computeCurrentStreak(habit, daysMap, fromDate) {
  let streak = 0;
  let cursor = fromDate;
  let iterations = 0;
  while (iterations < 3660) {
    iterations++;
    if (isScheduledForDate(habit, cursor)) {
      const entries = daysMap[cursor];
      if (isCompleted(habit, entries && entries[habit.id])) {
        streak++;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    } else {
      cursor = addDays(cursor, -1);
    }
  }
  return streak;
}

function computeLongestStreak(habit, daysMap) {
  const dates = Object.keys(daysMap).sort();
  if (!dates.length) return 0;
  let cursor = dates[0];
  const last = dates[dates.length - 1];
  let run = 0;
  let longest = 0;
  let iterations = 0;
  while (cursor <= last && iterations < 3660) {
    iterations++;
    if (isScheduledForDate(habit, cursor)) {
      const entries = daysMap[cursor];
      if (isCompleted(habit, entries && entries[habit.id])) {
        run++;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return longest;
}

// Whether a habit should appear in the Habit Tracker tab. Previously this
// required a real completion rate (~3x/week over 30 days) after a bootstrap
// window, auto-hiding infrequent habits — the user explicitly asked to drop
// that: every recurring habit they've added should show up in the tracker
// regardless of how often they've actually completed it. Only "once"
// one-off tasks are excluded (they're not a recurring habit at all — see
// storage.js's Habits vs Tasks distinction), and an explicit manual
// override (excludeFromTracker, currently unused by any UI but left intact
// in case one is added later) still wins either way.
function isTrackerEligible(habit) {
  if (habit.excludeFromTracker === true) return false;
  if (habit.excludeFromTracker === false) return true;
  if (habit.schedule && habit.schedule.kind === "once") return false;
  return true;
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

function getTasksForDate(dateStr) {
  return ALL_HABITS.filter((h) => isScheduledForDate(h, dateStr));
}

function completedCountForEntries(entries, dateStr) {
  if (!entries) return 0;
  const tasks = getTasksForDate(dateStr);
  return tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
}
