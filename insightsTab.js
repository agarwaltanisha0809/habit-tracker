// Insights tab: deliberately different from the Sleep tab's ring-and-bento
// language — an editorial headline stat, a single-hue month heatmap, and
// slim horizontal stat pills instead of another boxy grid.
let insightsMonthOffset = 0;

function monthBounds(offset) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const label = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  return { year, month, daysInMonth, firstWeekday, label, dates };
}

function dayFraction(state, date) {
  if (date > state.date) return null; // future day, no data
  const tasks = getTasksForDate(date);
  if (!tasks.length) return null;
  const entries = getEntriesForDate(state, date) || {};
  const done = tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
  return done / tasks.length;
}

function heatColor(fraction) {
  if (fraction == null) return "transparent";
  if (fraction <= 0) return "#2a2822";
  if (fraction <= 0.34) return "#4a1b0c";
  if (fraction <= 0.67) return "#712b13";
  if (fraction < 1) return "#d85a30";
  return "#f0997b";
}

function monthlyCompletionRate(state, offset) {
  const { dates } = monthBounds(offset);
  let done = 0;
  let scheduled = 0;
  dates.forEach((date) => {
    if (date > state.date) return;
    const tasks = getTasksForDate(date);
    const entries = getEntriesForDate(state, date) || {};
    scheduled += tasks.length;
    done += tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
  });
  return scheduled ? Math.round((done / scheduled) * 100) : 0;
}

function renderInsightsTab() {
  const state = getState();
  document.getElementById("insightsScribble").innerHTML = scribbleSvg(80);

  const { label, dates, firstWeekday } = monthBounds(insightsMonthOffset);
  document.getElementById("insightsMonthLabel").textContent = label;

  const thisRate = monthlyCompletionRate(state, insightsMonthOffset);
  const prevRate = monthlyCompletionRate(state, insightsMonthOffset - 1);
  const trendWord = thisRate >= prevRate ? "up from" : "down from";
  document.getElementById("insightsEditorial").innerHTML = `You completed <span class="big-num">${thisRate}%</span> of your habits this month, ${trendWord} ${prevRate}% before`;

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const heatmapEl = document.getElementById("insightsHeatmap");
  let html = `<div class="heatmap-weekday-row">${weekdayLabels.map((l) => `<span class="heatmap-weekday-label">${l}</span>`).join("")}</div>`;
  let row = [];
  for (let i = 0; i < firstWeekday; i++) row.push(`<div class="heatmap-cell empty"></div>`);
  dates.forEach((date) => {
    const fraction = dayFraction(state, date);
    row.push(`<button type="button" class="heatmap-cell" data-date="${date}" style="background:${heatColor(fraction)};" title="${date}"></button>`);
    if (row.length === 7) {
      html += `<div class="heatmap-row">${row.join("")}</div>`;
      row = [];
    }
  });
  if (row.length) html += `<div class="heatmap-row">${row.join("")}</div>`;
  heatmapEl.innerHTML = html;
  heatmapEl.querySelectorAll(".heatmap-cell:not(.empty)").forEach((cell) => {
    cell.addEventListener("click", () => {
      if (typeof openDayEditor === "function") openDayEditor(cell.dataset.date);
    });
  });

  const daysMap = getAllDaysMap(state);
  const bestStreak = ALL_HABITS.reduce((max, h) => Math.max(max, computeCurrentStreak(h, daysMap, state.date)), 0);
  let perfectDays = 0;
  let totalCheckIns = 0;
  let daysWithTasks = 0;
  dates.forEach((date) => {
    if (date > state.date) return;
    const fraction = dayFraction(state, date);
    const tasks = getTasksForDate(date);
    const entries = getEntriesForDate(state, date) || {};
    const done = tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
    totalCheckIns += done;
    if (tasks.length) daysWithTasks++;
    if (fraction === 1) perfectDays++;
  });
  const dailyAvg = daysWithTasks ? (totalCheckIns / daysWithTasks).toFixed(1) : "0";

  document.getElementById("insightsPills").innerHTML = `
    <div class="insights-pill-row">
      <div class="insights-pill" style="--tone-bg:#412402; --tone-text:#fac775;">🔥 ${bestStreak} day streak</div>
      <div class="insights-pill" style="--tone-bg:#04342c; --tone-text:#9fe1cb;">🏅 ${perfectDays} perfect days</div>
      <div class="insights-pill" style="--tone-bg:#042c53; --tone-text:#b5d4f4;">📊 ${dailyAvg} avg per day</div>
    </div>
    <div class="insights-pill-row">
      <div class="insights-pill" style="--tone-bg:#4b1528; --tone-text:#f4c0d1;">✅ ${totalCheckIns} check-ins</div>
    </div>
  `;
}

function initInsightsNav() {
  document.getElementById("insightsMonthPrev").addEventListener("click", () => {
    insightsMonthOffset--;
    renderInsightsTab();
  });
  document.getElementById("insightsMonthNext").addEventListener("click", () => {
    insightsMonthOffset = Math.min(0, insightsMonthOffset + 1);
    renderInsightsTab();
  });
}
