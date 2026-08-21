import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/codex.css";
// Después del códex a propósito: la portada pisa reglas suyas, y con la misma
// especificidad gana la que se declara última.
import "./styles/home.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
