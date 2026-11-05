/** Wait for the real worker lifecycle, including a worker installed by another
 * tab. A resolved skip-waiting message alone does not mean activation finished. */
export async function activateAppUpdate(
  registration?: ServiceWorkerRegistration,
  timeoutMs = 10000,
) {
  const worker = registration?.waiting || registration?.installing;
  if (!worker) return; // Another tab may already have activated the update.
  await new Promise<void>((resolve, reject) => {
    let sent = false;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant")
        finish(new Error("This update was replaced. Please try again."));
      else if (worker.state === "installed" && !sent) {
        sent = true;
        try {
          worker.postMessage({ type: "SKIP_WAITING" });
        } catch {
          finish(new Error("The update could not start. Please try again."));
        }
      }
    };
    const timer = setTimeout(
      () => finish(new Error("The update did not finish. Please try again.")),
      timeoutMs,
    );
    worker.addEventListener("statechange", changed);
    changed();
  });
}

let updateReload = false;
/** Only the explicitly requested reload after recovery has been saved may
 * bypass the normal unsaved-export warning. The permission is used once. */
export function consumeUpdateReload() {
  const allowed = updateReload;
  updateReload = false;
  return allowed;
}
export function reloadForAppUpdate() {
  updateReload = true;
  try {
    window.location.reload();
  } catch (error) {
    updateReload = false;
    throw error;
  }
}
