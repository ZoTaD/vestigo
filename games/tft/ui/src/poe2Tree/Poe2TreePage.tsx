/**
 * La pestaña "Árbol de pasivas" de PoE2. El planificador (canvas, ~1,5 MB de
 * datos) se carga aparte y sólo en el navegador; el título y la explicación van
 * en el HTML para los buscadores y para quien llega sin JavaScript.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useTreeCopy } from "./copy";
import treeMeta from "@poe2/tree/meta.json";

const Poe2Tree = lazy(() => import("./Poe2Tree"));

export default function Poe2TreePage() {
  const t = useTreeCopy();
  // El canvas sólo existe en el navegador: en el prerender queda el lugar vacío.
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  return (
    <main className="p2 p2t-page">
      <h1 className="visually-hidden">{t.h1}</h1>
      {client ? (
        <Suspense fallback={<div className="p2t-stage"><p className="p2t-center">{t.loading}</p></div>}>
          <Poe2Tree />
        </Suspense>
      ) : (
        <div className="p2t-stage"><p className="p2t-center">{t.loading}</p></div>
      )}
      <section className="p2t-how">
        <p className="p2t-lede">{t.lede}</p>
        <h2>{t.howTitle}</h2>
        {t.how.map((p, i) => <p key={i}>{p}</p>)}
        <p className="p2t-from">{t.fromGame(treeMeta.version)}</p>
      </section>
    </main>
  );
}
