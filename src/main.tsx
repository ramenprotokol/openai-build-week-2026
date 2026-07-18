import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/fragment-mono/400.css";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
