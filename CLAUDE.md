# Habits — project notes for Claude

A calendar-based habit and task tracker. Vanilla JS/HTML/CSS, no build step, no
framework. Deployed as a PWA on GitHub Pages, with optional Firebase Firestore
sync between devices.

## Live deployment

- App: https://agarwaltanisha0809.github.io/habit-tracker/
- Repo: https://github.com/agarwaltanisha0809/habit-tracker (branch `main`, GitHub Pages serves directly from it)
- Firebase project: `habit-tracker-667bc` (Firestore in test/open rules — fine for personal use, not for public users)

To deploy a change: commit and `git push origin main`. GitHub Pages picks it up automatically in about a minute. **Always bump `CACHE_NAME` in `sw.js`** when deploying, or the service worker will keep serving the old cached version to anyone who already installed the app.

## File map

| File | Responsibility |
|---|---|
| `index.html` | All markup: shell, 4 tab views, modals (add/edit habit, day editor, delete-scope, settings) |
| `styles.css` | Everything visual. One big file, organized by section with comments |
| `storage.js` | Data model + all localStorage/state mutation. Read this first to understand the app |
| `habits.js` | Color themes, emoji list, schedule-matching logic (`isScheduledForDate`) |
| `ui.js` | Shared SVG helpers: scribble underline, wobble circle, progress ring, water glass |
| `app.js` | Core render loop: opening screen, Today tab, tab switching, swipe-to-delete/edit gesture |
| `addTask.js` | Add/edit habit modal (same modal, `editingHabitId` toggles mode) |
| `dayEditor.js` | Modal for editing a specific past date's entries (opened from heatmap taps) |
| `tracker.js` | Habit Tracker tab (weekly/monthly/yearly grids) |
| `sleepTab.js` | Sleep tab (start/stop logging, insights) |
| `insightsTab.js` | Insights tab (month heatmap, editorial stats) |
| `settings.js` | Settings panel: appearance, notifications, sync, habit list, sleep goal |
| `sync.js` | Firestore cross-device sync (last-write-wins per day) |
| `push.js` | Web Push subscription (client side only — requires Sync to be on) |
| `theme.js` | Dark/light toggle |
| `confetti.js` | Canvas confetti burst when all habits complete |
| `sw.js` | Service worker: offline caching + push notification display |
| `functions/` | Firebase Cloud Function for scheduled push reminders (not yet deployed — see below) |
| `scriptable-widget.js` | iOS/Mac Home Screen + Lock Screen widget script (paste into the Scriptable app) |

## Data model (storage.js)

- App starts with **zero pre-seeded habits** — the user adds everything themselves.
- A "habit" is really a **scheduled task**: `{ id, emoji, label, type, color, schedule, createdAt, excludeFromTracker, skipDates? }`
- `type`: `"check"` (yes/no), `"counter"` (target + optional `unitMl` for the water-glass visual), or `"sleep"` (one reserved internal habit, id `"sleep"`, not shown in the regular task list — it has its own tab)
- `schedule.kind`: `"daily" | "weekdays" | "weekends" | "custom" | "once"`. `custom` uses `schedule.days` (0=Sun..6=Sat, matches `Date.getDay()`). `once` uses `schedule.date`. Optional `schedule.until` ends recurrence after a date (used by "this and following days" delete). Optional `habit.skipDates` excludes individual dates (used by "just this day" delete).
- Entries are per-date, per-habit: `state.entries` holds *today's* entries live; `state.history[date]` holds everything else. Both use the same shape.
- **Streaks are never stored** — always derived from history via `computeCurrentStreak`/`computeLongestStreak`, which are schedule-aware (only days the habit was actually scheduled count toward or break a streak).
- Habit Tracker tab auto-includes a habit once it's been completed ~3x/week over the last 30 days (`isTrackerEligible`); new habits get a 14-day bootstrap grace period; `excludeFromTracker` (true/false/null) lets the user force it either way.

## Known constraints / decisions (don't relitigate without reason)

- **True black (`#0a0a0a`) is the default theme**, light mode is the toggle-on option — this was an explicit user choice, not an oversight.
- **No em dashes anywhere** — in UI copy or in chat responses to this user. Confirmed preference.
- **No Tabler icon font or other web fonts in the real app** — that's only available inside the Claude mockup/visualize sandbox tool. The real app uses plain emoji for all icons.
- Water/counter habits use an actual SVG glass-fill graphic (`ui.js:glassSvg`) when `habit.unitMl` is set; plain counters (no `unitMl`) show a generic icon badge instead.
- Swipe gesture on habit cards is direction-locked (checks first ~6px of movement before committing to horizontal vs vertical) specifically to avoid hijacking page scroll — don't simplify this back to a naive drag handler.
- Deleting a recurring habit always asks scope (just this day / this and following / all days), matching Google Calendar's pattern. Only `schedule.kind === "once"` skips the prompt and deletes immediately.
- App shell layout is fixed-position (`html, body { overflow: hidden }`, `.app-shell` is `position: fixed; inset: 0`) with only `.app-scroll-area` scrolling — this was a deliberate fix for iOS Safari's bounce-scroll dragging `position: fixed` elements around. Don't revert to a simpler scrolling-body layout without re-testing on an actual iOS device.

## Open items / not yet finished

1. **Web Push notifications** — client code (`push.js`, `sw.js` push handler) and the Cloud Function (`functions/index.js`) are written but **not deployed**. To finish:
   - Upgrade the Firebase project to the Blaze (pay-as-you-go) plan — still free at this scale, just needs a card on file
   - `cd functions && npm install`
   - `firebase functions:secrets:set VAPID_PRIVATE_KEY` (the private key is in the agent's memory of this build, not committed anywhere — regenerate with `npx web-push generate-vapid-keys` if lost, and update `VAPID_PUBLIC_KEY` in both `push.js` and `functions/index.js` to match)
   - `firebase deploy --only functions`
   - Push only works once the user has Sync turned on (the Cloud Function reads Firestore, which only has data once synced)
2. **Scriptable widget** — `scriptable-widget.js` is ready to paste into the free Scriptable iOS app. User needs to fill in their own `SYNC_CODE` at the top of the script once they've enabled Sync.
3. **Going public / monetizing** — discussed but intentionally not started. Would need real auth (current sync is an open 6-char code, fine for personal use, not for strangers), Stripe or StoreKit for payments, and a privacy policy. Recommended path if this comes up again: web-first with real accounts + Stripe, not an App Store submission (PWA wrappers risk App Review rejection under "minimum functionality").

## Testing notes

- No test suite — this is a small personal app, verify manually via the Claude Preview tool.
- **The service worker aggressively caches.** When testing changes locally, always run this before checking anything:
  ```js
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  localStorage.clear();
  location.reload();
  ```
- `preview_click` (the tool's synthetic click) has occasionally mis-targeted or raced during rapid sequential calls in testing — if something looks broken via the tool, verify with a real `.click()` call via `preview_eval` before concluding it's an app bug. Screenshots have also occasionally shown a stale frame; a forced reflow (`document.body.offsetHeight`) before re-screenshotting usually resolves it.
