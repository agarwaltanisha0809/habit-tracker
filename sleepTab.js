// Sleep tab: start/stop tap logging (never a live-running timer — see
// storage.js:startSleep/endSleep), a weekly average ring, nightly bubbles,
// and color-coded insight cards.
const SLEEP_GOAL_KEY = "habitTracker.sleepGoalHours";

function getSleepGoal() {
  return parseFloat(localStorage.getItem(SLEEP_GOAL_KEY)) || 8;
}

function setSleepGoal(hours) {
  localStorage.setItem(SLEEP_GOAL_KEY, String(hours));
}

function getSleepNights(state, n) {
  const days = getLastNDays(state, n);
  return days
    .filter(({ entries }) => entries && entries.sleep && entries.sleep.hours > 0)
    .map(({ date, entries }) => ({ date, ...entries.sleep }));
}

// Circular mean so clock times clustered around midnight (e.g. 11pm and
// 1am) average correctly instead of collapsing toward noon.
function circularMeanMinutes(minsArray) {
  if (!minsArray.length) return null;
  let sumSin = 0;
  let sumCos = 0;
  minsArray.forEach((m) => {
    const angle = (m / 1440) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  });
  let angle = Math.atan2(sumSin / minsArray.length, sumCos / minsArray.length);
  if (angle < 0) angle += 2 * Math.PI;
  return Math.round((angle / (2 * Math.PI)) * 1440) % 1440;
}

function minutesToClock(mins) {
  if (mins == null) return "—";
  const h24 = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function timestampMinutes(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

// Bedtimes cluster around midnight, so shift anything before 6am into "next
// day" space before computing min/max/stddev, then fold back for display.
function shiftForNightMath(mins) {
  return mins < 360 ? mins + 1440 : mins;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function renderSleepTab() {
  const state = getState();
  document.getElementById("sleepScribble").innerHTML = scribbleSvg(70, "#afa9ec");

  const sleepEntry = state.entries.sleep || { startAt: null, endAt: null, hours: 0, note: "" };
  const heroEl = document.getElementById("sleepHero");
  const goal = getSleepGoal();
  const week = getSleepNights(state, 7);
  const avgHours = week.length ? week.reduce((a, n) => a + n.hours, 0) / week.length : 0;
  const fraction = goal ? avgHours / goal : 0;

  let actionLabel = "Going to bed";
  let actionAction = "start";
  let statusLine = "Not tracking yet tonight";
  if (sleepEntry.startAt && !sleepEntry.endAt) {
    actionLabel = "I'm awake";
    actionAction = "end";
    statusLine = `Bedtime logged at ${formatClockTime(sleepEntry.startAt)}`;
  } else if (sleepEntry.hours > 0) {
    actionLabel = "Log again";
    actionAction = "reset";
    statusLine = `Slept ${sleepEntry.hours}h · ${formatClockTime(sleepEntry.startAt)} to ${formatClockTime(sleepEntry.endAt)}`;
  }

  heroEl.innerHTML = `
    <div class="sleep-ring">
      <div class="sleep-ring-svg">${ringSvg(70, 7, Math.min(1, fraction), "#3c3489", "#afa9ec")}</div>
      <div class="sleep-ring-label">${avgHours ? avgHours.toFixed(1) + "h" : "—"}</div>
    </div>
    <div>
      <div class="sleep-hero-caption">${week.length ? "Average this week" : statusLine}</div>
      <div class="sleep-hero-sub">${week.length ? Math.round(fraction * 100) + `% of your ${goal}h goal` : ""}</div>
      <button type="button" class="sleep-action-btn" id="sleepActionBtn" data-action="${actionAction}">${actionLabel}</button>
    </div>
  `;
  document.getElementById("sleepActionBtn").addEventListener("click", (e) => {
    const action = e.currentTarget.dataset.action;
    if (action === "start") startSleep("sleep");
    else if (action === "end") endSleep("sleep");
    else resetSleep("sleep");
    renderSleepTab();
    if (typeof refreshApp === "function") refreshApp();
  });

  const bubbleRow = document.getElementById("sleepBubbleRow");
  const days = getLastNDays(state, 7);
  const maxHours = Math.max(1, ...days.map((d) => (d.entries && d.entries.sleep && d.entries.sleep.hours) || 0));
  bubbleRow.innerHTML = days
    .map(({ date, entries }) => {
      const hours = (entries && entries.sleep && entries.sleep.hours) || 0;
      const size = hours ? Math.round(14 + (hours / maxHours) * 20) : 8;
      const color = hours >= goal ? "#afa9ec" : hours > 0 ? "#7f77dd" : "#2a2822";
      return `
        <div class="sleep-bubble-col">
          <div class="sleep-bubble" style="width:${size}px; height:${size}px; background:${color};"></div>
          <span class="sleep-bubble-day-label">${weekdayLetter(date)}</span>
        </div>
      `;
    })
    .join("");

  const month = getSleepNights(state, 30);
  const bedMinutes = month.map((n) => shiftForNightMath(timestampMinutes(n.startAt)));
  const wakeMinutes = month.map((n) => timestampMinutes(n.endAt));
  const avgBed = bedMinutes.length ? circularMeanMinutes(month.map((n) => timestampMinutes(n.startAt))) : null;
  const avgWake = wakeMinutes.length ? circularMeanMinutes(wakeMinutes) : null;
  const weekBedMinutes = week.map((n) => shiftForNightMath(timestampMinutes(n.startAt)));
  const weekWakeMinutes = week.map((n) => timestampMinutes(n.endAt));
  const bedVariance = Math.round(stddev(weekBedMinutes));
  const earliestBed = weekBedMinutes.length ? Math.min(...weekBedMinutes) % 1440 : null;
  const latestBed = weekBedMinutes.length ? Math.max(...weekBedMinutes) % 1440 : null;
  const earliestWake = weekWakeMinutes.length ? Math.min(...weekWakeMinutes) : null;
  const latestWake = weekWakeMinutes.length ? Math.max(...weekWakeMinutes) : null;
  const longest = week.length ? Math.max(...week.map((n) => n.hours)) : null;
  const shortest = week.length ? Math.min(...week.map((n) => n.hours)) : null;

  document.getElementById("sleepInsights").innerHTML = `
    <div class="sleep-insight-card wide" style="--tone-bg:#4a1b0c; --tone-text:#faece7; --tone-muted:#f0997b;">
      <div style="display:flex; align-items:center; gap:6px;"><span>🌙</span><span style="font-size:11px; color:#f0997b;">Bedtime</span></div>
      <div style="font-size:16px; margin-top:4px;">${minutesToClock(avgBed)} <span style="font-size:11px; color:#f0997b;">avg</span></div>
      <div class="sleep-range-bar">
        <span style="font-size:10px; color:#f5c4b3;">${minutesToClock(earliestBed)}</span>
        <span style="font-size:10px; color:#f5c4b3; flex:1; text-align:center;">to</span>
        <span style="font-size:10px; color:#f5c4b3;">${minutesToClock(latestBed)}</span>
      </div>
    </div>
    <div class="sleep-insight-grid" style="margin-top:8px;">
      <div class="sleep-insight-card" style="--tone-bg:#412402; --tone-text:#faeeda; --tone-muted:#fac775;">
        <span>🌅</span>
        <div class="sleep-insight-label">Wake time</div>
        <div class="sleep-insight-value">${minutesToClock(avgWake)}</div>
      </div>
      <div class="sleep-insight-card" style="--tone-bg:#04342c; --tone-text:#e1f5ee; --tone-muted:#9fe1cb;">
        <span>↕️</span>
        <div class="sleep-insight-label">Longest / shortest</div>
        <div class="sleep-insight-value">${longest != null ? longest + "h / " + shortest + "h" : "—"}</div>
      </div>
      <div class="sleep-insight-card" style="--tone-bg:#4b1528; --tone-text:#fbeaf0; --tone-muted:#f4c0d1;">
        <span>☀️</span>
        <div class="sleep-insight-label">Wake range</div>
        <div class="sleep-insight-value">${earliestWake != null ? minutesToClock(earliestWake) + " to " + minutesToClock(latestWake) : "—"}</div>
      </div>
      <div class="sleep-insight-card" style="--tone-bg:#042c53; --tone-text:#e6f1fb; --tone-muted:#b5d4f4;">
        <span>〰️</span>
        <div class="sleep-insight-label">Consistency</div>
        <div class="sleep-insight-value">${week.length > 1 ? "varies ~" + bedVariance + "m" : "—"}</div>
      </div>
    </div>
  `;
}
