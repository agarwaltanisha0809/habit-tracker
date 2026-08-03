// Habit/task definitions live entirely in localStorage now (see storage.js:
// addHabit/getHabits) — the app starts with zero pre-seeded habits. This file
// only holds shared constants and schedule helpers used across the app.

// Named color themes assigned to habits as they're created (rotated through
// in order). Each habit stores the theme *key*, not raw hex, so cards can
// look up { accent, bg, text, muted, badgeBg } and stay consistent everywhere.
const COLOR_THEMES = {
  teal: { accent: "#5DCAA5", bg: "#04342C", text: "#E1F5EE", muted: "#9FE1CB", badgeBg: "#085041" },
  blue: { accent: "#378ADD", bg: "#042C53", text: "#E6F1FB", muted: "#B5D4F4", badgeBg: "#0C447C" },
  purple: { accent: "#7F77DD", bg: "#26215C", text: "#EEEDFE", muted: "#CECBF6", badgeBg: "#3C3489" },
  coral: { accent: "#D85A30", bg: "#4A1B0C", text: "#FAECE7", muted: "#F5C4B3", badgeBg: "#712B13" },
  pink: { accent: "#D4537E", bg: "#4B1528", text: "#FBEAF0", muted: "#F4C0D1", badgeBg: "#72243E" },
  amber: { accent: "#EF9F27", bg: "#412402", text: "#FAEEDA", muted: "#FAC775", badgeBg: "#633806" },
  green: { accent: "#639922", bg: "#173404", text: "#EAF3DE", muted: "#C0DD97", badgeBg: "#27500A" },
  red: { accent: "#E24B4A", bg: "#501313", text: "#FCEBEB", muted: "#F7C1C1", badgeBg: "#791F1F" },
};
// Light-mode uses the inverse formula: pale tint background, saturated text.
const LIGHT_COLOR_THEMES = {
  teal: { accent: "#0F6E56", bg: "#E1F5EE", text: "#04342C", muted: "#0F6E56", badgeBg: "#9FE1CB" },
  blue: { accent: "#185FA5", bg: "#E6F1FB", text: "#042C53", muted: "#185FA5", badgeBg: "#B5D4F4" },
  purple: { accent: "#534AB7", bg: "#EEEDFE", text: "#26215C", muted: "#534AB7", badgeBg: "#CECBF6" },
  coral: { accent: "#993C1D", bg: "#FAECE7", text: "#4A1B0C", muted: "#993C1D", badgeBg: "#F5C4B3" },
  pink: { accent: "#993556", bg: "#FBEAF0", text: "#4B1528", muted: "#993556", badgeBg: "#F4C0D1" },
  amber: { accent: "#854F0B", bg: "#FAEEDA", text: "#412402", muted: "#854F0B", badgeBg: "#FAC775" },
  green: { accent: "#3B6D11", bg: "#EAF3DE", text: "#173404", muted: "#3B6D11", badgeBg: "#C0DD97" },
  red: { accent: "#A32D2D", bg: "#FCEBEB", text: "#501313", muted: "#A32D2D", badgeBg: "#F7C1C1" },
};
const COLOR_THEME_KEYS = Object.keys(COLOR_THEMES);

// Fixed visual treatment for one-off tasks (schedule.kind === "once"). Unlike
// habits, tasks don't rotate through COLOR_THEMES — every task looks the
// same bright, energetic gold regardless of what it's about, so the eye can
// bucket "temporary, needs clearing" vs. a habit's muted per-color identity
// at a glance, without reading any text. See applyTaskTone() in app.js.
const TASK_THEME = { accent: "#F5B23B", bg: "#3A2607", text: "#FCEFDA", muted: "#F7CD84", badgeBg: "#5C3B0A" };
const LIGHT_TASK_THEME = { accent: "#9A5B00", bg: "#FDF1DD", text: "#3A2607", muted: "#9A5B00", badgeBg: "#F7CD84" };

function themeForTask() {
  return isLightMode() ? LIGHT_TASK_THEME : TASK_THEME;
}

function isLightMode() {
  return document.documentElement.getAttribute("data-theme") === "light";
}

function themeFor(habit) {
  const table = isLightMode() ? LIGHT_COLOR_THEMES : COLOR_THEMES;
  return table[habit.color] || table.teal;
}

// A curated emoji set for the habit picker, grouped loosely by theme.
const EMOJI_CHOICES = [
  "📖", "✍️", "🎨", "🎧", "🎵", "🧠", "💡", "🗣️",
  "💧", "🍎", "🥗", "☕", "🚭", "🍽️", "🧴", "🪥",
  "🏃", "🏋️", "🧘", "🚴", "🥾", "🤸", "⛹️", "🚶",
  "😴", "🌙", "☀️", "🧹", "💰", "📚", "💻", "📞",
  "🌿", "🐾", "❤️", "🙏", "🎯", "✅", "⭐", "🔥",
  "📝", "📅", "⏰", "📌", "📎", "🗂️", "📮", "✉️",
  "💼", "🏦", "🧾", "📊", "📈", "💳", "🛒", "🧺",
  "🧽", "🧼", "🪴", "🌱", "🐶", "🐱", "🚗", "🚲",
  "✈️", "🏠", "🛠️", "🔧", "🖥️", "🖨️", "📷", "🎬",
  "🎮", "🎲", "🧩", "🎁", "🎉", "🧵", "🧶", "🪞",
  "🧴", "💊", "🩺", "🦷", "👟", "👗", "🧳", "🗺️",
  "🌸", "🌻", "🍀", "🌊", "⛰️", "🌤️", "❄️", "🧊",
  "🍳", "🥘", "🍲", "🍕", "🍩", "🍫", "🍵", "🧃",
];

// Keyword → emoji guesses for the quick-add compose bar. Free, local,
// no API call — matched as a substring against the lowercased task text.
// First match wins, so more specific keywords are listed before broader
// ones. Falls back to a plain checkmark when nothing matches.
const TASK_EMOJI_KEYWORDS = [
  [["call", "phone", "ring"], "📞"],
  [["email", "mail", "inbox"], "✉️"],
  [["text", "message", "dm"], "💬"],
  [["meeting", "meet", "sync", "standup"], "🗓️"],
  [["pay", "bill", "invoice", "rent", "bank"], "🏦"],
  [["buy", "shop", "grocery", "groceries", "order"], "🛒"],
  [["clean", "tidy", "laundry", "dishes", "vacuum"], "🧹"],
  [["cook", "dinner", "lunch", "breakfast", "meal"], "🍳"],
  [["read", "book", "article"], "📖"],
  [["write", "draft", "doc", "essay", "blog"], "✍️"],
  [["code", "bug", "deploy", "pr", "ship"], "💻"],
  [["gym", "workout", "run", "exercise", "yoga"], "🏃"],
  [["doctor", "dentist", "appointment", "checkup"], "🩺"],
  [["package", "return", "ship", "mail"], "📦"],
  [["travel", "flight", "trip", "pack"], "✈️"],
  [["car", "drive", "gas", "oil change"], "🚗"],
  [["plant", "water the", "garden"], "🪴"],
  [["study", "exam", "homework", "class"], "📚"],
  [["birthday", "gift", "present"], "🎁"],
  [["clean up", "fix", "repair"], "🔧"],
];

function guessEmojiForLabel(label) {
  const text = (label || "").toLowerCase();
  for (const [keywords, emoji] of TASK_EMOJI_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) return emoji;
  }
  return "✅";
}

// Schedule kinds: "daily", "weekdays", "weekends", "custom" (specific
// weekdays via schedule.days, 0=Sun..6=Sat like Date.getDay()), or "once"
// (schedule.date is a single "YYYY-MM-DD"). schedule.until (optional) ends
// the recurrence after that date; habit.skipDates (optional) excludes
// individual dates — both set via the "delete for these days" flow.
function isScheduledForDate(habit, dateStr) {
  if (habit.skipDates && habit.skipDates.includes(dateStr)) return false;
  const schedule = habit.schedule || { kind: "daily" };
  if (schedule.until && dateStr > schedule.until) return false;
  if (schedule.kind === "once") return schedule.date === dateStr;
  const day = new Date(dateStr + "T00:00:00").getDay();
  if (schedule.kind === "daily") return true;
  if (schedule.kind === "weekdays") return day >= 1 && day <= 5;
  if (schedule.kind === "weekends") return day === 0 || day === 6;
  if (schedule.kind === "custom") return (schedule.days || []).includes(day);
  return true;
}

function scheduleLabel(schedule) {
  if (!schedule) return "daily";
  if (schedule.kind === "daily") return "daily";
  if (schedule.kind === "weekdays") return "weekdays";
  if (schedule.kind === "weekends") return "weekends";
  if (schedule.kind === "once") return "just for today";
  if (schedule.kind === "custom") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (schedule.days || []).map((d) => names[d]).join(", ");
  }
  return "daily";
}
