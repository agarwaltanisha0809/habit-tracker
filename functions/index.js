// Scheduled Cloud Function: runs every 5 minutes, checks every synced device
// that has notifications turned on, and sends a Web Push reminder if it's
// their reminder time and they still have habits left today.
//
// Deploy with the Firebase CLI (see README notes in the project root):
//   firebase functions:secrets:set VAPID_PRIVATE_KEY
//   firebase deploy --only functions
//
// Known limitation: "today" is computed in UTC here, since a server function
// has no reliable per-user timezone without extra setup. For most timezones
// this only causes a wrong reminder in the few hours around UTC midnight —
// good enough for a personal app, worth revisiting if it becomes annoying.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_PUBLIC_KEY =
  "BHETYFjalTuHmevTR-Zr-d5MDq5BV08EltaOeVbm1XzbXLR4UWkF_tEJndanstigISqxi3B6SjZfkhNvLT6JO8U";

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function roundedNowHHMM() {
  const now = new Date();
  const minutes = Math.floor(now.getUTCMinutes() / 5) * 5;
  return `${String(now.getUTCHours()).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isScheduledForDate(habit, dateStr) {
  const schedule = habit.schedule || { kind: "daily" };
  if (schedule.kind === "once") return schedule.date === dateStr;
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  if (schedule.kind === "daily") return true;
  if (schedule.kind === "weekdays") return day >= 1 && day <= 5;
  if (schedule.kind === "weekends") return day === 0 || day === 6;
  if (schedule.kind === "custom") return (schedule.days || []).includes(day);
  return true;
}

function isCompleted(habit, entry) {
  if (!entry) return false;
  if (habit.type === "counter") return (entry.count || 0) >= (habit.completionThreshold || habit.target);
  if (habit.type === "sleep") return (entry.hours || 0) > 0;
  return !!entry.done;
}

exports.sendReminders = onSchedule(
  { schedule: "every 5 minutes", secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    webpush.setVapidDetails("mailto:habits-app@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());

    const nowHHMM = roundedNowHHMM();
    const today = todayUTC();

    const pushDocs = await db.collectionGroup("meta").where("enabled", "==", true).get();

    const jobs = pushDocs.docs
      .filter((doc) => doc.id === "push" && doc.data().reminderTime === nowHHMM && doc.data().lastFiredDate !== today)
      .map(async (doc) => {
        const syncRef = doc.ref.parent.parent; // syncs/{code}
        const { subscription } = doc.data();

        const habitsDoc = await syncRef.collection("meta").doc("habits").get();
        const habits = (habitsDoc.exists && habitsDoc.data().habits) || [];
        const todayDoc = await syncRef.collection("days").doc(today).get();
        const entries = (todayDoc.exists && todayDoc.data().entries) || {};

        const remaining = habits.filter(
          (h) => h.type !== "sleep" && isScheduledForDate(h, today) && !isCompleted(h, entries[h.id])
        );
        if (!remaining.length) {
          await doc.ref.set({ lastFiredDate: today }, { merge: true });
          return;
        }

        const payload = JSON.stringify({
          title: "Habits",
          body: `${remaining.length} left today: ${remaining.map((h) => h.label).join(", ")}`,
        });

        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await doc.ref.set({ enabled: false }, { merge: true }); // subscription expired
          }
        }
        await doc.ref.set({ lastFiredDate: today }, { merge: true });
      });

    await Promise.all(jobs);
  }
);
