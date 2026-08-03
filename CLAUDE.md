# Habits — project notes for Claude

A calendar-based habit and task tracker. Vanilla JS/HTML/CSS, no build step, no
framework. Deployed as a PWA on GitHub Pages, with optional Firebase Firestore
sync between devices.

**Starting a new chat to keep working on this?** Good — that's the intended
workflow. This file plus git history is the actual persistent record of the
project; no need to carry over old chat context. Just point a fresh session at
this folder and it'll pick up everything it needs from here.

**Never tell the user to delete the Home Screen icon and re-add it to "fix"
something.** iOS gives installed Home Screen web apps isolated storage, and
deleting the icon wipes it — this already caused real data loss once. The app
now auto-refreshes itself when a new version deploys (see app.js
`initServiceWorker`), so reinstalling should never be necessary again.

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
- Optional `habit.carryOverDismissedDate` (string date) suppresses the carry-over prompt for that specific `once` task for the rest of that day only — absent/stale values are harmless, no migration needed.

## Habits vs. one-off tasks (Today screen)

Recurring habits (`schedule.kind !== "once"`) and one-off tasks (`schedule.kind === "once"`) are deliberately treated as two different psychological categories, not just two data variants:

- **Quick-add compose bar** (`#quickAddInput`, wired in `app.js:initQuickAdd`) is the low-friction path for one-off tasks — no modal. Enter adds the typed line as a task for `selectedDate` and clears the field immediately, so typing several lines in a row (each ending in Enter) works like a rapid brain dump without switching modes. Pasting a multi-line block auto-splits into one task per line. The existing `+` button / full modal (`addTask.js`) is now framed as being for **recurring habits** specifically, though it still technically supports creating a "once" task with more options (custom emoji, counter type) if needed.
- **Smart emoji guessing** (`habits.js:guessEmojiForLabel`) — free, local keyword matching (`TASK_EMOJI_KEYWORDS`) against the typed label, falls back to ✅. No API call, no cost.
- **Visual separation on Today**: `renderToday()` in app.js splits the day's items into a "Habits" group and a "Tasks" group (`.task-group-label` headers), each independently sorted done-to-bottom. Tasks always render with a fixed bright gold theme (`TASK_THEME`/`LIGHT_TASK_THEME` in habits.js, applied via `applyTone()` in app.js whenever `schedule.kind === "once"`) instead of the habit's own rotated color — this is intentional so the eye can bucket "temporary, needs clearing" apart from a habit's "ongoing, has its own identity" at a glance. Completed items (both groups) stay visible, dimmed + struck through, rather than disappearing — the user explicitly wants a visible record of what got done, not a shrinking counter.
- **Carry-over** (`storage.js:getOverdueOnceTasks/carryOverTask/dismissCarryOver`, `app.js:checkCarryOver`, `#carryOverModal`): once per real day, if there's an undone `once` task dated before today, a modal lists it with a checkbox (checked by default) — Continue moves checked ones to today (`schedule.date` updated in place) and marks the rest dismissed for today; closing with X dismisses all without carrying anything over. This applies to one-off tasks only, never recurring habits — habits already have their own schedule logic and carrying over a missed habit doesn't mean the same thing psychologically (Zeigarnik-effect "unfinished business" vs. a routine that just resets).

## Known constraints / decisions (don't relitigate without reason)

- **True black (`#0a0a0a`) is the default theme**, light mode is the toggle-on option — this was an explicit user choice, not an oversight.
- **No em dashes anywhere** — in UI copy or in chat responses to this user. Confirmed preference.
- **No Tabler icon font or other web fonts in the real app** — that's only available inside the Claude mockup/visualize sandbox tool. The real app uses plain emoji for all icons.
- Water/counter habits use an actual SVG glass-fill graphic (`ui.js:glassSvg`) when `habit.unitMl` is set; plain counters (no `unitMl`) show a generic icon badge instead.
- Swipe gesture on habit cards is direction-locked (checks first ~6px of movement before committing to horizontal vs vertical) specifically to avoid hijacking page scroll — don't simplify this back to a naive drag handler. Swiping now reveals two actions, Edit and Delete, not just Delete.
- Deleting a recurring habit always asks scope (just this day / this and following / all days), matching Google Calendar's pattern. Only `schedule.kind === "once"` skips the prompt and deletes immediately.
- App shell layout is fixed-position (`html, body { overflow: hidden }`, `.app-shell` is `position: fixed; inset: 0`) with only `.app-scroll-area` scrolling — this was a deliberate fix for iOS Safari's bounce-scroll dragging `position: fixed` elements around. Don't revert to a simpler scrolling-body layout without re-testing on an actual iOS device.
- `apple-mobile-web-app-status-bar-style` must stay `"black"` (opaque), not `"black-translucent"` — translucent drew the top bar under the iOS status bar/notch and caused visible icon overlap on a real device. The `.top-bar` padding-top (`max(10px, env(safe-area-inset-top))`) is just a floor on top of that, not the actual fix.
- **Compact "widget mode"** (`styles.css`, bottom of file): a `@media (max-width: 300px), (max-height: 380px)` block hides the top bar, week-nav row, add/ring row, and bottom nav, leaving just the screen title and task list — for the macOS "Add to Dock" use case, where the user shrinks the standalone app window down and keeps it open on the desktop like a sticky note. Pure CSS, no JS breakpoint logic. Don't remove without an alternative for that use case.
- Any state-mutating change to `storage.js` should route through the generic `confirmAction()` modal (in app.js) if it can destroy data the user didn't just create in this action — this is why `resetSleep()` is gated. A prior version silently wiped a night's sleep data with a single tap and no way back.
- Best Day (tracker.js) compares completion *rate* (done/scheduled) across days first, then tiebreaks by earliest `completedAt` timestamp (stamped by `withCompletionStamp()` in storage.js whenever an entry transitions to completed) — not raw completion count, and not calendar order. Falls back to "N tied" if timestamp data is missing for a tied day (e.g. entries predating this feature).
- **Two independent data-safety nets exist**: Firestore sync auto-resumes on load (`initSyncOnLoad()` is called from app.js's init sequence — it used to be defined but never invoked, which was a real bug), and a manual JSON export/import lives in Settings → Backup (`exportBackup()`/`importBackup()` in storage.js). Don't remove either without replacing it with something equally durable.
- **Never commit the user's real Firestore sync code to this repo.** The repo is public (required for free GitHub Pages hosting) and Firestore rules are open/test-mode, so the sync code is effectively a password. `scriptable-widget.js` in git must always keep `const SYNC_CODE = "PASTE_YOUR_SYNC_CODE_HERE";` as a placeholder. The user's real code lives only in a local, non-committed copy (`~/Desktop/Habits.txt`) and directly inside the Scriptable app on their phone.

## Open items / not yet finished

1. **Web Push notifications** — client code (`push.js`, `sw.js` push handler) and the Cloud Function (`functions/index.js`) are written, Firebase CLI login is complete, but deployment is **blocked on the user upgrading the Firebase project to the Blaze (pay-as-you-go) plan** (still free at this scale, just needs a card on file): https://console.firebase.google.com/project/habit-tracker-667bc/usage/details. Once that's done:
   - `cd functions && npm install` (firebase-tools itself is installed locally/unsaved via `npm install --no-save firebase-tools`, not in package.json)
   - `firebase functions:secrets:set VAPID_PRIVATE_KEY` (regenerate with `npx web-push generate-vapid-keys` if the original was lost, and update `VAPID_PUBLIC_KEY` in both `push.js` and `functions/index.js` to match)
   - `firebase deploy --only functions`
   - Push only works once the user has Sync turned on (the Cloud Function reads Firestore, which only has data once synced)
2. **Scriptable widget** — `scriptable-widget.js` works. Two real bugs were found and fixed during testing: `widget.presentSmall()` needed `await` before `Script.complete()` (was rendering nothing in interactive preview), and the two Firestore fetches needed to run in parallel via `Promise.all()` instead of sequentially (sequential fetches blew past iOS's background-widget execution time budget, producing a blank widget once actually placed on the Home Screen — even though the same script worked fine in the interactive test/preview mode). User should confirm the fix holds on their actual Home Screen placement if not already done.
3. **Going public / monetizing** — discussed but intentionally not started. Would need real auth (current sync is an open 6-char code, fine for personal use, not for strangers), Stripe or StoreKit for payments, and a privacy policy. Recommended path if this comes up again: web-first with real accounts + Stripe, not an App Store submission (PWA wrappers risk App Review rejection under "minimum functionality").
4. **AI assistant features** — brainstormed at length (categorized ideas: smart nudges/insights, natural-language habit logging, adaptive scheduling suggestions, etc.) but no direction has been chosen and nothing has been built. Purely exploratory — ask the user which direction (if any) they want to pursue before building anything here.

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
