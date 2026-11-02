import { renderToStaticMarkup } from "react-dom/server";
import { Home } from "../components/Home";
import { NotFound } from "./PublicContent";
import { homeTools, type HomeToolId } from "../lib/home-tools";
import { siteTitle, siteDescription, toolPages } from "./pages";
export const pages = homeTools.map(({ id, label }) => ({
  id,
  label,
  ...toolPages[id],
}));
export const defaults = { title: siteTitle, description: siteDescription };
export function renderPage(id: HomeToolId | null) {
  return renderToStaticMarkup(<Home staticTool={id} />);
}
export function render404(base: string) {
  return renderToStaticMarkup(<NotFound base={base} />);
}
