// Heatmap, per-habit stats, and weekly summary — derived read-only views over storage data.
// Heatmap cells and weekly-day headers are clickable and open the day editor (dayEditor.js).
const HEATMAP_DAYS = 30;
const WEEKLY_DAYS = 7;
const CONSISTENCY_DAYS = 30;

function heatLevel(completedCount, totalHabits) {
  if (completedCount <= 0) return 0;
  const fraction = completedCount / totalHabits;
  if (fraction <= 0.2) return 1;
  if (fraction <= 0.4) return 2;
  if (fraction <= 0.6) return 3;
  if (fraction <= 0.8) return 4;
  return 5;
}

function renderHeatmap(state) {
  const el = document.getElementById("heatmapGrid");
  if (!el) return;
  const habits = getHabits();
  const days = getLastNDays(state, HEATMAP_DAYS);
  el.innerHTML = days
    .map(({ date, entries }) => {
      const count = completedCountForEntries(entries);
      const level = entries ? heatLevel(count, habits.length) : -1;
      const label = entries ? `${date}: ${count}/${habits.length} habits` : `${date}: no data`;
      return `<button type="button" class="heat-cell" data-level="${level}" data-date="${date}" title="${label}"></button>`;
    })
    .join("");

  el.querySelectorAll(".heat-cell").forEach((cell) => {
    cell.addEventListener("click", () => openDayEditor(cell.dataset.date));
  });
}

function renderStats(state) {
  const el = document.getElementById("statsGrid");
  if (!el) return;
  const habits = getHabits();
  const daysMap = getAllDaysMap(state);
  const last30 = getLastNDays(state, CONSISTENCY_DAYS);

  el.innerHTML = habits
    .map((habit) => {
      const current = computeCurrentStreak(habit, daysMap, state.date);
      const longest = computeLongestStreak(habit, daysMap);
      const completedDays = last30.filter(
        ({ entries }) => entries && isCompleted(habit, entries[habit.id])
      ).length;
      const consistency = Math.round((completedDays / CONSISTENCY_DAYS) * 100);
      return `
      <div class="stat-card" style="--habit-color: ${habit.color || "var(--accent-strong)"}">
        <div class="stat-title">${habit.emoji} ${habit.label}</div>
        <div class="stat-row">
          <div class="stat-item">
            <div class="stat-value">${current}</div>
            <div class="stat-label">current streak</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${longest}</div>
            <div class="stat-label">longest streak</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${consistency}%</div>
            <div class="stat-label">last 30 days</div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderWeekly(state) {
  const el = document.getElementById("weeklyTable");
  if (!el) return;
  const habits = getHabits();
  const days = getLastNDays(state, WEEKLY_DAYS);
  const dayHeaders = days
    .map(
      ({ date }) =>
        `<th class="weekly-day" data-date="${date}">${new Date(date + "T00:00:00").toLocaleDateString(
          undefined,
          { weekday: "short" }
        )}</th>`
    )
    .join("");

  const rows = habits
    .map((habit) => {
      const cells = days
        .map(({ entries }) => {
          if (!entries) return `<td class="weekly-cell">·</td>`;
          if (habit.type === "counter") {
            const count = entries[habit.id].count || 0;
            const cls = isCompleted(habit, entries[habit.id]) ? "hit" : count > 0 ? "partial" : "";
            return `<td class="weekly-cell ${cls}">${count}</td>`;
          }
          const done = isCompleted(habit, entries[habit.id]);
          return `<td class="weekly-cell ${done ? "hit" : ""}">${done ? "✓" : "—"}</td>`;
        })
        .join("");
      return `<tr><th class="weekly-habit">${habit.emoji} ${habit.label}</th>${cells}</tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="weekly">
      <thead><tr><th></th>${dayHeaders}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="weekly-hint">Tap a day to edit it</div>
  `;

  el.querySelectorAll(".weekly-day").forEach((th) => {
    th.addEventListener("click", () => openDayEditor(th.dataset.date));
  });
}

function renderInsights(state) {
  renderHeatmap(state);
  renderStats(state);
  renderWeekly(state);
}
