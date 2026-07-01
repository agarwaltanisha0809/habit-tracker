// The "add a habit or task" flow: emoji picker, type, and schedule
// (daily / weekdays / weekends / custom days / just today).
let selectedEmoji = "⭐";
let selectedScheduleKind = "daily";
let selectedCustomDays = [];

function renderEmojiGrid() {
  const el = document.getElementById("emojiGrid");
  el.innerHTML = EMOJI_CHOICES.map(
    (e) => `<button type="button" class="emoji-grid-btn${e === selectedEmoji ? " selected" : ""}" data-emoji="${e}">${e}</button>`
  ).join("");
  el.querySelectorAll(".emoji-grid-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEmoji = btn.dataset.emoji;
      document.getElementById("emojiTrigger").textContent = selectedEmoji;
      renderEmojiGrid();
    });
  });
}

function toggleEmojiGrid() {
  const grid = document.getElementById("emojiGrid");
  grid.hidden = !grid.hidden;
  if (!grid.hidden) renderEmojiGrid();
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderScheduleOptions() {
  const el = document.getElementById("scheduleOptions");
  const kinds = [
    { key: "daily", label: "Daily" },
    { key: "weekdays", label: "Weekdays" },
    { key: "weekends", label: "Weekends" },
    { key: "custom", label: "Custom days" },
    { key: "once", label: "Just today" },
  ];
  el.innerHTML = kinds
    .map((k) => `<button type="button" class="schedule-option${k.key === selectedScheduleKind ? " active" : ""}" data-kind="${k.key}">${k.label}</button>`)
    .join("");
  el.querySelectorAll(".schedule-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedScheduleKind = btn.dataset.kind;
      renderScheduleOptions();
      renderWeekdayPicker();
    });
  });
  renderWeekdayPicker();
}

function renderWeekdayPicker() {
  const wrap = document.getElementById("weekdayPickerWrap");
  wrap.hidden = selectedScheduleKind !== "custom";
  if (wrap.hidden) return;
  const el = document.getElementById("weekdayPicker");
  el.innerHTML = WEEKDAY_NAMES.map(
    (name, i) => `<button type="button" class="weekday-toggle${selectedCustomDays.includes(i) ? " active" : ""}" data-day="${i}">${name[0]}</button>`
  ).join("");
  el.querySelectorAll(".weekday-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const day = parseInt(btn.dataset.day, 10);
      if (selectedCustomDays.includes(day)) {
        selectedCustomDays = selectedCustomDays.filter((d) => d !== day);
      } else {
        selectedCustomDays = selectedCustomDays.concat(day);
      }
      renderWeekdayPicker();
    });
  });
}

function openAddTaskModal() {
  selectedEmoji = "⭐";
  selectedScheduleKind = "daily";
  selectedCustomDays = [];
  document.getElementById("addTaskForm").reset();
  document.getElementById("emojiTrigger").textContent = selectedEmoji;
  document.getElementById("emojiGrid").hidden = true;
  document.getElementById("targetField").hidden = true;
  document.getElementById("liquidField").hidden = true;
  renderScheduleOptions();
  document.getElementById("addTaskModal").hidden = false;
}

function closeAddTaskModal() {
  document.getElementById("addTaskModal").hidden = true;
}

function initAddTask() {
  document.getElementById("emojiTrigger").addEventListener("click", toggleEmojiGrid);

  const typeSelect = document.getElementById("newTaskType");
  const targetField = document.getElementById("targetField");
  const liquidCheckbox = document.getElementById("newTaskIsLiquid");
  const liquidField = document.getElementById("liquidField");
  typeSelect.addEventListener("change", () => {
    targetField.hidden = typeSelect.value !== "counter";
  });
  liquidCheckbox.addEventListener("change", () => {
    liquidField.hidden = !liquidCheckbox.checked;
  });

  document.getElementById("addTaskModalClose").addEventListener("click", closeAddTaskModal);
  document.getElementById("addTaskModal").addEventListener("click", (e) => {
    if (e.target.id === "addTaskModal") closeAddTaskModal();
  });

  document.getElementById("addTaskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const label = document.getElementById("newTaskLabel").value.trim();
    if (!label) return;
    const type = typeSelect.value;
    const target = parseInt(document.getElementById("newTaskTarget").value, 10) || 1;
    const isLiquid = type === "counter" && document.getElementById("newTaskIsLiquid").checked;
    const unitMl = isLiquid ? parseInt(document.getElementById("newTaskUnitMl").value, 10) || 250 : 0;

    let schedule;
    if (selectedScheduleKind === "custom") {
      if (!selectedCustomDays.length) return;
      schedule = { kind: "custom", days: selectedCustomDays };
    } else if (selectedScheduleKind === "once") {
      schedule = { kind: "once", date: selectedDate || todayKey() };
    } else {
      schedule = { kind: selectedScheduleKind };
    }

    addHabit({ label, emoji: selectedEmoji, type, schedule, target, unitMl });
    closeAddTaskModal();
    if (typeof refreshApp === "function") refreshApp();
    if (typeof renderHabitsList === "function") renderHabitsList();
  });
}
