import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
export const jsonScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function pageHead(site, page, defaults) {
  const title = page ? `${page.title} | PDFWeld` : defaults.title;
  const description = page?.summary || defaults.description;
  const path = page ? `tools/${page.slug}/` : "";
  const url = site.url ? new URL(path, site.url).href : null;
  const image = site.url ? new URL("social-card.png", site.url).href : null;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${site.url ? "index, follow, max-image-preview:large" : "noindex, follow"}">`,
    `<meta name="application-name" content="PDFWeld">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="PDFWeld">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  ];
  if (site.verification)
    tags.push(
      `<meta name="google-site-verification" content="${escapeHtml(site.verification)}">`,
    );
  if (url) {
    tags.push(
      `<meta name="pdfweld-site-url" content="${escapeHtml(site.url)}">`,
      `<link rel="canonical" href="${escapeHtml(url)}">`,
      `<link rel="sitemap" type="application/xml" href="${escapeHtml(new URL("sitemap.xml", site.url).href)}">`,
      `<meta property="og:url" content="${escapeHtml(url)}">`,
      `<meta property="og:image" content="${escapeHtml(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="PDFWeld — private PDF tools for your browser">`,
      `<meta name="twitter:image" content="${escapeHtml(image)}">`,
      `<meta name="twitter:image:alt" content="PDFWeld — private PDF tools for your browser">`,
    );
    const appId = `${site.url}#application`;
    const graph = [
      {
        "@type": "WebSite",
        "@id": `${site.url}#website`,
        name: "PDFWeld",
        url: site.url,
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": appId,
        name: "PDFWeld",
        url: site.url,
        description: defaults.description,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web browser",
        browserRequirements: "JavaScript and WebAssembly",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        image,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: title,
        description,
        inLanguage: "en",
        isPartOf: { "@id": `${site.url}#website` },
        mainEntity: { "@id": appId },
      },
    ];
    if (page)
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "PDFWeld", item: site.url },
          { "@type": "ListItem", position: 2, name: page.label, item: url },
        ],
      });
    tags.push(
      `<script type="application/ld+json">${jsonScript({ "@context": "https://schema.org", "@graph": graph })}</script>`,
    );
  }
  return tags.join("\n");
}
export async function generateSeo(site, directory = "dist") {
  await build({
    configFile: false,
    logLevel: "error",
    base: site.base,
    plugins: [
      {
        name: "seo-worker-stub",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("?worker")) return "\0seo-worker";
        },
        load(id) {
          if (id === "\0seo-worker")
            return 'export default class Worker { constructor() { throw new Error("Workers cannot run during static rendering."); } }';
        },
      },
    ],
    build: {
      ssr: "src/seo/render.tsx",
      outDir: ".cache/seo-render",
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: "render.mjs" } },
    },
  });
  const render = await import(
    `${pathToFileURL(resolve(".cache/seo-render/render.mjs")).href}?build=${Date.now()}`
  );
  const template = readFileSync(`${directory}/index.html`, "utf8");
  if (
    !template.includes("<!--seo-head-start-->") ||
    !template.includes("<!--seo-app-->")
  )
    throw new Error("SEO template markers are missing.");
  const generate = (page) =>
    template
      .replace(
        /<!--seo-head-start-->[\s\S]*?<!--seo-head-end-->/,
        pageHead(site, page, render.defaults),
      )
      .replace("<!--seo-app-->", render.renderPage(page?.id || null));
  writeFileSync(`${directory}/index.html`, generate(null));
  for (const page of render.pages) {
    const folder = `${directory}/tools/${page.slug}`;
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/index.html`, generate(page));
  }
  const css = [...template.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
    .map((match) => match[0])
    .join("\n");
  writeFileSync(
    `${directory}/404.html`,
    `<!doctype html><html lang="en" class="h-full bg-studio-900"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | PDFWeld</title><meta name="robots" content="noindex, follow"><link rel="icon" href="${escapeHtml(site.base)}icon.svg">${css}</head><body class="m-0 h-full font-sans text-sm text-studio-200 antialiased">${render.render404(site.base)}</body></html>`,
  );
  writeFileSync(`${directory}/.nojekyll`, "");
  if (site.cname) writeFileSync(`${directory}/CNAME`, `${site.cname}\n`);
  else rmSync(`${directory}/CNAME`, { force: true });
  if (site.url) {
    const urls = [
      site.url,
      ...render.pages.map(
        (page) => new URL(`tools/${page.slug}/`, site.url).href,
      ),
    ];
    writeFileSync(
      `${directory}/sitemap.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`,
    );
    writeFileSync(
      `${directory}/robots.txt`,
      `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", site.url).href}\n`,
    );
  } else {
    rmSync(`${directory}/sitemap.xml`, { force: true });
    writeFileSync(`${directory}/robots.txt`, "User-agent: *\nDisallow: /\n");
    console.warn(
      "No public site URL found. Set SITE_URL for an indexable production build; npm run deploy derives it from the GitHub repository.",
    );
  }
  writeFileSync(
    `${directory}/site-config.json`,
    `${JSON.stringify({ url: site.url, base: site.base, paths: [site.base, ...render.pages.map((page) => `${site.base}tools/${page.slug}/`)] }, null, 2)}\n`,
  );
  console.log(
    `Prerendered Home + ${render.pages.length} PDF tools; generated sitemap, robots.txt, social metadata, JSON-LD, and GitHub Pages 404.`,
  );
}
