import { useApp, persist } from "../lib/store";
import {
  publicRoute,
  toolPages,
  toolPath,
  siteTitle,
  siteDescription,
} from "./pages";

const base = import.meta.env.BASE_URL;
const pageSite = () =>
  document.querySelector<HTMLMetaElement>('meta[name="pdfweld-site-url"]')
    ?.content;
function meta(selector: string, attribute: string, key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = value;
}
export function updatePublicMetadata() {
  const state = useApp.getState();
  const route = publicRoute(location.pathname, base);
  const page = route && route !== "not-found" ? toolPages[route] : null;
  const title = state.info
    ? "PDF workspace | PDFWeld"
    : page
      ? `${page.title} | PDFWeld`
      : siteTitle;
  const description = state.info
    ? "Your private PDF workspace. Documents stay on your device."
    : page?.summary || siteDescription;
  document.title = title;
  meta('meta[name="description"]', "name", "description", description);
  meta(
    'meta[name="robots"]',
    "name",
    "robots",
    !state.info && route !== "not-found" && import.meta.env.PROD && pageSite()
      ? "index, follow, max-image-preview:large"
      : "noindex, follow",
  );
  for (const [property, value] of [
    ["og:title", title],
    ["og:description", description],
  ])
    meta(`meta[property="${property}"]`, "property", property, value);
  for (const [name, value] of [
    ["twitter:title", title],
    ["twitter:description", description],
  ])
    meta(`meta[name="${name}"]`, "name", name, value);
  const site = pageSite();
  if (site && route !== "not-found") {
    const url = new URL(page ? `tools/${page.slug}/` : "", site).href;
    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (canonical) canonical.href = url;
    meta('meta[property="og:url"]', "property", "og:url", url);
    if (!state.info) {
      const script = document.head.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"]',
      );
      if (script) {
        const data = JSON.parse(script.textContent || "{}");
        const graph = data["@graph"] as Record<string, unknown>[] | undefined;
        const current = graph?.find((node) => node["@type"] === "WebPage");
        if (current && graph) {
          Object.assign(current, {
            "@id": `${url}#page`,
            url,
            name: title,
            description,
          });
          data["@graph"] = graph.filter(
            (node) => node["@type"] !== "BreadcrumbList",
          );
          if (page)
            data["@graph"].push({
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "PDFWeld",
                  item: site,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: page.title,
                  item: url,
                },
              ],
            });
          script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
        }
      }
    }
  }
}
export function initialPublicRoute() {
  const route = publicRoute(location.pathname, base);
  if (route !== "not-found") useApp.setState({ homeTool: route });
  return route;
}
export function installPublicNavigation() {
  let disposed = false,
    applyingLocation = false,
    pending = false;
  const applyLocation = async () => {
    if (disposed) return;
    const prompt = useApp.getState().prompt;
    if (prompt) {
      useApp.setState({ prompt: null });
      prompt.resolve(null);
    }
    if (useApp.getState().busy) {
      pending = true;
      return;
    }
    const route = publicRoute(location.pathname, base);
    if (route === "not-found") {
      location.reload();
      return;
    }
    applyingLocation = true;
    try {
      if (useApp.getState().dirty) await persist();
      if (!disposed)
        useApp.setState({
          info: null,
          dirty: false,
          panel: null,
          dialog: null,
          homeTool: route,
          homeAction: null,
          workspaceMode: "edit",
        });
    } finally {
      applyingLocation = false;
      if (!disposed) updatePublicMetadata();
    }
  };
  const stop = useApp.subscribe((state, previous) => {
    if (disposed) return;
    if (pending && !state.busy) {
      pending = false;
      queueMicrotask(() => void applyLocation());
      return;
    }
    if (
      state.homeTool === previous.homeTool &&
      !!state.info === !!previous.info
    )
      return;
    if (!applyingLocation && !state.info) {
      const path = state.homeTool ? toolPath(state.homeTool) : base;
      if (location.pathname !== path) history.pushState(null, "", path);
    }
    updatePublicMetadata();
  });
  const pop = () => void applyLocation();
  window.addEventListener("popstate", pop);
  updatePublicMetadata();
  return () => {
    disposed = true;
    stop();
    window.removeEventListener("popstate", pop);
  };
}
