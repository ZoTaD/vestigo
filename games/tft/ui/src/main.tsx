import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Los tokens van primero: son las variables que todas las demás hojas leen.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/codex.css";
// Después del códex a propósito: la portada pisa reglas suyas, y con la misma
// especificidad gana la que se declara última.
import "./styles/home.css";
// La cáscara y las primitivas del rediseño del 2026-09-06 van al final por la
// misma razón: donde compiten con una regla vieja de la misma especificidad,
// gana la nueva.
import "./styles/shell.css";
import "./styles/primitives.css";
import "./styles/views.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
