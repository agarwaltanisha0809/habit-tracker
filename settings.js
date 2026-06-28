// Settings panel: add/remove custom habits, and the daily reminder notification.
const REMINDER_KEY = "habitTracker.reminder";

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

function renderCustomHabitsList() {
  const el = document.getElementById("customHabitsList");
  if (!el) return;
  const state = getState();
  if (!state.customHabits.length) {
    el.innerHTML = `<p class="settings-empty">No custom habits yet.</p>`;
    return;
  }
  el.innerHTML = state.customHabits
    .map(
      (h) => `
      <div class="custom-habit-row">
        <span>${h.emoji} ${h.label}</span>
        <button type="button" class="remove-habit-btn" data-habit="${h.id}" aria-label="Remove ${h.label}">✕</button>
      </div>`
    )
    .join("");

  el.querySelectorAll(".remove-habit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeHabit(btn.dataset.habit);
      renderCustomHabitsList();
      refreshApp();
    });
  });
}

function initAddHabitForm() {
  const form = document.getElementById("addHabitForm");
  if (!form) return;
  const typeSelect = document.getElementById("newHabitType");
  const targetField = document.getElementById("newHabitTargetField");

  typeSelect.addEventListener("change", () => {
    targetField.hidden = typeSelect.value !== "counter";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const label = document.getElementById("newHabitLabel").value.trim();
    if (!label) return;
    const emoji = document.getElementById("newHabitEmoji").value.trim();
    const type = typeSelect.value;
    const target = parseInt(document.getElementById("newHabitTarget").value, 10) || 1;

    addHabit({ label, emoji, type, target });
    form.reset();
    targetField.hidden = true;
    renderCustomHabitsList();
    refreshApp();
  });
}

function notifyIfIncomplete() {
  const state = getState();
  const habits = getHabits();
  const remaining = habits.filter((h) => !isCompleted(h, state.entries[h.id]));
  if (remaining.length === 0) return;
  new Notification("Daily habits reminder", {
    body: `${remaining.length} habit${remaining.length === 1 ? "" : "s"} left today: ${remaining
      .map((h) => h.label)
      .join(", ")}`,
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

function initReminders() {
  const toggle = document.getElementById("reminderToggle");
  const timeInput = document.getElementById("reminderTime");
  if (!toggle || !timeInput) return;

  const settings = getReminderSettings();
  toggle.checked = settings.enabled;
  timeInput.value = settings.time;

  toggle.addEventListener("change", async () => {
    if (toggle.checked && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toggle.checked = false;
        return;
      }
    }
    saveReminderSettings({ enabled: toggle.checked, time: timeInput.value });
  });

  timeInput.addEventListener("change", () => {
    saveReminderSettings({ enabled: toggle.checked, time: timeInput.value });
  });

  if ("Notification" in window) {
    setInterval(checkReminderTick, 30000);
  } else {
    toggle.disabled = true;
  }
}

function renderSyncSection() {
  const el = document.getElementById("syncSection");
  if (!el) return;
  const code = getSyncCode();

  if (code) {
    el.innerHTML = `
      <p class="settings-hint">Synced. Enter this code on your other device:</p>
      <div class="sync-code-display">${code}</div>
      <button type="button" id="syncDisconnect" class="add-habit-submit sync-disconnect">Stop syncing</button>
    `;
    document.getElementById("syncDisconnect").addEventListener("click", () => {
      disableSync();
      renderSyncSection();
    });
  } else {
    el.innerHTML = `
      <button type="button" id="syncGenerate" class="add-habit-submit">Generate a sync code</button>
      <p class="settings-hint">Or enter a code from your other device:</p>
      <div class="add-habit-row">
        <input type="text" id="syncCodeInput" placeholder="ABC123" maxlength="6" class="label-input sync-code-input" />
        <button type="button" id="syncConnect" class="add-habit-submit sync-connect-btn">Connect</button>
      </div>
    `;
    document.getElementById("syncGenerate").addEventListener("click", () => {
      enableSyncAsHost(generateSyncCode());
      renderSyncSection();
    });
    document.getElementById("syncConnect").addEventListener("click", () => {
      const input = document.getElementById("syncCodeInput");
      const value = input.value.trim().toUpperCase();
      if (!value) return;
      enableSyncAsGuest(value);
      renderSyncSection();
    });
  }
}

function initSettingsPanel() {
  const openBtn = document.getElementById("settingsToggle");
  const panel = document.getElementById("settingsPanel");
  const closeBtn = document.getElementById("settingsClose");
  if (!openBtn || !panel) return;

  openBtn.addEventListener("click", () => {
    renderCustomHabitsList();
    renderSyncSection();
    panel.hidden = false;
  });
  closeBtn.addEventListener("click", () => {
    panel.hidden = true;
  });
  panel.addEventListener("click", (e) => {
    if (e.target.id === "settingsPanel") panel.hidden = true;
  });

  initAddHabitForm();
  initReminders();
}
