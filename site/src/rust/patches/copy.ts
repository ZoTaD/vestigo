/**
 * Los textos de la pestaña Parches de Rust (2026-10-09), en inglés y español. Las notas son las oficiales de Facepunch;
 * acá va lo nuestro. El prerender la importa para el `<head>` de cada edición.
 */
import { useLang } from "../../i18n";

type Seo = { title: string; description: string };

export interface PatchesCopy {
  h1: string;
  lede: (n: number) => string;
  back: string;
  missing: string;
  inEnglish: string;
  blog: string;
  steam: string;
  credit: string;
  count: (n: number) => string;
  seo: { edition: (name: string) => Seo };
}

const EN: PatchesCopy = {
  h1: "Rust patch notes",
  lede: (n) => `The official notes of the last ${n} Rust updates, from the newest. Every item they mention links to its page.`,
  back: "All patches",
  missing: "That patch isn't here (or changed its name). These are all of them.",
  inEnglish: "",
  blog: "Full changelist",
  steam: "Steam announcement",
  credit: "Patch notes by Facepunch Studios, as published on Steam.",
  count: (n) => (n === 1 ? "1 section" : `${n} sections`),
  seo: {
    edition: (name) => ({
      title: `Rust ${name} Update: Patch Notes | Vestigo`,
      description: `The official patch notes of the Rust ${name} update, section by section, with links to every item mentioned and to Facepunch's full changelist.`,
    }),
  },
};

const ES: PatchesCopy = {
  h1: "Parches de Rust",
  lede: (n) => `Las notas oficiales de las últimas ${n} actualizaciones de Rust, de la más nueva a la más vieja. Cada objeto que nombran enlaza a su ficha.`,
  back: "Todos los parches",
  missing: "Ese parche no está (o cambió de nombre). Acá están todos.",
  inEnglish: "Esta edición todavía no está traducida: va en inglés, tal como la publicó Facepunch.",
  blog: "Lista completa de cambios",
  steam: "Anuncio en Steam",
  credit: "Notas del parche de Facepunch Studios, publicadas en Steam. Traducción de Vestigo.",
  count: (n) => (n === 1 ? "1 sección" : `${n} secciones`),
  seo: {
    edition: (name) => ({
      title: `Parche ${name} de Rust: notas de la actualización | Vestigo`,
      description: `Las notas oficiales de la actualización ${name} de Rust, sección por sección, con enlaces a los objetos que nombra y a la lista completa de cambios.`,
    }),
  },
};

export const PATCHES_COPY: Record<"en" | "es", PatchesCopy> = { en: EN, es: ES };
export const usePatchesCopy = (): PatchesCopy => PATCHES_COPY[useLang().lang];
