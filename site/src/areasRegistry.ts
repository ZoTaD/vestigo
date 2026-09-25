import type * as AreasModule from "./areas";

/**
 * Cómo llega `areas.ts` a la cáscara sin que la cáscara lo importe (2026-09-25).
 *
 * `areas.ts` tiene los `import()` de cada juego, o sea los nombres con hash de
 * sus chunks: cambian en cada publicación. Si `App` o `RouteLink` lo
 * importaran, su chunk también cambiaría en cada publicación de Deadlock, y con
 * él todo lo que depende de la cáscara: los que vuelven bajarían todo el JS de
 * nuevo cuatro veces por día (medido: un dato de `heroes.json` cambiaba 30
 * archivos). Así, `areas.ts` vive en la entrada (un archivo chico que sí cambia)
 * y se lo pasa a la cáscara, que queda estable con React en su propio chunk.
 *
 * `main.tsx` y `entry-server.tsx` llaman a `provideAreas` antes de renderizar.
 */
export type Areas = typeof AreasModule;

let current: Areas | null = null;

export function provideAreas(areas: Areas): void {
  current = areas;
}

export function areas(): Areas {
  if (!current) throw new Error("areas.ts no se registró: main.tsx y entry-server.tsx llaman a provideAreas antes de renderizar.");
  return current;
}
