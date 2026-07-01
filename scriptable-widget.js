// Habits widget for Scriptable (https://scriptable.app, free on the App Store).
// This is a READ-ONLY glance at your progress — tapping it opens the real app,
// since iOS doesn't let third-party widgets be interactive without a native app.
//
// Setup:
// 1. Install Scriptable from the App Store.
// 2. Create a new script, name it "Habits", paste this file's contents in.
// 3. Set SYNC_CODE below to the code from the app's Settings → Sync (Sync must
//    be turned on — this widget reads Firestore, not local storage).
// 4. Set APP_URL to your deployed GitHub Pages URL.
// 5. Long-press your Home Screen or Lock Screen → Add Widget → Scriptable →
//    pick this script. Small/medium works on the Home Screen; the circular
//    style works on the iOS 16+ Lock Screen.

const SYNC_CODE = "PASTE_YOUR_SYNC_CODE_HERE";
const APP_URL = "https://agarwaltanisha0809.github.io/habit-tracker/";
const PROJECT_ID = "habit-tracker-667bc";

function fsValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return fsFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsValue);
  return null;
}

function fsFields(fields) {
  const out = {};
  Object.keys(fields).forEach((k) => (out[k] = fsValue(fields[k])));
  return out;
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isCompleted(habit, entry) {
  if (!entry) return false;
  if (habit.type === "counter") return (entry.count || 0) >= (habit.completionThreshold || habit.target);
  if (habit.type === "sleep") return (entry.hours || 0) > 0;
  return !!entry.done;
}

async function fetchDoc(path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const req = new Request(url);
  const res = await req.loadJSON();
  if (!res.fields) return null;
  return fsFields(res.fields);
}

async function getProgress() {
  const habitsDoc = await fetchDoc(`syncs/${SYNC_CODE}/meta/habits`);
  const habits = (habitsDoc && habitsDoc.habits) || [];
  const todayDoc = await fetchDoc(`syncs/${SYNC_CODE}/days/${todayKey()}`);
  const entries = (todayDoc && todayDoc.entries) || {};

  const relevant = habits.filter((h) => h.type !== "sleep");
  const done = relevant.filter((h) => isCompleted(h, entries[h.id])).length;
  return { done, total: relevant.length, habits: relevant, entries };
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#0a0a0a");
  widget.url = APP_URL;

  try {
    const { done, total, habits, entries } = await getProgress();
    const fraction = total ? done / total : 0;

    if (config.widgetFamily === "accessoryCircular") {
      // Lock Screen circular gauge
      const gauge = widget.addStack();
      gauge.layoutVertically();
      const num = gauge.addText(`${done}/${total}`);
      num.font = Font.boldSystemFont(16);
      num.textColor = Color.white();
      num.centerAlignText();
      return widget;
    }

    const title = widget.addText("Habits");
    title.font = Font.italicSystemFont(14);
    title.textColor = new Color("#8c8579");
    widget.addSpacer(6);

    const big = widget.addText(`${done}/${total}`);
    big.font = Font.boldSystemFont(30);
    big.textColor = new Color("#f5f0ea");
    widget.addSpacer(4);

    const pct = widget.addText(total ? `${Math.round(fraction * 100)}% done today` : "No habits yet");
    pct.font = Font.systemFont(11);
    pct.textColor = new Color("#6b6154");

    if (config.widgetFamily === "medium") {
      widget.addSpacer(10);
      const row = widget.addStack();
      row.spacing = 6;
      habits.slice(0, 8).forEach((h) => {
        const dot = row.addText(isCompleted(h, entries[h.id]) ? "●" : "○");
        dot.font = Font.systemFont(16);
        dot.textColor = isCompleted(h, entries[h.id]) ? new Color("#d85a30") : new Color("#3a362f");
      });
    }
  } catch (e) {
    const err = widget.addText("Couldn't load. Check SYNC_CODE.");
    err.font = Font.systemFont(11);
    err.textColor = new Color("#e24b4a");
  }

  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentSmall();
}
Script.complete();
