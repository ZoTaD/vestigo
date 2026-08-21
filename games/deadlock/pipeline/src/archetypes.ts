/**
 * Archetypal Analysis: las formas puras de jugar un héroe.
 *
 * **Por qué no k-means, que es lo que se probaría primero.** Un centroide es el
 * PROMEDIO de su grupo, y el promedio de "McGinnis torreta" y "McGinnis arma" es
 * una build que no juega nadie — el mismo defecto que ya está anotado contra el
 * k-means de Blitz para las comps de TFT, donde los centroides no son tableros
 * jugables y hay que "pegarlos" a uno real después.
 *
 * AA busca lo contrario: cada arquetipo es una **combinación convexa de jugadores
 * reales**, o sea que vive adentro del casco convexo de lo que la gente hizo de
 * verdad, y los que encuentra son los **puntos extremos** — las formas puras, no
 * los promedios. Y la asignación es **blanda**: un jugador puede ser 70% torreta
 * y 30% arma, que es como se juega. Ese peso no es un subproducto: es la medida
 * de cuán comprometida está una build.
 *
 * El modelo es `X ≈ A · Z` con `Z = B · X`, donde cada fila de `A` (un jugador
 * sobre los k arquetipos) y cada fila de `B` (un arquetipo sobre los n jugadores)
 * vive en el símplex — suman 1 y no son negativas. Se resuelve alternando
 * gradiente proyectado sobre `A` y sobre `B`.
 *
 * Referencias: Cutler & Breiman (1994); Mørup & Hansen, *Archetypal analysis for
 * machine learning and data mining* (2012), de donde sale la inicialización
 * FurthestSum.
 *
 * **Es determinista a propósito**: la inicialización no usa azar, así que dos
 * corridas sobre los mismos datos dan los mismos arquetipos. Una tarjeta de build
 * que se rebaraja sola cada hora sin que cambien los datos sería un bug.
 */

/** El resultado de descomponer una matriz en k arquetipos. */
export interface Decomposition {
  /** Los arquetipos, en el espacio de las features. `k × d`. */
  Z: number[][];
  /** Cuánto de cada arquetipo tiene cada jugador. `n × k`, filas que suman 1. */
  A: number[][];
  /** Con qué jugadores se arma cada arquetipo. `k × n`, filas que suman 1. */
  B: number[][];
  /** Suma de cuadrados del residuo. Con esto se elige `k`. */
  rss: number;
}

/**
 * Proyección euclídea sobre el símplex: el punto más cercano que sea no negativo
 * y sume 1. Es el algoritmo de ordenar-y-cortar, exacto y en `O(m log m)`.
 */
export function projectSimplex(v: number[]): number[] {
  const u = [...v].sort((a, b) => b - a);
  let suma = 0;
  let theta = 0;
  for (let i = 0; i < u.length; i++) {
    suma += u[i];
    const t = (suma - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

const dot = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const dist2 = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
};

/**
 * FurthestSum: elige `k` filas bien separadas para arrancar.
 *
 * **La inicialización importa más que en k-means**, porque AA busca extremos: si
 * arranca en el medio de la nube, el gradiente tiene que empujar los arquetipos
 * hacia afuera atravesando datos, y se queda en mínimos locales que son
 * promedios. FurthestSum arranca ya en los bordes.
 *
 * Empieza en la fila más lejana del centroide —determinista, y por definición
 * está en el borde— y va agregando la que maximiza la suma de distancias a las
 * ya elegidas.
 */
export function furthestSum(X: number[][], k: number): number[] {
  const n = X.length;
  if (n === 0 || k <= 0) return [];
  const d = X[0].length;
  const centro = new Array(d).fill(0);
  for (const fila of X) for (let j = 0; j < d; j++) centro[j] += fila[j] / n;

  const elegidos: number[] = [];
  let mejor = 0;
  let mejorD = -1;
  for (let i = 0; i < n; i++) {
    const dd = dist2(X[i], centro);
    if (dd > mejorD) { mejorD = dd; mejor = i; }
  }
  elegidos.push(mejor);

  // Suma de distancias a los ya elegidos, mantenida incremental.
  const suma = X.map((fila) => Math.sqrt(dist2(fila, X[mejor])));
  while (elegidos.length < Math.min(k, n)) {
    let cand = -1;
    let candD = -1;
    for (let i = 0; i < n; i++) {
      if (elegidos.includes(i)) continue;
      if (suma[i] > candD) { candD = suma[i]; cand = i; }
    }
    if (cand < 0) break;
    elegidos.push(cand);
    for (let i = 0; i < n; i++) suma[i] += Math.sqrt(dist2(X[i], X[cand]));
  }
  return elegidos;
}

const matmul = (P: number[][], Q: number[][]): number[][] => {
  const n = P.length;
  const m = Q[0].length;
  const inner = Q.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const fila = new Array(m).fill(0);
    for (let t = 0; t < inner; t++) {
      const p = P[i][t];
      if (p === 0) continue;
      const q = Q[t];
      for (let j = 0; j < m; j++) fila[j] += p * q[j];
    }
    out.push(fila);
  }
  return out;
};

const rssDe = (X: number[][], A: number[][], Z: number[][]): number => {
  const pred = matmul(A, Z);
  let s = 0;
  for (let i = 0; i < X.length; i++) s += dist2(X[i], pred[i]);
  return s;
};

/** Cuántas pasadas de gradiente por lado y por iteración. Más no mueve el RSS. */
const PASOS = 3;
const ITERACIONES = 20;
/** Cuántas veces se parte el paso al medio antes de rendirse. */
const INTENTOS = 5;

/**
 * Sobre cuántas filas se ajustan los arquetipos.
 *
 * **AA describe la FORMA de la nube, y para eso no hacen falta todas las filas.**
 * Un héroe trae ~4.700 partidas y el costo del descenso crece con `n`: la primera
 * versión, sin este tope y con 60 iteraciones, se comió **904 segundos de CPU sin
 * llegar a imprimir nada**. Con 1.200 filas los extremos son los mismos —son
 * extremos, no promedios: sobran puntos para definirlos— y el ajuste entra en
 * segundos.
 *
 * La submuestra es un **paso fijo** sobre las filas, no un sorteo: determinista, y
 * como las filas vienen ordenadas por partida no privilegia ningún tramo.
 *
 * Ojo: los pesos de cada jugador (`A`) se calculan después **para todos**, contra
 * los arquetipos ya fijos. El tope acelera el ajuste, no recorta la población.
 */
export const MAX_AJUSTE = 1200;

/**
 * Descompone `X` en `k` arquetipos.
 *
 * El paso del gradiente se elige por búsqueda hacia atrás —se prueba, y si el
 * error no baja se parte al medio— en vez de fijar una constante de Lipschitz.
 * Es más lento por iteración y mucho más difícil de romper cuando las features
 * están en escalas distintas, que es exactamente nuestro caso: prevalencias entre
 * 0 y 1 conviviendo con proporciones de almas.
 */
/**
 * Los pesos de cada fila contra arquetipos YA FIJOS.
 *
 * Es un problema por fila e independiente entre filas, así que se resuelve con
 * gradiente proyectado de paso fijo y **sin evaluar el error global**: alcanza
 * con la matriz de Gram `Z Zᵀ` (k×k) y `X Zᵀ` (n×k), las dos calculadas una sola
 * vez. Cuesta `O(n·k²)` por pasada en vez de `O(n·k·d)`, que con k=3 y d=60 son
 * veinte veces menos cuentas.
 *
 * El paso sale de la cota de Gershgorin sobre `Z Zᵀ`, que acota su mayor valor
 * propio: con eso el descenso no necesita búsqueda hacia atrás para no divergir.
 */
export function pesosContra(X: number[][], Z: number[][], pasadas = 40): number[][] {
  const k = Z.length;
  if (k === 0) return X.map(() => []);
  const Zt = transponer(Z);
  const ZZt = matmul(Z, Zt);
  const XZt = matmul(X, Zt);

  let L = 0;
  for (let i = 0; i < k; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += Math.abs(ZZt[i][j]);
    L = Math.max(L, s);
  }
  const paso = L > 0 ? 1 / L : 1;

  const A = X.map(() => new Array(k).fill(1 / k));
  for (let it = 0; it < pasadas; it++) {
    for (let i = 0; i < X.length; i++) {
      const a = A[i];
      const g = new Array(k);
      for (let j = 0; j < k; j++) {
        let s = 0;
        for (let t = 0; t < k; t++) s += a[t] * ZZt[t][j];
        g[j] = s - XZt[i][j];
      }
      A[i] = projectSimplex(a.map((v, j) => v - paso * g[j]));
    }
  }
  return A;
}

export function archetypes(X: number[][], k: number): Decomposition {
  const n = X.length;
  if (n === 0) return { Z: [], A: [], B: [], rss: 0 };
  const d = X[0].length;
  const kk = Math.max(1, Math.min(k, n));

  // El ajuste corre sobre una submuestra de paso fijo; los pesos de todos se
  // calculan al final contra los arquetipos ya encontrados.
  const salto = Math.max(1, Math.ceil(n / MAX_AJUSTE));
  const F: number[][] = [];
  for (let i = 0; i < n; i += salto) F.push(X[i]);
  const m = F.length;

  // B arranca poniendo todo el peso en las filas que eligió FurthestSum: cada
  // arquetipo ES un jugador real, y desde ahí se deja que se muevan.
  const semillas = furthestSum(F, Math.min(kk, m));
  const B: number[][] = semillas.map((idx) => {
    const fila = new Array(m).fill(0);
    fila[idx] = 1;
    return fila;
  });

  let Z = matmul(B, F);
  let A = pesosContra(F, Z);
  let rss = rssDe(F, A, Z);

  for (let iter = 0; iter < ITERACIONES; iter++) {
    const previo = rss;

    // ── A: para cada jugador, su mezcla de arquetipos ──────────────────────
    A = pesosContra(F, Z);

    // ── B: con qué jugadores se arma cada arquetipo ────────────────────────
    // grad_B = Aᵀ (A B F − F) Fᵀ
    for (let p = 0; p < PASOS; p++) {
      Z = matmul(B, F);
      const R = matmul(A, Z);
      for (let i = 0; i < m; i++) for (let j = 0; j < d; j++) R[i][j] -= F[i][j];
      const grad = matmul(matmul(transponer(A), R), transponer(F));
      bajar(B, grad, () => rssDe(F, A, matmul(B, F)));
    }
    Z = matmul(B, F);
    rss = rssDe(F, A, Z);

    // Convergió: el error dejó de bajar de forma apreciable.
    if (previo - rss < 1e-7 * Math.max(1, previo)) break;
  }

  const todos = pesosContra(X, Z);
  return { Z, A: todos, B, rss: rssDe(X, todos, Z) };
}

const transponer = (M: number[][]): number[][] => {
  if (M.length === 0) return [];
  const out: number[][] = [];
  for (let j = 0; j < M[0].length; j++) out.push(M.map((fila) => fila[j]));
  return out;
};

/**
 * Un paso de gradiente proyectado con búsqueda hacia atrás.
 *
 * Modifica `M` in situ y devuelve el error resultante. Si ningún paso mejora,
 * deja `M` como estaba: quedarse quieto es preferible a empeorar.
 */
function bajar(M: number[][], grad: number[][], error: () => number): number {
  const antes = error();
  const escala = Math.max(1e-12, Math.max(...grad.map((f) => Math.max(...f.map(Math.abs)))));
  let paso = 1 / escala;
  const copia = M.map((f) => [...f]);
  for (let intento = 0; intento < INTENTOS; intento++) {
    for (let i = 0; i < M.length; i++) {
      M[i] = projectSimplex(copia[i].map((v, j) => v - paso * grad[i][j]));
    }
    const ahora = error();
    if (ahora < antes) return ahora;
    paso /= 2;
  }
  for (let i = 0; i < M.length; i++) M[i] = copia[i];
  return antes;
}

/**
 * Cuánta varianza más tiene que explicar un arquetipo extra para justificarse.
 */
export const MEJORA_MINIMA = 0.05;

/**
 * Cuánto tienen que diferenciarse dos arquetipos para ser dos y no uno.
 *
 * Es la **máxima diferencia entre coordenadas**: dos builds son distintas si hay
 * al menos una cosa que una hace 15 puntos más que la otra. Con las features
 * normalizadas a 0..1 eso se lee directo — quince puntos de prevalencia en un
 * objeto, o quince de cuota de almas en una categoría.
 *
 * **Sin este corte, la varianza explicada sola miente.** Un héroe que todo el
 * mundo juega igual forma una nube apretada, y partirla en dos igual mejora el
 * error *en proporción* aunque los dos pedazos sean prácticamente el mismo punto:
 * el primer test que escribí devolvía 3 arquetipos para un cúmulo cuyas
 * coordenadas variaban 0,008. Un criterio relativo sobre datos casi idénticos
 * siempre pide más grupos.
 *
 * Es el mismo trabajo que hace `MAX_OVERLAP` con las builds de hoy —rechazar la
 * variedad inventada— dicho en el espacio de features en vez de en Jaccard.
 */
export const MIN_SEPARACION = 0.15;

/** Qué tan distintos son entre sí los arquetipos: el par más parecido manda. */
export function separacion(Z: number[][]): number {
  if (Z.length < 2) return Infinity;
  let peor = Infinity;
  for (let i = 0; i < Z.length; i++) {
    for (let j = i + 1; j < Z.length; j++) {
      let maxDif = 0;
      for (let c = 0; c < Z[i].length; c++) maxDif = Math.max(maxDif, Math.abs(Z[i][c] - Z[j][c]));
      peor = Math.min(peor, maxDif);
    }
  }
  return peor;
}

/**
 * Qué fracción de los jugadores tiene que describir un arquetipo para ser uno.
 *
 * **AA convierte en arquetipo a cualquier minoría, y eso no es un defecto: es lo
 * que hace.** Busca puntos extremos, y un grupo chico que hace algo distinto ES
 * extremo. Medido con datos de juguete: 120 jugadores que juegan igual salvo un
 * 10% que compra un objeto barato de más se parten en dos arquetipos, con la
 * separación bien por encima del corte. Son 12 personas, no una forma de jugar.
 *
 * Es el mismo trabajo que hace `MIN_GROUP` en partidas absolutas, dicho en
 * proporción — y hacen falta los dos, porque un 20% de un héroe poco jugado
 * sigue siendo poca gente.
 */
export const MIN_CUOTA = 0.15;

export interface OpcionesK {
  /**
   * Devuelve los arquetipos a la escala en la que `MIN_SEPARACION` significa
   * algo. **Hace falta cuando el vector viene balanceado**: ahí una coordenada
   * de objeto vale `sqrt(1/(3·n))`, así que con cuarenta objetos una diferencia
   * de "lo lleva / no lo lleva" mide 0,09 y nunca llegaría al corte de 0,15.
   */
  unscale?: (Z: number[][]) => number[][];
  /** Fracción mínima de jugadores por arquetipo. */
  minCuota?: number;
}

/** Qué fracción de los jugadores se queda cada arquetipo. */
export function cuotas(A: number[][], k: number): number[] {
  const out = new Array(k).fill(0);
  for (const { archetype } of asignar(A)) out[archetype]++;
  return out.map((c) => (A.length > 0 ? c / A.length : 0));
}

/**
 * Cuántos arquetipos merece un héroe.
 *
 * Sube a k+1 sólo si se cumplen **las tres** condiciones: que explique
 * apreciablemente más error, que los arquetipos se distingan entre sí, y que
 * cada uno describa a suficiente gente. Un héroe que se juega de una sola forma
 * publica una sola build — el caso Mo & Krill, cuya cuota de espíritu se mueve
 * 0,10 entre deciles contra 0,91 de Ivy.
 */
export function elegirK(
  X: number[][],
  max: number,
  opts: OpcionesK = {}
): { k: number; decomp: Decomposition } {
  const minCuota = opts.minCuota ?? MIN_CUOTA;
  const total = varianzaTotal(X);
  let mejor = archetypes(X, 1);
  let mejorK = 1;
  let explicadaPrevia = total > 0 ? 1 - mejor.rss / total : 0;

  for (let k = 2; k <= max; k++) {
    const d = archetypes(X, k);
    const explicada = total > 0 ? 1 - d.rss / total : 0;
    if (explicada - explicadaPrevia < MEJORA_MINIMA) break;
    const legible = opts.unscale ? opts.unscale(d.Z) : d.Z;
    if (separacion(legible) < MIN_SEPARACION) break;
    if (Math.min(...cuotas(d.A, k)) < minCuota) break;
    mejor = d;
    mejorK = k;
    explicadaPrevia = explicada;
  }
  return { k: mejorK, decomp: mejor };
}

/** Suma de cuadrados alrededor de la media: el denominador de "varianza explicada". */
export function varianzaTotal(X: number[][]): number {
  if (X.length === 0) return 0;
  const d = X[0].length;
  const media = new Array(d).fill(0);
  for (const fila of X) for (let j = 0; j < d; j++) media[j] += fila[j] / X.length;
  let s = 0;
  for (const fila of X) s += dist2(fila, media);
  return s;
}

/**
 * A qué arquetipo pertenece cada jugador, y con cuánta convicción.
 *
 * El arquetipo es el de mayor peso; `commitment` es ese peso. Un jugador con 0,9
 * juega esa build; uno con 0,4 está entre dos y no describe bien a ninguna. **El
 * peso se publica** porque una build armada con gente que apenas la juega merece
 * leerse distinto que una armada con puristas.
 */
export function asignar(A: number[][]): { archetype: number; commitment: number }[] {
  return A.map((fila) => {
    let mejor = 0;
    for (let j = 1; j < fila.length; j++) if (fila[j] > fila[mejor]) mejor = j;
    return { archetype: mejor, commitment: fila[mejor] };
  });
}

export { dot };
