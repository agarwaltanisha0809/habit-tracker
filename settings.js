// Settings panel: appearance, notifications, sync, habit list, sleep goal, profile.
const REMINDER_KEY = "habitTracker.reminder";
let syncCodeRevealed = false;

function getReminderSettings() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, time: "21:00" };
  } catch (e) {
    return { enabled: false, time: "21:00" };
  }
}

function saveReminderSettings(settings) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(settings));
}

function renderHabitsList() {
  const el = document.getElementById("habitsList");
  if (!el) return;
  const state = getState();
  const removable = state.habits.filter((h) => h.type !== "sleep");
  const chips = removable
    .map((h) => {
      const t = themeFor(h);
      return `<button type="button" class="habit-chip" data-habit="${h.id}"><span class="habit-chip-dot" style="background:${t.accent};"></span>${h.emoji} ${h.label}<span style="margin-left:3px; opacity:0.6;">✕</span></button>`;
    })
    .join("");
  el.innerHTML = chips + `<button type="button" class="habit-chip add" id="settingsAddHabit">+ Add habit</button>`;

  el.querySelectorAll(".habit-chip[data-habit]").forEach((chip) => {
    chip.addEventListener("click", () => {
      removeHabit(chip.dataset.habit);
      renderHabitsList();
      if (typeof refreshApp === "function") refreshApp();
    });
  });
  document.getElementById("settingsAddHabit").addEventListener("click", () => {
    document.getElementById("settingsPanel").hidden = true;
    openAddTaskModal();
  });
}

function renderSyncSection() {
  const el = document.getElementById("syncSection");
  if (!el) return;
  const code = getSyncCode();

  if (!code) {
    el.innerHTML = `
      <div class="settings-row">
        <div class="settings-row-label">🔗 <span>Sync code</span></div>
        <button type="button" class="settings-value-pill" id="syncSetup">Set up</button>
      </div>
      <div id="syncSetupForm" hidden style="padding: 10px 12px;">
        <button type="button" class="submit-btn" id="syncGenerate" style="margin-bottom:8px;">Generate a code</button>
        <div class="add-task-row">
          <input type="text" id="syncCodeInput" placeholder="Enter code" maxlength="6" class="form-input" style="text-transform:uppercase;" />
          <button type="button" class="settings-value-pill" id="syncConnect">Connect</button>
        </div>
      </div>
    `;
    document.getElementById("syncSetup").addEventListener("click", () => {
      document.getElementById("syncSetupForm").hidden = false;
    });
    document.getElementById("syncGenerate").addEventListener("click", () => {
      enableSyncAsHost(generateSyncCode());
      syncCodeRevealed = true;
      renderSyncSection();
      updateNotificationsHint();
    });
    document.getElementById("syncConnect").addEventListener("click", () => {
      const value = document.getElementById("syncCodeInput").value.trim().toUpperCase();
      if (!value) return;
      enableSyncAsGuest(value);
      renderSyncSection();
      updateNotificationsHint();
    });
  } else {
    el.innerHTML = `
      <div class="settings-row">
        <div class="settings-row-label">🔗 <span>Sync code</span></div>
        <button type="button" class="reveal-code" id="syncReveal">
          <span id="syncCodeDisplay">${syncCodeRevealed ? code : "••••••"}</span>
          <span>👁️</span>
        </button>
      </div>
      <div class="settings-row">
        <button type="button" class="reveal-code" id="syncStop" style="color:#e24b4a;">Stop syncing</button>
      </div>
    `;
    document.getElementById("syncReveal").addEventListener("click", () => {
      syncCodeRevealed = !syncCodeRevealed;
      document.getElementById("syncCodeDisplay").textContent = syncCodeRevealed ? code : "••••••";
    });
    document.getElementById("syncStop").addEventListener("click", () => {
      disableSync();
      syncCodeRevealed = false;
      renderSyncSection();
      updateNotificationsHint();
    });
  }
}

function notifyIfIncomplete() {
  const state = getState();
  const tasks = getTasksForDate(state.date).filter((h) => h.type !== "sleep");
  const remaining = tasks.filter((h) => !isCompleted(h, state.entries[h.id]));
  if (remaining.length === 0) return;
  new Notification("Habits", {
    body: `${remaining.length} left today: ${remaining.map((h) => h.label).join(", ")}`,
    icon: "icon.svg",
  });
}

function checkReminderTick() {
  const settings = getReminderSettings();
  if (!settings.enabled || Notification.permission !== "granted") return;
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (nowHHMM !== settings.time) return;

  const lastFired = localStorage.getItem("habitTracker.reminderFiredDate");
  const today = todayKey();
  if (lastFired === today) return;

  notifyIfIncomplete();
  localStorage.setItem("habitTracker.reminderFiredDate", today);
}

function updateNotificationsHint() {
  const hint = document.getElementById("notificationsHint");
  if (!hint) return;
  hint.textContent = getSyncCode()
    ? "Notifies you even if the app is closed, once a day at this time."
    : "Turn on Sync above first — that's what lets a reminder reach you while the app is closed.";
}

function initNotifications() {
  const toggle = document.getElementById("reminderToggle");
  const timeInput = document.getElementById("reminderTime");
  if (!toggle || !timeInput) return;

  const settings = getReminderSettings();
  toggle.checked = settings.enabled;
  timeInput.value = settings.time;
  const updateHint = updateNotificationsHint;
  updateHint();

  toggle.addEventListener("change", async () => {
    if (!toggle.checked) {
      saveReminderSettings({ enabled: false, time: timeInput.value });
      if (typeof unsubscribeFromPush === "function") unsubscribeFromPush().catch(() => {});
      return;
    }
    if (!getSyncCode()) {
      toggle.checked = false;
      updateHint();
      return;
    }
    try {
      await subscribeToPush(timeInput.value);
      saveReminderSettings({ enabled: true, time: timeInput.value });
    } catch (e) {
      toggle.checked = false;
    }
    // Local fallback while the tab is open, works regardless of sync.
    if ("Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
  });
  timeInput.addEventListener("change", () => {
    saveReminderSettings({ enabled: toggle.checked, time: timeInput.value });
    if (toggle.checked && typeof updatePushReminderTime === "function") {
      updatePushReminderTime(timeInput.value).catch(() => {});
    }
  });

  if ("Notification" in window) {
    setInterval(checkReminderTick, 30000);
  } else {
    toggle.disabled = true;
  }
}

function initAppearanceRow() {
  const toggle = document.getElementById("lightModeToggle");
  if (!toggle) return;
  toggle.checked = getStoredTheme() === "light";
  toggle.addEventListener("change", () => {
    applyTheme(toggle.checked ? "light" : "dark");
    if (typeof refreshApp === "function") refreshApp();
  });
}

function initSleepGoalStepper() {
  const valueEl = document.getElementById("sleepGoalValue");
  const minusBtn = document.getElementById("sleepGoalMinus");
  const plusBtn = document.getElementById("sleepGoalPlus");
  if (!valueEl) return;
  function render() {
    valueEl.textContent = getSleepGoal() + "h";
  }
  minusBtn.addEventListener("click", () => {
    setSleepGoal(Math.max(4, getSleepGoal() - 0.5));
    render();
    if (typeof refreshApp === "function") refreshApp();
  });
  plusBtn.addEventListener("click", () => {
    setSleepGoal(Math.min(12, getSleepGoal() + 0.5));
    render();
    if (typeof refreshApp === "function") refreshApp();
  });
  render();
}

function initProfileName() {
  const input = document.getElementById("userNameInput");
  if (!input) return;
  input.value = getUserName();
  input.addEventListener("change", () => {
    localStorage.setItem("habitTracker.userName", input.value.trim());
  });
}

function initSettingsPanel() {
  const openBtn = document.getElementById("settingsToggle");
  const panel = document.getElementById("settingsPanel");
  const closeBtn = document.getElementById("settingsClose");
  if (!openBtn || !panel) return;

  openBtn.addEventListener("click", () => {
    renderHabitsList();
    renderSyncSection();
    panel.hidden = false;
  });
  closeBtn.addEventListener("click", () => {
    panel.hidden = true;
  });
  panel.addEventListener("click", (e) => {
    if (e.target.id === "settingsPanel") panel.hidden = true;
  });

  initAppearanceRow();
  initNotifications();
  initSleepGoalStepper();
  initProfileName();
}
