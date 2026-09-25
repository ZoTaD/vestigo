/**
 * La pestaña "Regex" de PoE2. El generador se carga aparte y sólo en el
 * navegador; el título y la explicación van en el HTML para los buscadores.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useRegexCopy } from "./copy";

const Poe2Regex = lazy(() => import("./Poe2Regex"));

export default function Poe2RegexPage() {
  const t = useRegexCopy();
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  return (
    <main className="p2 p2-page p2r-page">
      <div className="p2-title">
        <h1>{t.h1}</h1>
      </div>
      <p className="p2r-lede">{t.lede}</p>
      {client ? (
        <Suspense fallback={<p className="p2-loading">{t.loading}</p>}>
          <Poe2Regex />
        </Suspense>
      ) : (
        <p className="p2-loading">{t.loading}</p>
      )}
      <section className="p2r-what">
        <h2>{t.whatTitle}</h2>
        {t.what.map((p, i) => <p key={i}>{p}</p>)}
        <p className="p2r-from">{t.fromGame}</p>
      </section>
    </main>
  );
}
