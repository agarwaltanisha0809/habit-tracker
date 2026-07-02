// Modal for viewing/editing any date's tasks, opened from the Insights
// heatmap or the Habit Tracker views.
function dayEditorRow(habit, entry) {
  const t = themeFor(habit);
  const note = (entry.note || "").replace(/"/g, "&quot;");
  const style = `--tone-bg:${t.bg}; --tone-text:${t.text}; --tone-muted:${t.muted}; --tone-accent:${t.accent}; --tone-badge-bg:${t.badgeBg};`;

  if (habit.type === "counter") {
    return `
      <div class="bento-card" style="${style} margin-bottom:8px;" data-habit="${habit.id}">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>${habit.emoji} ${habit.label}</div>
          <div class="counter-controls">
            <button type="button" class="counter-btn minus" data-action="dec">−</button>
            <span class="counter-value">${entry.count || 0}</span>
            <button type="button" class="counter-btn plus" data-action="inc">+</button>
          </div>
        </div>
        <input type="text" class="task-note-input" data-action="note" placeholder="Add a note" value="${note}" maxlength="140" />
      </div>`;
  }
  if (habit.type === "sleep") {
    return `
      <div class="bento-card" style="${style} margin-bottom:8px;" data-habit="${habit.id}">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>${habit.emoji} ${habit.label}</div>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="number" step="0.1" min="0" max="24" class="settings-value-pill" data-action="hours"
              value="${entry.hours || 0}" style="width:60px; text-align:center;" />
            <span style="font-size:12px;">h</span>
          </div>
        </div>
        <input type="text" class="task-note-input" data-action="note" placeholder="Add a note" value="${note}" maxlength="140" />
      </div>`;
  }
  const done = isCompleted(habit, entry);
  return `
    <div class="bento-card" style="${style} margin-bottom:8px;" data-habit="${habit.id}">
      <div style="display:flex; align-items:center; gap:10px;">
        <button type="button" class="task-checkbox${done ? " done" : ""}" data-action="toggle">${done ? "✓" : ""}</button>
        <div>${habit.emoji} ${habit.label}</div>
      </div>
      <input type="text" class="task-note-input" data-action="note" placeholder="Add a note" value="${note}" maxlength="140" />
    </div>`;
}

function openDayEditor(date) {
  const today = todayKey();
  if (date > today) return;

  const modal = document.getElementById("dayModal");
  const title = document.getElementById("dayModalTitle");
  const body = document.getElementById("dayModalBody");

  const isToday = date === today;
  title.textContent =
    new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    (isToday ? " (today)" : "");

  const state = getState();
  const entries = getEntriesForDate(state, date) || {};
  const tasks = getTasksForDate(date);

  body.innerHTML = tasks.length
    ? tasks.map((habit) => dayEditorRow(habit, entries[habit.id] || defaultEntry(habit))).join("")
    : `<div class="app-footer">Nothing was scheduled this day.</div>`;

  body.querySelectorAll(".bento-card[data-habit]").forEach((row) => {
    const habitId = row.dataset.habit;
    const habit = tasks.find((h) => h.id === habitId);

    const toggle = row.querySelector('[data-action="toggle"]');
    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = getEntriesForDate(getState(), date) || {};
        const done = isCompleted(habit, current[habitId]);
        setEntryForDate(date, habitId, { done: !done });
        if (typeof refreshApp === "function") refreshApp();
        openDayEditor(date);
      });
    }

    const minus = row.querySelector('[data-action="dec"]');
    const plus = row.querySelector('[data-action="inc"]');
    if (minus && plus) {
      minus.addEventListener("click", () => {
        const current = getEntriesForDate(getState(), date) || {};
        const count = (current[habitId] && current[habitId].count) || 0;
        setEntryForDate(date, habitId, { count: Math.max(0, count - 1) });
        if (typeof refreshApp === "function") refreshApp();
        openDayEditor(date);
      });
      plus.addEventListener("click", () => {
        const current = getEntriesForDate(getState(), date) || {};
        const count = (current[habitId] && current[habitId].count) || 0;
        setEntryForDate(date, habitId, { count: count + 1 });
        if (typeof refreshApp === "function") refreshApp();
        openDayEditor(date);
      });
    }

    const hoursInput = row.querySelector('[data-action="hours"]');
    if (hoursInput) {
      hoursInput.addEventListener("change", () => {
        const hours = Math.max(0, parseFloat(hoursInput.value) || 0);
        setEntryForDate(date, habitId, { hours });
        if (typeof refreshApp === "function") refreshApp();
      });
    }

    const note = row.querySelector('[data-action="note"]');
    let debounceTimer;
    note.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value;
      debounceTimer = setTimeout(() => {
        setEntryForDate(date, habitId, { note: value });
        if (typeof refreshApp === "function") refreshApp();
      }, 400);
    });
  });

  modal.hidden = false;
}

function closeDayEditor() {
  document.getElementById("dayModal").hidden = true;
}

function initDayEditor() {
  document.getElementById("dayModalClose").addEventListener("click", closeDayEditor);
  document.getElementById("dayModal").addEventListener("click", (e) => {
    if (e.target.id === "dayModal") closeDayEditor();
  });
}
