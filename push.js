// Web Push subscription management. This only works once Sync is turned on
// (Settings → Sync across devices) — a Cloud Function running on a schedule
// is the only thing that can notify you while the app is fully closed, and
// it can only see your habits if they're already in Firestore via sync.
const VAPID_PUBLIC_KEY =
  "BHETYFjalTuHmevTR-Zr-d5MDq5BV08EltaOeVbm1XzbXLR4UWkF_tEJndanstigISqxi3B6SjZfkhNvLT6JO8U";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(reminderTime) {
  const code = getSyncCode();
  if (!code) throw new Error("Sync must be enabled before turning on notifications.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications aren't supported in this browser.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await getDb()
    .collection("syncs")
    .doc(code)
    .collection("meta")
    .doc("push")
    .set({
      subscription: subscription.toJSON(),
      reminderTime,
      enabled: true,
      updatedAt: Date.now(),
    });
  return subscription;
}

async function updatePushReminderTime(reminderTime) {
  const code = getSyncCode();
  if (!code) return;
  await getDb().collection("syncs").doc(code).collection("meta").doc("push").set(
    { reminderTime, updatedAt: Date.now() },
    { merge: true }
  );
}

async function unsubscribeFromPush() {
  const code = getSyncCode();
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  if (code) {
    await getDb().collection("syncs").doc(code).collection("meta").doc("push").set(
      { enabled: false, updatedAt: Date.now() },
      { merge: true }
    );
  }
}
