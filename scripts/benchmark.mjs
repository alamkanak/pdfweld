import { firefoxLaunchOptions } from "./firefox-env.mjs";
import { benchmarkHomeTools } from "./benchmark-home-tools.mjs";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium, firefox, webkit, devices } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (build.status) process.exit(build.status);
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
  ],
  { stdio: "ignore" },
);
let exit = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    exit = true;
    server.kill();
  });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch("http://127.0.0.1:4174")).ok) break;
  } catch {}
  await delay(100);
}
const scenarios = process.argv.includes("--quick")
  ? [
      {
        name: "desktop-chromium",
        browser: chromium,
        context: { viewport: { width: 1440, height: 900 } },
      },
    ]
  : [
      {
        name: "desktop-chromium",
        browser: chromium,
        context: { viewport: { width: 1440, height: 900 } },
      },
      {
        name: "mobile-chromium",
        browser: chromium,
        context: devices["Pixel 7"],
      },
      {
        name: "desktop-firefox",
        browser: firefox,
        context: { viewport: { width: 1440, height: 900 } },
      },
      { name: "mobile-webkit", browser: webkit, context: devices["iPhone 13"] },
    ];
const results = [];
const homeTools = [];
const requestedProfile = process.argv
  .find((arg) => arg.startsWith("--profile="))
  ?.split("=")[1];
const selectedScenarios = requestedProfile
  ? scenarios.filter((s) => s.name === requestedProfile)
  : scenarios;
try {
  if (!selectedScenarios.length)
    throw new Error(`Unknown benchmark profile: ${requestedProfile}`);
  for (const scenario of selectedScenarios) {
    const browser = await scenario.browser.launch({
      ...(scenario.browser === firefox ? firefoxLaunchOptions() : {}),
      headless: !process.argv.includes("--headed"),
    });
    try {
      const context = await browser.newContext({
        ...scenario.context,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:4174");
      await page.waitForFunction(() => !!window.pdfweld);
      const coldStart = performance.now();
      await page.evaluate(() => window.pdfweld.openSample());
      await page.waitForFunction(
        () => document.querySelector('[data-page="0"] > canvas')?.width > 1,
      );
      const openMs = performance.now() - coldStart;
      await page.evaluate(() => window.pdfweld.metrics.start());
      await delay(1200);
      const idle = await page.evaluate(() =>
        window.pdfweld.metrics.stop("Idle cadence calibration"),
      );
      for (const corpus of ["sample", "100-pages", "scanned-pages"]) {
        let documentOpenMs = openMs;
        const corpusStart = performance.now();
        if (corpus === "100-pages") {
          await page.evaluate(() => window.pdfweld.openBenchmark());
          await page.waitForFunction(
            () => document.querySelector('[data-page="0"] > canvas')?.width > 1,
          );
        }
        if (corpus === "scanned-pages") {
          await page.evaluate(() => window.pdfweld.openScans());
          await page.waitForFunction(
            () => document.querySelector('[data-page="0"] > canvas')?.width > 1,
          );
        }
        if (corpus !== "sample")
          documentOpenMs = performance.now() - corpusStart;
        const report = await page.evaluate(() =>
          window.pdfweld.benchmark(4000),
        );
        const annotationsBefore = await page.evaluate(
          async () =>
            (await window.pdfweld.engine.call("details", 0)).annotations.length,
        );
        await page.evaluate(() => {
          window.pdfweld.metrics.start();
          window.pdfweld.state().set({ tool: "ink" });
        });
        const canvas = page.locator('[data-page="0"] canvas').last();
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(
            box.x + box.width * 0.1,
            box.y + box.height * 0.3,
          );
          await page.mouse.down();
          for (let i = 0; i < 120; i++)
            await page.mouse.move(
              box.x + box.width * (0.1 + i / 150),
              box.y + box.height * (0.3 + Math.sin(i / 8) * 0.025),
            );
          await page.mouse.up();
        }
        const inkReport = await page.evaluate(() =>
          window.pdfweld.metrics.stop(
            "Pen: 120 pointer samples and PDF annotation commit",
          ),
        );
        const annotationsAfter = await page.evaluate(
          async () =>
            (await window.pdfweld.engine.call("details", 0)).annotations.length,
        );
        const zoomStarted = performance.now();
        await page.evaluate(() =>
          window.pdfweld.state().set({ tool: "select", zoom: 4 }),
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await page.waitForFunction(() => {
          const c = window.pdfweld.cache();
          return !c.running && c.queued === 0;
        });
        const cache = await page.evaluate(() => ({
          ...window.pdfweld.cache(),
          canvasBytes: Array.from(
            document.querySelectorAll("[data-page] canvas"),
          ).reduce((n, c) => n + c.width * c.height * 4, 0),
          activeCanvases: Array.from(
            document.querySelectorAll("[data-page] canvas"),
          ).filter((c) => c.width > 1).length,
        }));
        await page.evaluate(() => window.pdfweld.state().set({ zoom: 1 }));
        const item = {
          profile: scenario.name,
          corpus,
          coldOpenMs: openMs,
          documentOpenMs,
          committedStrokes: annotationsAfter - annotationsBefore,
          scroll: report,
          ink: inkReport,
          zoomSettleMs: performance.now() - zoomStarted,
          idleCalibration: idle,
          cache,
          errors,
          budgets: {
            frameCadence:
              report.frameP95 <= (1000 / Math.min(120, idle.displayHz)) * 1.25,
            inputCpu: inkReport.inputSamples > 0 && inkReport.inputP95 < 8.33,
            committedInk: annotationsAfter > annotationsBefore,
            boundedCache: cache.cachedBytes <= 48 * 1024 * 1024,
            noErrors: errors.length === 0,
          },
        };
        results.push(item);
        console.log(
          `${scenario.name} / ${corpus}: ${report.fps.toFixed(1)} FPS, frame p95 ${report.frameP95.toFixed(2)} ms, ink handler p95 ${inkReport.inputP95.toFixed(3)} ms, ${report.longTasks ?? "unavailable"} long tasks`,
        );
      }
      homeTools.push(
        ...(await benchmarkHomeTools(page, scenario.name, errors)),
      );
      await context.close();
    } finally {
      await browser.close();
    }
    if (exit) break;
  }
  mkdirSync("reports", { recursive: true });
  const name =
    process.argv.find((a) => a.startsWith("--output="))?.split("=")[1] ||
    (requestedProfile ? `performance-${requestedProfile}` : "performance");
  const output = {
    created: new Date().toISOString(),
    environment: `${process.argv.includes("--headed") ? "Headed" : "Headless"} Playwright browsers on the current host; mobile profiles emulate viewport and touch, not real phone hardware.`,
    targetFps: 120,
    method:
      "Unmodified requestAnimationFrame cadence; no fake timers, forced refresh flags, or disabled frame limits. Cold open includes WASM initialization. Scrolling uses actual document viewport and visible-page rendering. Ink uses 120 real pointer moves. CPU values measure handler work, not pen-to-photon latency.",
    results,
    homeTools,
  };
  writeFileSync(`reports/${name}.json`, JSON.stringify(output, null, 2));
  console.log(`Reports saved to reports/${name}.json`);
  if (
    [...results, ...homeTools].some((item) =>
      Object.values(item.budgets).includes(false),
    )
  ) {
    console.error(
      "Performance or correctness budgets failed; inspect the report.",
    );
    process.exitCode = 1;
  }
  if (
    process.argv.includes("--require-120") &&
    (results.some((r) => !r.scroll.targetMet) ||
      homeTools.some((r) => !r.report.targetMet))
  )
    process.exitCode = 1;
} finally {
  server.kill();
}
