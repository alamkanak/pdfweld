import { writeFileSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const logo = readFileSync("public/icon.svg", "utf8").replace(
  /<svg[^>]*>|<\/svg>/g,
  "",
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#202123"/>
<path d="M0 112H1200M0 530H1200" stroke="#393b40"/>
<g transform="translate(58 30) scale(.8)">${logo}</g>
<text x="123" y="73" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700">pdfweld<tspan fill="#bfe780">.</tspan></text>
<text x="60" y="224" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700">PDF tools.</text>
<text x="60" y="305" fill="#bfe780" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700">On your device.</text>
<text x="63" y="376" fill="#dddfe5" font-family="Arial, Helvetica, sans-serif" font-size="25">Edit · Compress · Combine · Fill &amp; sign</text>
<text x="63" y="420" fill="#a4a6ae" font-family="Arial, Helvetica, sans-serif" font-size="22">Private PDF tools for desktop and phone.</text>
<g transform="translate(888 184)"><rect x="22" y="15" width="188" height="258" rx="8" fill="#393b40"/><rect width="188" height="258" rx="8" fill="#f8f7f2"/><path d="M32 53H120M32 78H156M32 103H138" stroke="#a4a6ae" stroke-width="7"/><rect x="32" y="140" width="124" height="68" rx="8" fill="#bfe780"/><path d="m69 173 17 17 34-37" fill="none" stroke="#29372f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g>
<text x="63" y="587" fill="#a4a6ae" font-family="Arial, Helvetica, sans-serif" font-size="22">No uploads. No account. Your files stay yours.</text>
</svg>`;
writeFileSync("public/social-card.svg", svg);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(svg);
  await page.locator("svg").screenshot({ path: "public/social-card.png" });
} finally {
  await browser.close();
}
console.log("Generated public/social-card.png (1200×630) and its SVG source.");
