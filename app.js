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

function applyTone(el, habit) {
  // One-off tasks (schedule.kind === "once") always get the same bright
  // task theme regardless of the habit's rotated color, so the eye can tell
  // "temporary, needs clearing" apart from a recurring habit's own identity
  // color at a glance — see TASK_THEME in habits.js.
  const t = habit.schedule && habit.schedule.kind === "once" ? themeForTask() : themeFor(habit);
  el.style.setProperty("--tone-bg", t.bg);
  el.style.setProperty("--tone-text", t.text);
  el.style.setProperty("--tone-muted", t.muted);
  el.style.setProperty("--tone-accent", t.accent);
  el.style.setProperty("--tone-badge-bg", t.badgeBg);
  // Tasks carry a second accent (peach) just for the checkbox, for a bit of
  // two-tone interest — habits don't set this, so their checkbox falls back
  // to the single --tone-accent as before.
  if (t.accent2) el.style.setProperty("--tone-accent-2", t.accent2);
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
      ${habit.schedule.kind === "once" ? "" : `<div class="task-sub">${scheduleLabel(habit.schedule)}</div>`}
    </div>
  `;
  card.querySelector(".task-checkbox").addEventListener("click", (e) => {
    userHasInteracted = true;
    setEntryForDate(date, habit.id, { done: !done });
    burstAnimation(e.currentTarget, !done);
    renderToday();
  });
  return wrapWithSwipeToDelete(card, habit, date);
}

// Compact chip for a recurring, check-type habit (counters keep the full
// card below since they need +/- controls). Tap toggles done instantly;
// a long-press (500ms, cancelled by any real movement so it doesn't fire
// mid-scroll) opens the edit modal — deletion still lives in Settings, so
// this doesn't need its own swipe gesture.
const HABIT_CHIP_LONG_PRESS_MS = 500;
const HABIT_CHIP_MOVE_CANCEL_PX = 8;

function renderHabitChip(habit, entry, date) {
  const done = isCompleted(habit, entry);
  const t = themeFor(habit);
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `habit-chip-pill${done ? " done" : ""}`;
  chip.setAttribute("aria-label", habit.label);
  chip.style.setProperty("--tone-bg", t.bg);
  chip.style.setProperty("--tone-accent", t.accent);
  chip.innerHTML = `<span class="habit-chip-pill-icon">${habit.emoji}</span><span class="habit-chip-pill-label">${habit.label}</span>`;

  let pressTimer = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  chip.addEventListener("pointerdown", (e) => {
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    clearPressTimer();
    pressTimer = setTimeout(() => {
      longPressed = true;
      openEditTaskModal(habit);
    }, HABIT_CHIP_LONG_PRESS_MS);
  });
  chip.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - startX) > HABIT_CHIP_MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > HABIT_CHIP_MOVE_CANCEL_PX) {
      clearPressTimer();
    }
  });
  chip.addEventListener("pointerup", () => {
    clearPressTimer();
    if (longPressed) return;
    userHasInteracted = true;
    setEntryForDate(date, habit.id, { done: !done });
    burstAnimation(chip, !done);
    renderToday();
  });
  chip.addEventListener("pointercancel", clearPressTimer);
  chip.addEventListener("pointerleave", clearPressTimer);

  return chip;
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
  return wrapWithSwipeToDelete(card, habit, date);
}

// --- Swipe actions (edit + delete), with Google-Calendar-style recurrence scope ---
// Direction is locked on the first few pixels of movement: a mostly-vertical
// drag is left alone entirely (so page scroll is never hijacked), only a
// clearly horizontal drag engages the swipe. A swipe that keeps going well
// past the reveal width hands off to a day change instead (see
// triggerDayChangeAnimation) — this is what makes day-swipe work when
// started on a card too, not just the background between cards.
const SWIPE_LOCK_THRESHOLD = 6;
const SWIPE_DAY_HANDOFF_PX = 210;
let pendingDeleteHabit = null;
let pendingDeleteDate = null;
let closeOpenSwipe = null;

function wrapWithSwipeToDelete(card, habit, date) {
  const isOnceTask = habit.schedule && habit.schedule.kind === "once";
  const revealWidth = isOnceTask ? 210 : 140;
  const wrapper = document.createElement("div");
  wrapper.className = "swipe-wrapper";
  wrapper.innerHTML = `
    <div class="swipe-actions">
      <button type="button" class="swipe-action-btn edit" aria-label="Edit ${habit.label}">✏️<span>Edit</span></button>
      ${isOnceTask ? `<button type="button" class="swipe-action-btn tomorrow" aria-label="Move ${habit.label} to tomorrow">➡️<span>Tomorrow</span></button>` : ""}
      <button type="button" class="swipe-action-btn delete" aria-label="Delete ${habit.label}">🗑️<span>Delete</span></button>
    </div>
  `;
  wrapper.appendChild(card);

  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let locked = null; // null | "horizontal" | "vertical"
  let revealed = false;

  function setX(x, animated) {
    card.classList.toggle("snapping", !!animated);
    card.style.transform = x ? `translateX(${x}px)` : "";
  }

  function close(animated) {
    revealed = false;
    setX(0, animated !== false);
    if (closeOpenSwipe === close) closeOpenSwipe = null;
  }

  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input")) return;
    startX = e.clientX;
    startY = e.clientY;
    baseX = revealed ? -revealWidth : 0;
    locked = null;
  });

  card.addEventListener("pointermove", (e) => {
    if (startX === 0 && startY === 0) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < SWIPE_LOCK_THRESHOLD && Math.abs(dy) < SWIPE_LOCK_THRESHOLD) return;
      locked = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (locked === "horizontal") {
        if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe();
        card.classList.add("dragging");
        card.setPointerCapture(e.pointerId);
      }
    }
    if (locked !== "horizontal") return;
    setX(Math.max(-revealWidth, Math.min(0, baseX + dx)), false);
  });

  function endDrag(e) {
    const wasHorizontal = locked === "horizontal";
    locked = null;
    if (!wasHorizontal) return;
    card.classList.remove("dragging");
    const rawDx = e.clientX - startX;
    // A swipe that goes well past the reveal width is a day-change gesture
    // that happened to start on a card, not an attempt to open the actions.
    if (Math.abs(rawDx) > SWIPE_DAY_HANDOFF_PX) {
      setX(0, true);
      revealed = false;
      closeOpenSwipe = null;
      triggerDayChangeAnimation(rawDx < 0 ? 1 : -1);
      return;
    }
    const endX = baseX + rawDx;
    revealed = endX < -revealWidth / 2;
    setX(revealed ? -revealWidth : 0, true);
    closeOpenSwipe = revealed ? close : null;
  }
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);

  wrapper.querySelector(".swipe-action-btn.edit").addEventListener("click", () => {
    close();
    openEditTaskModal(habit);
  });
  const tomorrowBtn = wrapper.querySelector(".swipe-action-btn.tomorrow");
  if (tomorrowBtn) {
    tomorrowBtn.addEventListener("click", () => {
      close();
      carryOverTask(habit.id, addDays(date, 1));
      refreshApp();
    });
  }
  wrapper.querySelector(".swipe-action-btn.delete").addEventListener("click", () => {
    close();
    openDeleteScope(habit, date);
  });

  return wrapper;
}

function openDeleteScope(habit, date) {
  if (habit.schedule.kind === "once") {
    removeHabit(habit.id);
    refreshApp();
    return;
  }
  pendingDeleteHabit = habit;
  pendingDeleteDate = date;
  document.getElementById("deleteScopeModal").hidden = false;
}

function initDeleteScopeModal() {
  const modal = document.getElementById("deleteScopeModal");
  const close = () => {
    modal.hidden = true;
  };
  document.getElementById("deleteScopeClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "deleteScopeModal") close();
  });
  document.getElementById("deleteScopeOne").addEventListener("click", () => {
    if (pendingDeleteHabit) skipHabitOnDate(pendingDeleteHabit.id, pendingDeleteDate);
    close();
    refreshApp();
  });
  document.getElementById("deleteScopeFollowing").addEventListener("click", () => {
    if (pendingDeleteHabit) endHabitRecurrenceFrom(pendingDeleteHabit.id, pendingDeleteDate);
    close();
    refreshApp();
  });
  document.getElementById("deleteScopeAll").addEventListener("click", () => {
    if (pendingDeleteHabit) removeHabit(pendingDeleteHabit.id);
    close();
    refreshApp();
  });
}

// Generic "are you sure?" gate for any action that would destroy real data
// (e.g. re-logging sleep over an already-completed night). Call as
// confirmAction("message", () => doTheThing()).
let pendingConfirmCallback = null;

function confirmAction(message, onConfirm) {
  document.getElementById("confirmModalMessage").textContent = message;
  pendingConfirmCallback = onConfirm;
  document.getElementById("confirmModal").hidden = false;
}

function initConfirmModal() {
  const modal = document.getElementById("confirmModal");
  const close = () => {
    modal.hidden = true;
    pendingConfirmCallback = null;
  };
  document.getElementById("confirmModalClose").addEventListener("click", close);
  document.getElementById("confirmModalCancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") close();
  });
  document.getElementById("confirmModalConfirm").addEventListener("click", () => {
    const callback = pendingConfirmCallback;
    close();
    if (callback) callback();
  });
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
    listEl.innerHTML = `<div class="app-footer" style="margin-top:24px;">Nothing scheduled for this day yet. Add a task above, or tap + for a recurring habit.</div>`;
  } else {
    // Recurring habits and one-off tasks render as two visually distinct
    // groups, each sorted done-to-bottom so what's left to do stays up top.
    // Completed items stay visible (dimmed + struck through), just out of
    // the way, rather than disappearing — the point is a visible record of
    // what got cleared today, not a shrinking counter.
    const byDone = (a, b) => (isCompleted(a, entries[a.id]) ? 1 : 0) - (isCompleted(b, entries[b.id]) ? 1 : 0);
    const habitTasks = tasks.filter((h) => !h.schedule || h.schedule.kind !== "once").sort(byDone);
    const onceTasks = tasks.filter((h) => h.schedule && h.schedule.kind === "once").sort(byDone);
    // Check-type habits render as a compact chip row (tap to toggle); counter
    // habits (e.g. water) keep the full card since they need +/- controls.
    const checkHabits = habitTasks.filter((h) => h.type !== "counter");
    const counterHabits = habitTasks.filter((h) => h.type === "counter");

    if (habitTasks.length) {
      const daysMap = getAllDaysMap(state);
      const bestStreak = habitTasks.reduce((max, h) => Math.max(max, computeCurrentStreak(h, daysMap, selectedDate)), 0);
      const header = document.createElement("div");
      header.className = "task-group-label";
      header.innerHTML = `Habits${bestStreak > 0 ? ` <span class="group-stat">🔥 ${bestStreak}</span>` : ""}`;
      listEl.appendChild(header);

      if (checkHabits.length) {
        const row = document.createElement("div");
        row.className = "habit-chip-row";
        checkHabits.forEach((habit) => row.appendChild(renderHabitChip(habit, entries[habit.id], selectedDate)));
        listEl.appendChild(row);
      }
      counterHabits.forEach((habit) => listEl.appendChild(renderCounterCard(habit, entries[habit.id], selectedDate)));
    }

    if (onceTasks.length) {
      const leftCount = onceTasks.filter((h) => !isCompleted(h, entries[h.id])).length;
      const header = document.createElement("div");
      header.className = "task-group-label";
      header.innerHTML = `Tasks <span class="group-stat">${leftCount} left</span>`;
      listEl.appendChild(header);
      onceTasks.forEach((habit) => {
        const card = habit.type === "counter" ? renderCounterCard(habit, entries[habit.id], selectedDate) : renderCheckCard(habit, entries[habit.id], selectedDate);
        listEl.appendChild(card);
      });
    }
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

function initWeekNav() {
  document.getElementById("weekPrev").addEventListener("click", () => {
    selectedDate = addDays(selectedDate, -7);
    renderToday();
  });
  document.getElementById("weekNext").addEventListener("click", () => {
    selectedDate = addDays(selectedDate, 7);
    renderToday();
  });
  document.getElementById("taskList").addEventListener("pointerdown", (e) => {
    if (closeOpenSwipe && !e.target.closest(".swipe-actions")) closeOpenSwipe();
  });
}

function changeDayBy(delta) {
  selectedDate = addDays(selectedDate, delta);
  renderToday();
}

// Shared "page slide" animation for a day change, whether it was triggered
// by a background swipe or a big swipe that started on a card (see the
// hand-off in wrapWithSwipeToDelete). delta > 0 (moving to a later day)
// exits/enters like content sliding leftward, matching swipe-left-to-
// advance the way Apple Calendar's day view feels.
function triggerDayChangeAnimation(delta) {
  const el = document.getElementById("view-today");
  const exitPx = delta > 0 ? -18 : 18;
  el.style.transition = "transform 0.14s ease, opacity 0.14s ease";
  el.style.transform = `translateX(${exitPx}px)`;
  el.style.opacity = "0";
  setTimeout(() => {
    changeDayBy(delta);
    el.style.transition = "none";
    el.style.transform = `translateX(${-exitPx}px)`;
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.18s ease, opacity 0.18s ease";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    });
  }, 140);
}

// Swipe left/right anywhere on the Today screen to move a day, like Apple
// Calendar's day view — not just tapping an exact date in the week strip.
// Works starting on the background, the habit chip row, or a card (a card's
// own short edit/delete swipe still wins for a normal-length drag; only a
// swipe well past that reveal width hands off to a day change, handled in
// wrapWithSwipeToDelete's endDrag) — buttons/inputs are left alone so taps
// on them are never mistaken for the start of a swipe.
const DAY_SWIPE_MIN_PX = 60;
const DAY_SWIPE_LOCK_THRESHOLD = 10;
const DAY_SWIPE_FOLLOW_MAX_PX = 36;

function initDaySwipe() {
  // Bound to the scroll container, not #view-today itself — a day with few
  // or no items leaves #view-today shorter than the screen, so a listener
  // on just that section misses touches in the empty space below the
  // content. The scroll container always fills the available height.
  const hitArea = document.getElementById("scrollArea");
  const el = document.getElementById("view-today");
  if (!hitArea || !el) return;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let locked = null; // null | "horizontal" | "vertical"

  hitArea.addEventListener("pointerdown", (e) => {
    if (currentTab !== "today") return;
    if (e.target.closest(".swipe-wrapper, button, input")) return;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    locked = null;
    el.style.transition = "none";
  });

  hitArea.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < DAY_SWIPE_LOCK_THRESHOLD && Math.abs(dy) < DAY_SWIPE_LOCK_THRESHOLD) return;
      locked = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (locked !== "horizontal") return;
    // A light rubber-band follow so the drag feels connected to your finger
    // instead of the day only ever jumping on release.
    const follow = Math.max(-DAY_SWIPE_FOLLOW_MAX_PX, Math.min(DAY_SWIPE_FOLLOW_MAX_PX, dx * 0.3));
    el.style.transform = `translateX(${follow}px)`;
  });

  function end(e) {
    if (!dragging) return;
    dragging = false;
    if (locked !== "horizontal") {
      el.style.transform = "";
      return;
    }
    const dx = e.clientX - startX;
    if (Math.abs(dx) < DAY_SWIPE_MIN_PX) {
      el.style.transition = "transform 0.18s ease";
      el.style.transform = "translateX(0)";
      return;
    }
    triggerDayChangeAnimation(dx < 0 ? 1 : -1);
  }
  hitArea.addEventListener("pointerup", end);
  hitArea.addEventListener("pointercancel", () => {
    dragging = false;
    el.style.transform = "";
  });
}

function initBottomNav() {
  document.querySelectorAll(".bottom-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

function initAddTaskButton() {
  document.getElementById("addTaskBtn").addEventListener("click", () => openAddTaskModal());
}

// Quick-add compose bar: a single always-visible field for one-off tasks,
// no modal. Enter adds the typed line as a task for the currently viewed
// day and clears the field, ready for the next one — type-Enter-type-Enter
// for a quick brain dump, or a single line for a single passing thought.
// Pasting a multi-line block splits it into one task per line automatically.
function addQuickTask(label) {
  const trimmed = label.trim();
  if (!trimmed) return;
  addHabit({
    label: trimmed,
    emoji: guessEmojiForLabel(trimmed),
    type: "check",
    schedule: { kind: "once", date: selectedDate },
  });
}

function initQuickAdd() {
  const input = document.getElementById("quickAddInput");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const lines = input.value.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach(addQuickTask);
    input.value = "";
    if (lines.length) {
      userHasInteracted = true;
      renderToday();
    }
  });

  // A paste of several lines (e.g. from Notes) adds them all at once,
  // covering the "brain dump" case without a separate mode to switch into.
  input.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || !text.includes("\n")) return; // single line: let it land in the field normally
    e.preventDefault();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach(addQuickTask);
    input.value = "";
    if (lines.length) {
      userHasInteracted = true;
      renderToday();
    }
  });
}

// --- Carry-over: undone one-off tasks from a past date, surfaced once per
// real day so bringing them into today (or letting them go) is a deliberate
// choice. Recurring habits never appear here — their own schedule already
// decides which days they show up on. ---
function checkCarryOver() {
  // Late-night use (e.g. still working past midnight) shouldn't get asked
  // about "today's" tasks in the middle of the night — wait until the first
  // app open at/after 6am local time to bring this up at all.
  if (new Date().getHours() < 6) return;

  const state = getState();
  const overdue = getOverdueOnceTasks(state);
  if (!overdue.length) return;

  const listEl = document.getElementById("carryOverList");
  listEl.innerHTML = overdue
    .map(
      (h) => `
      <label class="carry-over-item">
        <input type="checkbox" checked data-habit="${h.id}" />
        <span>${h.emoji} ${h.label}</span>
      </label>
    `
    )
    .join("");
  document.getElementById("carryOverModal").hidden = false;

  const submit = document.getElementById("carryOverSubmit");
  const closeBtn = document.getElementById("carryOverClose");
  function applyChoices() {
    overdue.forEach((h) => {
      const checkbox = listEl.querySelector(`input[data-habit="${h.id}"]`);
      if (checkbox && checkbox.checked) carryOverTask(h.id, state.date);
      else dismissCarryOver(h.id, state.date);
    });
    cleanup();
  }
  // Closing with X, not Continue, just skips the decision for today — it
  // asks again tomorrow if still undone, rather than silently carrying
  // everything over based on checkbox defaults the user never confirmed.
  function dismissAll() {
    overdue.forEach((h) => dismissCarryOver(h.id, state.date));
    cleanup();
  }
  function cleanup() {
    document.getElementById("carryOverModal").hidden = true;
    submit.removeEventListener("click", applyChoices);
    closeBtn.removeEventListener("click", dismissAll);
    refreshApp();
  }
  submit.addEventListener("click", applyChoices);
  closeBtn.addEventListener("click", dismissAll);
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

// Auto-refresh the moment a new deployment takes over. sw.js unconditionally
// skipWaiting()s and claims clients, so the only thing missing was reloading
// the already-open page to pick up the new HTML/JS — without this, the app
// could silently keep running old code (including old safety checks) until
// someone manually force-quit or reinstalled, which is genuinely destructive
// on iOS (deleting the Home Screen icon wipes that app's local storage).
function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
  });
}

// Compact "widget mode" only applies on a real desktop with a mouse, shrunk
// small — never on a touchscreen phone, no matter how narrow its screen is.
function initCompactWidgetMode() {
  const isDesktopPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function update() {
    const isSmall = window.innerWidth <= 460 || window.innerHeight <= 560;
    document.body.classList.toggle("compact-widget", isDesktopPointer && isSmall);
  }
  update();
  window.addEventListener("resize", update);
}

// --- Init ---

initTheme();
const initialState = getState();
selectedDate = initialState.date;
initOpeningScreen();
initBottomNav();
initWeekNav();
initDaySwipe();
initAddTaskButton();
initQuickAdd();
initDayEditor();
initAddTask();
initDeleteScopeModal();
initConfirmModal();
initSettingsPanel();
initInsightsNav();
if (typeof initSyncOnLoad === "function") initSyncOnLoad();
initServiceWorker();
initCompactWidgetMode();
showTab("today");
checkCarryOver();
scheduleMidnightReset();
