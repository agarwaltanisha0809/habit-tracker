// Built-in habit definitions. Habits added in-app are stored separately in
// localStorage (see storage.js: addHabit/getHabits) and merged with this list.
// type: "check" (simple done/not-done) or "counter" (incremental, e.g. glasses of water)
const BASE_HABITS = [
  {
    id: "read",
    emoji: "📖",
    label: "Read",
    sublabel: "even 1 page",
    type: "check",
    color: "#c8924f",
  },
  {
    id: "skincare",
    emoji: "🌙",
    label: "Skincare + brush",
    sublabel: "night routine",
    type: "check",
    color: "#9c7fc9",
  },
  {
    id: "water",
    emoji: "💧",
    label: "Drink water",
    sublabel: "3L goal",
    type: "counter",
    unit: "glass",
    unitMl: 250,
    target: 12, // 12 x 250ml = 3L — the display goal
    completionThreshold: 8, // but counts as "done" for streaks/progress at 2L
    color: "#3f9bb0",
  },
  {
    id: "news",
    emoji: "📰",
    label: "Read the news",
    sublabel: "stay in the loop",
    type: "check",
    color: "#d97847",
  },
  {
    id: "podcast",
    emoji: "🎧",
    label: "Listen to a podcast",
    sublabel: "learn something",
    type: "check",
    color: "#c25777",
  },
];

// Rotation of colors assigned to habits the user adds themselves.
const CUSTOM_HABIT_COLORS = ["#5a9b6b", "#5d83c4", "#bb6fae", "#c4934a", "#4fa898", "#a06bd1"];
