import ReactDOM from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./index.css";
import App from "./App";
import { initialPublicRoute } from "./seo/navigation";
import { NotFound } from "./seo/PublicContent";
const route = initialPublicRoute();
ReactDOM.createRoot(document.getElementById("root")!).render(
  route === "not-found" ? (
    <NotFound base={import.meta.env.BASE_URL} />
  ) : (
    <App />
  ),
);
