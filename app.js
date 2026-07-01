// Core rendering: opening screen, the Today (calendar) screen, tab
// switching, confetti triggers, and the midnight rollover timer.

let selectedDate = null; // the date currently shown on the Today screen
let lastRenderedCount = -1;
let userHasInteracted = false; // confetti should only fire from a real toggle, never on load
let currentTab = "today";

// --- Opening screen ---

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function getUserName() {
  return localStorage.getItem("habitTracker.userName") || "";
}

function renderOpeningScreen() {
  const state = getState();
  const name = getUserName();
  const greeting = greetingForNow() + (name ? `, ${name}` : "");

  const daysMap = getAllDaysMap(state);
  const bestStreak = ALL_HABITS.filter((h) => h.type !== "sleep").reduce(
    (max, h) => Math.max(max, computeCurrentStreak(h, daysMap, state.date)),
    0
  );

  document.getElementById("openingGreeting").textContent = greeting;
  document.getElementById("openingScribble").innerHTML = scribbleSvg(150);
  document.getElementById("openingRing").innerHTML = ringSvg(96, 6, 0.68, "#3c3489", "#afa9ec");

  const chipsEl = document.getElementById("openingChips");
  if (bestStreak > 0) {
    chipsEl.innerHTML = `<span class="opening-chip" style="background:#04342c; color:#9fe1cb;">${bestStreak} day streak</span>`;
  } else {
    chipsEl.innerHTML = `<span class="opening-chip" style="background:#141310; color:#8c8579;">Let's begin</span>`;
  }
}

function initOpeningScreen() {
  renderOpeningScreen();
  const opening = document.getElementById("openingScreen");
  const main = document.getElementById("mainApp");
  function proceed() {
    opening.hidden = true;
    main.hidden = false;
    document.getElementById("bottomNav").hidden = false;
  }
  document.getElementById("openingContinue").addEventListener("click", proceed);
  setTimeout(proceed, 1600);
}

// --- Today / calendar screen ---

function startOfWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function renderWeekStrip() {
  const el = document.getElementById("weekStrip");
  if (!el) return;
  const state = getState();
  const monday = startOfWeek(selectedDate);
  const labels = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const isToday = date === state.date;
    const isSelected = date === selectedDate;
    const num = new Date(date + "T00:00:00").getDate();
    const letter = weekdayLetter(date);
    labels.push(`
      <button type="button" class="week-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}" data-date="${date}">
        <span class="week-day-label">${letter}</span>
        <span class="week-day-num-wrap">
          ${isSelected ? wobbleCircleSvg(32, "var(--accent)") : ""}
          <span class="week-day-num">${num}</span>
        </span>
      </button>
    `);
  }
  el.innerHTML = labels.join("");
  el.querySelectorAll(".week-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDate = btn.dataset.date;
      renderToday();
    });
  });
}

function noteField(habit, entry, date) {
  return `
    <input
      type="text"
      class="task-note-input"
      data-habit="${habit.id}"
      placeholder="Add a note (optional)"
      value="${(entry.note || "").replace(/"/g, "&quot;")}"
      maxlength="140"
    />
  `;
}

function bindNoteInput(card, habit, date) {
  const input = card.querySelector(".task-note-input");
  let debounceTimer;
  input.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const value = e.target.value;
    debounceTimer = setTimeout(() => {
      setEntryForDate(date, habit.id, { note: value });
    }, 400);
  });
}

function applyTone(el, habit) {
  const t = themeFor(habit);
  el.style.setProperty("--tone-bg", t.bg);
  el.style.setProperty("--tone-text", t.text);
  el.style.setProperty("--tone-muted", t.muted);
  el.style.setProperty("--tone-accent", t.accent);
  el.style.setProperty("--tone-badge-bg", t.badgeBg);
}

function renderCheckCard(habit, entry, date) {
  const done = isCompleted(habit, entry);
  const card = document.createElement("div");
  card.className = `bento-card task-card${habit.schedule.kind === "once" ? " once" : ""}`;
  applyTone(card, habit);
  card.innerHTML = `
    <button class="task-checkbox${done ? " done" : ""}" aria-label="Toggle ${habit.label}" data-habit="${habit.id}">
      ${done ? "✓" : ""}
    </button>
    <div class="task-info">
      <div class="task-title${done ? " done" : ""}">${habit.emoji} ${habit.label}</div>
      <div class="task-sub">${scheduleLabel(habit.schedule)}</div>
      ${noteField(habit, entry, date)}
    </div>
  `;
  card.querySelector(".task-checkbox").addEventListener("click", (e) => {
    userHasInteracted = true;
    setEntryForDate(date, habit.id, { done: !done });
    burstAnimation(e.currentTarget, !done);
    renderToday();
  });
  bindNoteInput(card, habit, date);
  return card;
}

function renderCounterCard(habit, entry, date) {
  const count = entry.count || 0;
  const done = isCompleted(habit, entry);
  const litres = habit.unitMl ? ((count * habit.unitMl) / 1000).toFixed(2) : null;
  const goalLitres = habit.unitMl ? ((habit.target * habit.unitMl) / 1000).toFixed(1) : null;
  const t = themeFor(habit);
  const fraction = habit.target ? count / habit.target : 0;

  const card = document.createElement("div");
  card.className = "bento-card task-card counter-card";
  applyTone(card, habit);

  const isWater = !!habit.unitMl;
  card.innerHTML = `
    <div class="counter-row">
      ${isWater ? glassSvg(fraction, 24, 30, t.accent, t.accent) : `<div class="task-icon-badge">${habit.emoji}</div>`}
      <div class="task-info">
        <div class="task-title">${habit.emoji === "" ? "" : isWater ? habit.emoji + " " : ""}${habit.label}</div>
        <div class="task-sub">${isWater ? `${litres}L of ${goalLitres}L` : `${count} of ${habit.target}`}${done ? " · goal hit" : ""}</div>
      </div>
      <div class="counter-controls">
        <button class="counter-btn minus" data-habit="${habit.id}" aria-label="Decrease">−</button>
        <span class="counter-value">${count}</span>
        <button class="counter-btn plus" data-habit="${habit.id}" aria-label="Increase">+</button>
      </div>
    </div>
    ${noteField(habit, entry, date)}
  `;
  card.querySelector(".plus").addEventListener("click", (e) => {
    userHasInteracted = true;
    setEntryForDate(date, habit.id, { count: count + 1 });
    burstAnimation(e.currentTarget, true);
    renderToday();
  });
  card.querySelector(".minus").addEventListener("click", () => {
    setEntryForDate(date, habit.id, { count: Math.max(0, count - 1) });
    renderToday();
  });
  bindNoteInput(card, habit, date);
  return card;
}

function burstAnimation(el, justCompleted) {
  if (!justCompleted) return;
  el.classList.remove("burst");
  requestAnimationFrame(() => {
    el.classList.add("burst");
  });
}

function updateMiniRing(date, tasks, entries) {
  const el = document.getElementById("miniRing");
  if (!el) return;
  const completed = tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
  const fraction = tasks.length ? completed / tasks.length : 0;
  el.querySelector(".mini-ring-svg").innerHTML = ringSvg(34, 4, fraction, "var(--ring-bg)", "var(--accent)");
  el.querySelector(".mini-ring-label").textContent = `${completed}/${tasks.length}`;
}

function renderToday() {
  const state = getState();
  const dateLabel = document.getElementById("todayLabel");
  const opts = { weekday: "long", month: "long", day: "numeric" };
  const isToday = selectedDate === state.date;
  dateLabel.textContent =
    new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, opts) + (isToday ? "" : "");
  document.getElementById("todayScribble").innerHTML = scribbleSvg(120);

  renderWeekStrip();

  const tasks = getTasksForDate(selectedDate).filter((h) => h.type !== "sleep");
  const entries = getEntriesForDate(state, selectedDate) || {};
  tasks.forEach((h) => {
    if (!(h.id in entries)) entries[h.id] = defaultEntry(h);
  });

  updateMiniRing(selectedDate, tasks, entries);

  const listEl = document.getElementById("taskList");
  listEl.innerHTML = "";
  if (!tasks.length) {
    listEl.innerHTML = `<div class="app-footer" style="margin-top:24px;">Nothing scheduled for this day yet. Tap + to add a habit or task.</div>`;
  } else {
    tasks.forEach((habit) => {
      const entry = entries[habit.id];
      const card = habit.type === "counter" ? renderCounterCard(habit, entry, selectedDate) : renderCheckCard(habit, entry, selectedDate);
      listEl.appendChild(card);
    });
  }

  if (isToday) {
    const completedCount = tasks.reduce((acc, h) => acc + (isCompleted(h, entries[h.id]) ? 1 : 0), 0);
    if (userHasInteracted && tasks.length > 0 && completedCount === tasks.length && lastRenderedCount < tasks.length) {
      launchConfetti();
    }
    lastRenderedCount = completedCount;
  }
}

// --- Tab switching ---

function showTab(tab) {
  currentTab = tab;
  ["today", "tracker", "sleep", "insights"].forEach((t) => {
    const section = document.getElementById("view-" + t);
    if (section) section.hidden = t !== tab;
    const navBtn = document.querySelector(`.bottom-nav-btn[data-tab="${t}"]`);
    if (navBtn) navBtn.classList.toggle("active", t === tab);
  });
  if (tab === "today") renderToday();
  if (tab === "tracker" && typeof renderTrackerTab === "function") renderTrackerTab();
  if (tab === "sleep" && typeof renderSleepTab === "function") renderSleepTab();
  if (tab === "insights" && typeof renderInsightsTab === "function") renderInsightsTab();
}

function initBottomNav() {
  document.querySelectorAll(".bottom-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

function initAddTaskButton() {
  document.getElementById("addTaskBtn").addEventListener("click", () => openAddTaskModal());
}

// Called by dayEditor.js / addTask.js / settings.js after they mutate state.
function refreshApp() {
  showTab(currentTab);
}

function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 5, 0);
  const msUntilMidnight = nextMidnight - now;
  setTimeout(() => {
    lastRenderedCount = -1;
    userHasInteracted = false;
    selectedDate = getState().date;
    refreshApp();
    scheduleMidnightReset();
  }, msUntilMidnight);
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

// --- Init ---

initTheme();
const initialState = getState();
selectedDate = initialState.date;
initOpeningScreen();
initBottomNav();
initAddTaskButton();
initDayEditor();
initAddTask();
initSettingsPanel();
initInsightsNav();
initServiceWorker();
showTab("today");
scheduleMidnightReset();
