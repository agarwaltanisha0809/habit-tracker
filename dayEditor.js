// Modal for viewing/editing any past day's habits, opened from the heatmap or weekly view.
function dayEditorRow(habit, entry) {
  const note = (entry.note || "").replace(/"/g, "&quot;");
  if (habit.type === "counter") {
    return `
      <div class="modal-row" data-habit="${habit.id}" style="--habit-color: ${habit.color}">
        <div class="modal-row-top">
          <div class="modal-row-label">${habit.emoji} ${habit.label}</div>
          <div class="modal-counter">
            <button type="button" class="counter-btn minus" data-action="dec">−</button>
            <span class="counter-value">${entry.count || 0}</span>
            <button type="button" class="counter-btn plus" data-action="inc">+</button>
          </div>
        </div>
        <input type="text" class="note-input" data-action="note" placeholder="Add a note" value="${note}" maxlength="140" />
      </div>`;
  }
  const done = isCompleted(habit, entry);
  return `
    <div class="modal-row" data-habit="${habit.id}" style="--habit-color: ${habit.color}">
      <div class="modal-row-top">
        <button type="button" class="checkbox modal-checkbox${done ? " done" : ""}" data-action="toggle">
          <span class="checkbox-inner">${done ? "✓" : ""}</span>
        </button>
        <div class="modal-row-label">${habit.emoji} ${habit.label}</div>
      </div>
      <input type="text" class="note-input" data-action="note" placeholder="Add a note" value="${note}" maxlength="140" />
    </div>`;
}

function openDayEditor(date) {
  const today = todayKey();
  if (date > today) return; // no editing the future

  const modal = document.getElementById("dayModal");
  const title = document.getElementById("dayModalTitle");
  const body = document.getElementById("dayModalBody");

  const isToday = date === today;
  title.textContent =
    new Date(date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }) + (isToday ? " (today)" : "");

  const state = getState();
  const entries = getEntriesForDate(state, date) || {};

  body.innerHTML = getHabits()
    .map((habit) => dayEditorRow(habit, entries[habit.id] || defaultEntry(habit)))
    .join("");

  body.querySelectorAll(".modal-row").forEach((row) => {
    const habitId = row.dataset.habit;
    const habit = getHabits().find((h) => h.id === habitId);

    const toggle = row.querySelector('[data-action="toggle"]');
    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = getEntriesForDate(getState(), date) || {};
        const done = isCompleted(habit, current[habitId]);
        setEntryForDate(date, habitId, { done: !done });
        refreshApp();
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
        refreshApp();
        openDayEditor(date);
      });
      plus.addEventListener("click", () => {
        const current = getEntriesForDate(getState(), date) || {};
        const count = (current[habitId] && current[habitId].count) || 0;
        setEntryForDate(date, habitId, { count: count + 1 });
        refreshApp();
        openDayEditor(date);
      });
    }

    const note = row.querySelector('[data-action="note"]');
    let debounceTimer;
    note.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value;
      debounceTimer = setTimeout(() => {
        setEntryForDate(date, habitId, { note: value });
        refreshApp();
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
