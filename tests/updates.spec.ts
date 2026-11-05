import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PDFEngine } from "../src/lib/engine";

let server: Server,
  address: string,
  version = 1;
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    if (!pathname.startsWith("/pdfweld/")) {
      response.writeHead(404).end();
      return;
    }
    const path = resolve("dist", pathname.replace(/^\/pdfweld\//, ""));
    try {
      const file = (await stat(path)).isDirectory()
        ? resolve(path, "index.html")
        : path;
      let content = await readFile(file);
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".pdf": "application/pdf",
        ".json": "application/json",
      };
      response.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      response.setHeader("Cache-Control", "no-store");
      if (pathname === "/pdfweld/sw.js")
        content = Buffer.concat([
          content,
          Buffer.from(
            `\nself.addEventListener('message',event=>{if(event.data?.type==='TEST_VERSION')event.ports[0].postMessage(${version});});\n`,
          ),
        ]);
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${(server.address() as { port: number }).port}/pdfweld/`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
test.beforeEach(async ({ browserName }) => {
  test.skip(
    browserName === "webkit",
    "Headless WebKit service-worker lifecycle support varies by host.",
  );
  version++;
});

async function installed(page: Page) {
  await page.goto(address);
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller && !!window.pdfweld,
  );
}
async function offerUpdate(page: Page) {
  version++;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration!.update();
  });
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toBeVisible();
}
async function controllerVersion(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          resolve(event.data);
          channel.port1.close();
        };
        navigator.serviceWorker.controller!.postMessage(
          { type: "TEST_VERSION" },
          [channel.port2],
        );
      }),
  );
}

test("Update activates the waiting version, reloads once, and removes the popup", async ({
  page,
}) => {
  await installed(page);
  const first = await controllerVersion(page);
  await offerUpdate(page);
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  expect(await controllerVersion(page)).toBeGreaterThan(first);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
});

test("Update saves the current text draft before reloading without an unsaved-work dialog", async ({
  page,
}) => {
  await installed(page);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const paper = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(
    paper.x + paper.width * 0.15,
    paper.y + paper.width * 0.2,
  );
  await page
    .getByRole("textbox", { name: "Text on PDF", exact: true })
    .fill("Keep this draft when updating.");
  const id = await page.evaluate(() => window.pdfweld.state().id);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await offerUpdate(page);
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  expect(dialogs).toEqual([]);
  const bytes = await page.evaluate(
    (id) =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("pdfweld-library");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            row = db
              .transaction("files", "readonly")
              .objectStore("files")
              .get(id);
          row.onsuccess = () => {
            resolve(Array.from(row.result.bytes));
            db.close();
          };
          row.onerror = () => {
            reject(row.error);
            db.close();
          };
        };
      }),
    id,
  );
  const saved = new PDFEngine();
  saved.open(new Uint8Array(bytes), "Recovery.pdf");
  expect(
    saved
      .details(0)
      .annotations.some((a) => a.text === "Keep this draft when updating."),
  ).toBe(true);
});

test("Update handles a worker that was already waiting before this page opened", async ({
  page,
}) => {
  await installed(page);
  await offerUpdate(page);
  await page.reload();
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toBeVisible();
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
});

test("a version activated elsewhere stays available until this tab chooses to reload", async ({
  page,
}) => {
  await installed(page);
  await offerUpdate(page);
  let reloads = 0;
  page.on("domcontentloaded", () => reloads++);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration!.waiting!;
    const activated = new Promise<void>((resolve) =>
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
      }),
    );
    worker.postMessage({ type: "SKIP_WAITING" });
    await activated;
  });
  await expect.poll(() => controllerVersion(page)).toBe(version);
  expect(reloads).toBe(0);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toBeVisible();
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  expect(reloads).toBe(1);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
});

test("Later dismisses an offered update without reloading", async ({
  page,
}) => {
  await installed(page);
  await offerUpdate(page);
  let reloads = 0;
  page.on("domcontentloaded", () => reloads++);
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
  expect(reloads).toBe(0);
});

test("a fully downloaded update can be applied offline", async ({
  page,
  context,
}) => {
  await installed(page);
  await offerUpdate(page);
  await context.setOffline(true);
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  expect(await controllerVersion(page)).toBe(version);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
});

test("failed recovery keeps the document open and allows retry instead of losing edits", async ({
  page,
}) => {
  await installed(page);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    await window.pdfweld.state().mark({
      tool: "text",
      page: 0,
      rect: [40, 100, 300, 170],
      text: "Keep this edit if storage fails.",
      color: "#29372f",
      width: 18,
      opacity: 1,
      author: "Test",
    });
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await offerUpdate(page);
  let reloads = 0;
  page.on("domcontentloaded", () => reloads++);
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Export the PDF before updating",
  );
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  expect(reloads).toBe(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations[0].text,
    ),
  ).toBe("Keep this edit if storage fails.");
  await page.evaluate(() =>
    (window as unknown as { restorePut: () => void }).restorePut(),
  );
  const navigation = page.waitForEvent("domcontentloaded");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await navigation;
  await page.waitForFunction(() => !!window.pdfweld);
  expect(reloads).toBe(1);
  await expect(
    page.getByText("A fresh studio is ready.", { exact: true }),
  ).toHaveCount(0);
});
