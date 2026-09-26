import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Fontes embutidas no app. Vinham do Google Fonts, que a CSP do Tauri
// (`style-src`/`font-src 'self'`) bloqueia no app instalado — ele caía na
// Georgia e na fonte do sistema — e que não abre sem internet.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/lora/wght.css";
import "@fontsource-variable/lora/wght-italic.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
