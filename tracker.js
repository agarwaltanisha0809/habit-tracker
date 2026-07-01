// Habit Tracker tab: weekly / monthly / yearly grids, one bento card per
// eligible habit (see storage.js:isTrackerEligible for the auto-include rule).
let trackerViewMode = "weekly";
let trackerMonthOffset = 0;

function eligibleHabits(state) {
  const daysMap = getAllDaysMap(state);
  return ALL_HABITS.filter((h) => isTrackerEligible(h, daysMap, state.date));
}

function excludedHabitsCount(state) {
  const daysMap = getAllDaysMap(state);
  return ALL_HABITS.filter((h) => !isTrackerEligible(h, daysMap, state.date)).length;
}

function weekRangeLabel(monday) {
  const start = new Date(monday + "T00:00:00");
  const end = new Date(addDays(monday, 6) + "T00:00:00");
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} to ${fmt(end)}`;
}

function renderTrackerWeekly(state, container) {
  const daysMap = getAllDaysMap(state);
  const monday = startOfWeek(state.date);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const habits = eligibleHabits(state);

  let totalDone = 0;
  let totalScheduled = 0;
  const perDayDone = weekDates.map(() => 0);
  const perDayScheduled = weekDates.map(() => 0);
  let bestStreak = 0;

  const cardsHtml = habits
    .map((habit) => {
      const t = themeFor(habit);
      let scheduledCount = 0;
      let doneCount = 0;
      const cellsHtml = weekDates
        .map((date, i) => {
          const scheduled = isScheduledForDate(habit, date);
          const entries = getEntriesForDate(state, date);
          const done = scheduled && isCompleted(habit, entries && entries[habit.id]);
          if (scheduled) {
            scheduledCount++;
            perDayScheduled[i]++;
            if (done) {
              doneCount++;
              perDayDone[i]++;
            }
          }
          const cls = !scheduled ? "na" : done ? "done" : "outline";
          return `<div class="tracker-day-cell ${cls}"></div>`;
        })
        .join("");

      totalDone += doneCount;
      totalScheduled += scheduledCount;
      const streak = computeCurrentStreak(habit, daysMap, state.date);
      bestStreak = Math.max(bestStreak, streak);
      const pct = scheduledCount ? Math.round((doneCount / scheduledCount) * 100) : 0;
      const isPerfect = scheduledCount > 0 && doneCount === scheduledCount;

      return `
        <div class="tracker-card" style="--tone-bg:${t.bg}; --tone-text:${t.text}; --tone-muted:${t.muted}; --tone-accent:${t.accent}; --tone-badge-bg:${t.badgeBg};">
          <div class="tracker-card-header">
            <div class="tracker-habit-name">${habit.emoji} ${habit.label}</div>
            ${
              isPerfect
                ? `<div class="tracker-perfect-badge">🏅 Perfect</div>`
                : `<div class="tracker-stats">${pct}%</div>`
            }
          </div>
          <div class="tracker-day-grid">${cellsHtml}</div>
        </div>
      `;
    })
    .join("");

  const metPct = totalScheduled ? Math.round((totalDone / totalScheduled) * 100) : 0;
  let bestDayIdx = 0;
  perDayDone.forEach((d, i) => {
    if (d > perDayDone[bestDayIdx]) bestDayIdx = i;
  });
  const bestDayLabel = perDayScheduled[bestDayIdx]
    ? new Date(weekDates[bestDayIdx] + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })
    : "—";

  container.innerHTML = `
    <div style="text-align:center; font-size:10px; color:var(--muted-2); margin-bottom:10px;">${weekRangeLabel(monday)}</div>
    ${habits.length ? cardsHtml : `<div class="app-footer">No habits qualify yet. Habits show up here once you've done them a few times.</div>`}
    ${
      habits.length
        ? `
      <div class="tracker-stats-footer">
        <div class="tracker-stat"><span class="tracker-stat-value" style="color:#e24b4a;">${metPct}%</span><span class="tracker-stat-label">Met</span></div>
        <div class="tracker-stat"><span class="tracker-stat-value" style="color:#378add;">${bestDayLabel}</span><span class="tracker-stat-label">Best day</span></div>
        <div class="tracker-stat"><span class="tracker-stat-value" style="color:#639922;">${totalDone}</span><span class="tracker-stat-label">Total done</span></div>
        <div class="tracker-stat"><span class="tracker-stat-value" style="color:#ef9f27;">${bestStreak}</span><span class="tracker-stat-label">Best streak</span></div>
      </div>`
        : ""
    }
  `;
}

function renderTrackerMonthly(state, container) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + trackerMonthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-start offset
  const monthLabel = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const habits = eligibleHabits(state);
  const cardsHtml = habits
    .map((habit) => {
      const t = themeFor(habit);
      let scheduledCount = 0;
      let doneCount = 0;
      const cells = [];
      for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="tracker-month-cell empty"></div>`);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const scheduled = isScheduledForDate(habit, date);
        const entries = getEntriesForDate(state, date);
        const done = scheduled && isCompleted(habit, entries && entries[habit.id]);
        if (scheduled) {
          scheduledCount++;
          if (done) doneCount++;
        }
        cells.push(`<div class="tracker-month-cell ${scheduled ? (done ? "done" : "") : "empty"}"></div>`);
      }
      const pct = scheduledCount ? Math.round((doneCount / scheduledCount) * 100) : 0;
      return `
        <div class="tracker-card" style="--tone-bg:${t.bg}; --tone-text:${t.text}; --tone-muted:${t.muted}; --tone-accent:${t.accent}; --tone-badge-bg:${t.badgeBg};">
          <div class="tracker-card-header">
            <div class="tracker-habit-name">${habit.emoji} ${habit.label}</div>
            <div class="tracker-stats">${pct}% · ${doneCount}d</div>
          </div>
          <div class="tracker-month-grid">${cells.join("")}</div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="month-nav">
      <button type="button" class="month-nav-btn" id="trackerMonthPrev">‹</button>
      <span class="month-nav-label">${monthLabel}</span>
      <button type="button" class="month-nav-btn" id="trackerMonthNext">›</button>
    </div>
    ${habits.length ? cardsHtml : `<div class="app-footer">No habits qualify yet.</div>`}
  `;
  document.getElementById("trackerMonthPrev").addEventListener("click", () => {
    trackerMonthOffset--;
    renderTrackerTab();
  });
  document.getElementById("trackerMonthNext").addEventListener("click", () => {
    trackerMonthOffset++;
    renderTrackerTab();
  });
}

function renderTrackerYearly(state, container) {
  const year = new Date().getFullYear();
  const habits = eligibleHabits(state);
  const cardsHtml = habits
    .map((habit) => {
      const t = themeFor(habit);
      let doneCount = 0;
      let scheduledCount = 0;
      const cells = [];
      let cursor = `${year}-01-01`;
      const end = `${year}-12-31`;
      while (cursor <= end && cursor <= state.date) {
        const scheduled = isScheduledForDate(habit, cursor);
        const entries = getEntriesForDate(state, cursor);
        const done = scheduled && isCompleted(habit, entries && entries[habit.id]);
        if (scheduled) {
          scheduledCount++;
          if (done) doneCount++;
        }
        cells.push(`<div class="tracker-year-cell ${done ? "done" : ""}"></div>`);
        cursor = addDays(cursor, 1);
      }
      const pct = scheduledCount ? Math.round((doneCount / scheduledCount) * 100) : 0;
      return `
        <div class="tracker-card" style="--tone-bg:${t.bg}; --tone-text:${t.text}; --tone-muted:${t.muted}; --tone-accent:${t.accent}; --tone-badge-bg:${t.badgeBg};">
          <div class="tracker-card-header">
            <div class="tracker-habit-name">${habit.emoji} ${habit.label}</div>
            <div class="tracker-stats">${pct}% · ${doneCount}d</div>
          </div>
          <div class="tracker-year-grid">${cells.join("")}</div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div style="text-align:center; font-size:10px; color:var(--muted-2); margin-bottom:10px;">${year}</div>
    ${habits.length ? cardsHtml : `<div class="app-footer">No habits qualify yet.</div>`}
  `;
}

function renderTrackerTab() {
  const state = getState();
  document.getElementById("trackerScribble").innerHTML = scribbleSvg(110);

  const switcher = document.getElementById("trackerSwitcher");
  switcher.innerHTML = ["weekly", "monthly", "yearly"]
    .map((mode) => `<button type="button" class="pill-switch-btn${mode === trackerViewMode ? " active" : ""}" data-mode="${mode}">${mode[0].toUpperCase() + mode.slice(1)}</button>`)
    .join("");
  switcher.querySelectorAll(".pill-switch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      trackerViewMode = btn.dataset.mode;
      renderTrackerTab();
    });
  });

  const container = document.getElementById("trackerContent");
  if (trackerViewMode === "weekly") renderTrackerWeekly(state, container);
  else if (trackerViewMode === "monthly") renderTrackerMonthly(state, container);
  else renderTrackerYearly(state, container);

  const footnote = document.getElementById("trackerFootnote");
  const excluded = excludedHabitsCount(state);
  footnote.textContent = excluded > 0 ? `${excluded} occasional task${excluded === 1 ? "" : "s"} stay off this view` : "";
}
