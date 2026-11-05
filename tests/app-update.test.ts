import { afterEach, test, expect, vi } from "vitest";
import {
  activateAppUpdate,
  consumeUpdateReload,
  reloadForAppUpdate,
} from "../src/lib/app-update";

class Worker extends EventTarget {
  state: ServiceWorkerState;
  messages: unknown[] = [];
  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  transition(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
function registration(worker?: Worker, installing = false) {
  return {
    waiting: installing ? null : worker,
    installing: installing ? worker : null,
  } as unknown as ServiceWorkerRegistration;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  consumeUpdateReload();
});

test("activation waits until the waiting worker is actually activated", async () => {
  const worker = new Worker("installed");
  let complete = false;
  const result = activateAppUpdate(registration(worker)).then(() => {
    complete = true;
  });
  expect(worker.messages).toEqual([{ type: "SKIP_WAITING" }]);
  worker.transition("activating");
  await Promise.resolve();
  expect(complete).toBe(false);
  worker.transition("activated");
  await result;
  expect(complete).toBe(true);
});
test("an installing worker finishes installation before activation is requested", async () => {
  const worker = new Worker("installing");
  const result = activateAppUpdate(registration(worker, true));
  expect(worker.messages).toEqual([]);
  worker.transition("installed");
  expect(worker.messages).toHaveLength(1);
  worker.transition("activated");
  await result;
});
test("a stale prompt whose worker was already activated can proceed to reload", async () => {
  await expect(activateAppUpdate(registration())).resolves.toBeUndefined();
  await expect(activateAppUpdate(undefined)).resolves.toBeUndefined();
});
test("a superseded worker reports a retryable error", async () => {
  const worker = new Worker("installed");
  const result = activateAppUpdate(registration(worker));
  worker.transition("redundant");
  await expect(result).rejects.toThrow("replaced");
});
test("a stalled update times out and cannot activate later through a stale listener", async () => {
  vi.useFakeTimers();
  const worker = new Worker("installing");
  const result = expect(
    activateAppUpdate(registration(worker, true), 20),
  ).rejects.toThrow("did not finish");
  await vi.advanceTimersByTimeAsync(20);
  await result;
  worker.transition("installed");
  expect(worker.messages).toEqual([]);
});
test("only the requested update reload bypasses the unsaved-work warning, once", () => {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  expect(consumeUpdateReload()).toBe(false);
  reloadForAppUpdate();
  expect(reload).toHaveBeenCalledOnce();
  expect(consumeUpdateReload()).toBe(true);
  expect(consumeUpdateReload()).toBe(false);
});
test("a failed reload restores normal unsaved-work protection", () => {
  vi.stubGlobal("window", {
    location: {
      reload() {
        throw new Error("Navigation failed");
      },
    },
  });
  expect(() => reloadForAppUpdate()).toThrow("Navigation failed");
  expect(consumeUpdateReload()).toBe(false);
});
