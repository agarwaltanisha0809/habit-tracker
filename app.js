// Rendering + interaction layer.
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const habitListEl = document.getElementById("habitList");
const progressRingEl = document.getElementById("progressRing");
const progressCountEl = document.getElementById("progressCount");
const progressCaptionEl = document.getElementById("progressCaption");
const todayLabelEl = document.getElementById("todayLabel");

progressRingEl.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;

function renderTodayLabel() {
  const opts = { weekday: "long", month: "long", day: "numeric" };
  todayLabelEl.textContent = new Date().toLocaleDateString(undefined, opts);
}

function captionFor(count, total) {
  if (count === 0) return "Let's get started";
  if (count === total) return "All done — amazing! ✨";
  if (count >= total - 1) return "Almost there!";
  return "Nice progress";
}

// Red -> yellow -> green as the day fills up.
function ringColorFor(fraction) {
  if (fraction >= 1) return "#4f8f3a";
  if (fraction >= 0.66) return "#7fae77";
  if (fraction >= 0.33) return "#e0a83e";
  if (fraction > 0) return "#d9714e";
  return "var(--ring-bg)";
}

function updateProgress(state) {
  const habits = getHabits();
  const completedCount = habits.reduce(
    (acc, h) => acc + (isCompleted(h, state.entries[h.id]) ? 1 : 0),
    0
  );
  const fraction = completedCount / habits.length;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  progressRingEl.style.strokeDashoffset = offset;
  progressRingEl.style.stroke = ringColorFor(fraction);
  progressCountEl.textContent = completedCount;
  document.querySelector(".progress-total").textContent = `/${habits.length}`;
  progressCaptionEl.textContent = captionFor(completedCount, habits.length);
}

function streakBadge(streak) {
  if (streak <= 0) return "";
  return `<span class="streak">🔥 ${streak} day${streak === 1 ? "" : "s"}</span>`;
}

function noteField(habit, entry) {
  return `
    <input
      type="text"
      class="note-input"
      data-habit="${habit.id}"
      placeholder="Add a note (optional)"
      value="${(entry.note || "").replace(/"/g, "&quot;")}"
      maxlength="140"
    />
  `;
}

function bindNoteInput(card, habit) {
  const input = card.querySelector(".note-input");
  let debounceTimer;
  input.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const value = e.target.value;
    debounceTimer = setTimeout(() => {
      setNote(habit.id, value);
    }, 400);
  });
}

function currentStreakFor(habit, state) {
  return computeCurrentStreak(habit, getAllDaysMap(state), state.date);
}

function renderCheckHabit(habit, state) {
  const entry = state.entries[habit.id];
  const done = isCompleted(habit, entry);
  const card = document.createElement("div");
  card.className = `habit-card${done ? " done" : ""}`;
  card.style.setProperty("--habit-color", habit.color || "var(--accent-strong)");
  card.innerHTML = `
    <button class="checkbox" aria-label="Toggle ${habit.label}" data-habit="${habit.id}">
      <span class="checkbox-inner">${done ? "✓" : ""}</span>
    </button>
    <div class="habit-info">
      <div class="habit-title">${habit.emoji} ${habit.label}</div>
      <div class="habit-sub">${habit.sublabel}</div>
      ${noteField(habit, entry)}
    </div>
    ${streakBadge(currentStreakFor(habit, state))}
  `;
  card.querySelector(".checkbox").addEventListener("click", (e) => {
    userHasInteracted = true;
    const newState = setCheckDone(habit.id, !done);
    burstAnimation(e.currentTarget, !done);
    render(newState);
  });
  bindNoteInput(card, habit);
  return card;
}

function renderCounterHabit(habit, state) {
  const entry = state.entries[habit.id];
  const count = entry.count || 0;
  const done = isCompleted(habit, entry);
  const litres = ((count * habit.unitMl) / 1000).toFixed(2);
  const goalLitres = (habit.target * habit.unitMl) / 1000;
  const card = document.createElement("div");
  card.className = `habit-card counter-card${done ? " done" : ""}`;
  card.style.setProperty("--habit-color", habit.color || "var(--water)");
  card.innerHTML = `
    <div class="habit-info wide">
      <div class="habit-title">${habit.emoji} ${habit.label}</div>
      <div class="habit-sub">${litres}L of ${goalLitres}L${done ? " · goal hit 🎉" : ""}</div>
      <div class="glass-track">
        ${Array.from({ length: habit.target })
          .map((_, i) => `<span class="glass${i < count ? " filled" : ""}"></span>`)
          .join("")}
      </div>
      ${noteField(habit, entry)}
    </div>
    <div class="counter-controls">
      <button class="counter-btn minus" data-habit="${habit.id}" aria-label="Remove a glass">−</button>
      <span class="counter-value">${count}</span>
      <button class="counter-btn plus" data-habit="${habit.id}" aria-label="Add a glass">+</button>
    </div>
    ${streakBadge(currentStreakFor(habit, state))}
  `;
  card.querySelector(".plus").addEventListener("click", (e) => {
    userHasInteracted = true;
    const newState = setCounterCount(habit.id, count + 1);
    burstAnimation(e.currentTarget, true);
    render(newState);
  });
  card.querySelector(".minus").addEventListener("click", () => {
    const newState = setCounterCount(habit.id, count - 1);
    render(newState);
  });
  bindNoteInput(card, habit);
  return card;
}

function burstAnimation(el, justCompleted) {
  if (!justCompleted) return;
  el.classList.remove("burst");
  requestAnimationFrame(() => {
    el.classList.add("burst");
  });
}

let lastRenderedCount = -1;
let userHasInteracted = false; // confetti should only fire from an actual toggle, never on page load

function render(state) {
  const habits = getHabits();
  habitListEl.innerHTML = "";
  habits.forEach((habit) => {
    const card =
      habit.type === "counter" ? renderCounterHabit(habit, state) : renderCheckHabit(habit, state);
    habitListEl.appendChild(card);
  });
  updateProgress(state);
  renderInsights(state);

  const completedCount = habits.reduce(
    (acc, h) => acc + (isCompleted(h, state.entries[h.id]) ? 1 : 0),
    0
  );
  if (userHasInteracted && completedCount === habits.length && lastRenderedCount < habits.length) {
    launchConfetti();
  }
  lastRenderedCount = completedCount;
}

// Exposed so dayEditor.js / settings.js can refresh the Today view + insights after an edit.
function refreshApp() {
  render(getState());
}

function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 5, 0); // a few seconds past midnight
  const msUntilMidnight = nextMidnight - now;
  setTimeout(() => {
    lastRenderedCount = -1;
    userHasInteracted = false;
    render(getState());
    renderTodayLabel();
    scheduleMidnightReset();
  }, msUntilMidnight);
}

function initViewToggle() {
  const todayBtn = document.getElementById("viewToday");
  const insightsBtn = document.getElementById("viewInsights");
  const todayView = document.getElementById("todayView");
  const insightsView = document.getElementById("insightsView");
  if (!todayBtn || !insightsBtn) return;

  function showView(view) {
    const showInsights = view === "insights";
    todayView.hidden = showInsights;
    insightsView.hidden = !showInsights;
    todayBtn.classList.toggle("active", !showInsights);
    insightsBtn.classList.toggle("active", showInsights);
  }

  todayBtn.addEventListener("click", () => showView("today"));
  insightsBtn.addEventListener("click", () => showView("insights"));
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

initTheme();
initViewToggle();
initServiceWorker();
initDayEditor();
initSettingsPanel();
if (typeof initSyncOnLoad === "function") initSyncOnLoad();
renderTodayLabel();
render(getState());
scheduleMidnightReset();
