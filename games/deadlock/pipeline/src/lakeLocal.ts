import { connect, listPartitions, localizeExtras, runSnapshotBuild } from "./snapshot";

/**
 * La copia local de los deltas y residuales para el resto de la corrida (ver
 * `LocalExtras` en snapshot.ts). Uso: `npm run lake:local -- <directorio>`.
 *
 * Si el lake no está, sale con 0 sin dejar el índice y los pasos leen del lake
 * como antes.
 */
runSnapshotBuild("lake:local", async () => {
  const dir = process.argv[2];
  if (!dir) throw new Error("falta el directorio: npm run lake:local -- <directorio>");
  await listPartitions();
  const con = await connect();
  const t0 = Date.now();
  const { urls } = await localizeExtras(con, dir);
  console.log(`copia local de ${urls.length} deltas y residuales en ${Math.round((Date.now() - t0) / 1000)} s`);
});
