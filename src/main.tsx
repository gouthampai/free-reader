import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { forwardConsoleToLog } from "./lib/logging";
import { loadSettings } from "./lib/settings";

forwardConsoleToLog();
// Apply the saved theme before the first paint so the window never shows the wrong colors.
document.documentElement.dataset.theme = loadSettings().theme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
