import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Real UI + real worker jobs. Cadence remains the browser's native rAF cadence.
export async function benchmarkHomeTools(page, profile, errors = []) {
  const results = [];
  const directory = resolve(".cache/home-tool-benchmark");
  mkdirSync(directory, { recursive: true });
  const scans = Array.from({ length: 4 }, (_, i) => {
    const path = resolve(directory, `Scan-${i + 1}.pdf`);
    copyFileSync("public/benchmark-scans.pdf", path);
    return path;
  });
  const pages = resolve("public/benchmark-100-pages.pdf");
  for (const task of [
    {
      id: "compress",
      label: "Compress PDF",
      action: "Compress files",
      files: [scans[0]],
      expected: 1,
    },
    {
      id: "combine",
      label: "Combine files",
      action: "Combine files",
      files: scans,
      expected: 1,
    },
    {
      id: "split",
      label: "Split PDF",
      action: "Run Split PDF",
      files: [pages],
      expected: 10,
    },
  ]) {
    await page.goto("http://127.0.0.1:4174");
    await page.waitForFunction(() => !!window.pdfweld);
    if (task.id === "split")
      await page
        .getByRole("navigation", { name: "Library navigation" })
        .getByRole("button", { name: "All tools", exact: true })
        .click();
    await page
      .getByRole("button", { name: `Start ${task.label}`, exact: true })
      .click();
    await page.evaluate(() => window.pdfweld.metrics.start());
    await delay(650);
    const idle = await page.evaluate(() =>
      window.pdfweld.metrics.stop("Tool idle cadence calibration"),
    );
    await page.evaluate(() => window.pdfweld.metrics.start());
    const start = performance.now();
    // Native file paths avoid charging Playwright's base64 payload decoding
    // to the app. File reads, IPC copies, inspection, and processing remain measured.
    await page
      .getByLabel("Source files", { exact: true })
      .setInputFiles(task.files);
    const action = page.getByRole("button", { name: task.action, exact: true });
    await action.waitFor();
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll("[data-task-file]")];
      return (
        rows.length && rows.every((row) => row.textContent.includes("Ready"))
      );
    });
    const inspectMs = performance.now() - start;
    if (task.id === "split")
      await page.getByLabel("Pages per file", { exact: true }).fill("10");
    const processing = performance.now();
    await action.click();
    await page
      .getByRole("heading", {
        name: `${task.expected} ${task.expected === 1 ? "file" : "files"} ready`,
        exact: true,
      })
      .waitFor();
    const processingMs = performance.now() - processing;
    const outputCount = await page.locator("[data-task-output]").count();
    let zipMs = null;
    if (task.id === "split") {
      const zipStart = performance.now();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download all as ZIP", exact: true })
        .click();
      await download;
      zipMs = performance.now() - zipStart;
    }
    // Capture completed UI paint, without adding idle samples to the job measurement.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const report = await page.evaluate(
      (label) => window.pdfweld.metrics.stop(label),
      `Home ${task.label}: file inspection, processing, results${zipMs === null ? "" : ", ZIP download"}`,
    );
    const editorOpened = await page.evaluate(
      () => !!window.pdfweld.state().info,
    );
    const item = {
      profile,
      tool: task.id,
      files: task.files.length,
      inputBytes: task.files.reduce((n, path) => n + statSync(path).size, 0),
      inspectMs,
      processingMs,
      zipMs,
      outputCount,
      editorOpened,
      report,
      idleCalibration: idle,
      budgets: {
        frameCadence:
          report.frameP95 <= (1000 / Math.min(120, idle.displayHz)) * 1.5,
        outputsReady: outputCount === task.expected,
        stayedOnHome: !editorOpened,
        noErrors: errors.length === 0,
        mainThreadResponsive:
          report.longTaskMs === null ||
          report.longTaskMs < report.durationMs * 0.1,
      },
    };
    results.push(item);
    console.log(
      `${profile} / home ${task.id}: ${processingMs.toFixed(0)} ms job, frame p95 ${report.frameP95.toFixed(2)} ms, ${report.longTasks ?? "unavailable"} long tasks`,
    );
  }
  return results;
}
