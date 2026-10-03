/**
 * Los tipos de cosas que compara un parche de Project Zomboid (2026-10-02), en el orden en que se muestran. Suelto y sin
 * datos: lo usan los renglones de "Qué cambió" de cada ficha (`fields.ts`), que así no cargan el índice de versiones.
 */
export type Kind = "items" | "recipes" | "traits" | "professions" | "skills" | "moodles" | "sandbox";

export const KINDS: Kind[] = ["items", "recipes", "traits", "professions", "skills", "moodles", "sandbox"];
