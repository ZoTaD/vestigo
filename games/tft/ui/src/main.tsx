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
// Deadlock con la dirección A del rediseño (2026-09-16): cada pestaña reescrita
// vive acá, y lo que reemplaza se borra de `codex.css` en vez de pisarse.
import "./styles/deadlock.css";
import "./styles/deadlock-heroes.css";
// Vestigo News (2026-09-17): la única página con paleta y fuentes propias, todo bajo `.vn`.
import "./styles/news.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
