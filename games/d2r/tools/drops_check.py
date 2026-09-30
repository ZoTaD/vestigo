"""
Diablo II: Resurrected → el evaluador exacto de referencia de la calculadora de drops (2026-09-29).

Las chances que los tests del motor comparan con 1e-6 de tolerancia salen de acá y no
del motor del sitio (site/src/d2r/drops/):

  site/test/d2rDropsEngine.test.ts   "contra el evaluador exacto: jefes de Infierno"
  site/test/d2rDropsPlaces.test.ts   jefes, superúnicos y el Foso Nivel 1

Está escrito aparte a propósito, para que un error del motor no se copie solo en sus
referencias: sin el tope de 6 ítems cuenta con tiradas independientes
(1 − (1 − h)^tiradas, o el producto de las fallas en las tiradas negativas); con el
tope, con una programación dinámica propia sobre (ítems generados, salió el buscado).
Lo validé el 2026-09-29: sin el tope y sobre las tablas de Silospen da sus números en
vivo al 0,000%, y un Montecarlo del proceso de la muerte coincide con él.

Lee games/d2r/data/drops/drops.json (lo que escribe drops.py) y nada más: no
necesita el juego. Las reglas son las del diseño
(docs/design/2026-09-29-d2r-calculadora-drops.md) y las de places.ts para decidir
cómo muere cada lugar: la mejora de TC recorre la cadena de filas CONTIGUAS de la
tabla con el mismo grupo (el número de grupo se reusa en filas que no lo son); los
jefes conservan su nivel y no mejoran su TC salvo aterrorizados; en una Zona de
Terror, jefes y superúnicos suman el +3 de único sobre el nivel aterrorizado; las
áreas de Pandemonio sólo existen en Infierno; en un área cada monstruo pesa su
Rarity y el que aparece sin TC cuenta con chance 0.

Uso (desde la raíz del repo, después de drops.py):
    python games/d2r/tools/drops_check.py

Imprime las referencias de los casos de los dos tests, en la forma en que van en
ellos. Cuando un parche cambia una TC de esos casos y los tests se ponen en rojo,
se corre esto, se entiende la diferencia y recién ahí se copian los números nuevos
(copiar lo que da el motor sería una prueba circular).
"""
import json, math, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DROPS = os.path.join(ROOT, "games", "d2r", "data", "drops", "drops.json")
# El juego no suelta más de 6 ítems por muerte, pociones y oro incluidos.
MAX_ITEMS = 6
NO_Q = (0, 0, 0, 0)


# ── Reglas (itemratio-calc de la guía del juego, con enteros como el juego) ──
def player_exponent(players, party):
    """Cuántos jugadores cuentan: vos y cada uno del grupo cerca tuyo enteros, el resto medio."""
    return math.floor(1 + (players - 1) / 2 + (party - 1) / 2)


def adjust_no_drop(nd, prob_sum, n):
    """El NoDrop con más jugadores: la chance de no soltar nada elevada a N, con el truncado del juego."""
    if nd <= 0 or prob_sum <= 0 or n <= 1:
        return nd
    ratio = (nd / (nd + prob_sum)) ** n
    return math.trunc(prob_sum / (1 / ratio - 1))


def effective_mf(mf, q):
    if q == "m" or mf <= 10:
        return 100 + mf
    dim = {"u": 250, "s": 500, "r": 600}[q]
    return 100 + math.trunc(mf * dim / (mf + dim))


def quality_chance(r, q, mlvl, qlvl, mf, tc_mod):
    rarity, divisor, mn = r
    chance = (rarity - math.trunc((mlvl - qlvl) / divisor)) * 128
    chance = math.trunc(chance * 100 / effective_mf(mf, q))
    if chance < mn:
        chance = mn
    chance -= math.trunc(chance * tc_mod / 1024)
    return 1.0 if chance <= 128 else 128 / chance


def cond_ok(c, k):
    if not c:
        return True
    if "diff" in c and c["diff"] != k["diff"]:
        return False
    if "desec" in c and c["desec"] != k["desec"]:
        return False
    if "herald" in c and c["herald"] != k["herald"]:
        return False
    if "tier" in c and (k["tier"] < c["tier"][0] or k["tier"] > c["tier"][1]):
        return False
    return True


def ladder_ok(lad, ladder, season):
    """Pasada su última temporada exclusiva, lo de Clasificación sale en todas las partidas."""
    if not lad or not lad[0]:
        return True
    if ladder:
        return season >= lad[0]
    return lad[1] > 0 and season > lad[1]


def max_q(a, b):
    """La calidad heredada: por cada una (único, conjunto, raro, mágico), el máximo de la cadena."""
    return tuple(max(x, y) for x, y in zip(a, b)) if b else a


def negative_sequence(lst, picks):
    """Las tiradas negativas: cada entrada tantas veces como su Prob, en orden, hasta completar."""
    out = []
    for e in lst:
        for _ in range(e[1]):
            if len(out) >= picks:
                return out
            out.append(e)
    return out


# ── Datos ────────────────────────────────────────────────────────────────
class Data:
    def __init__(self, raw):
        self.tcs, self.bases, self.ratio, self.tz = raw["tcs"], raw["bases"], raw["ratio"], raw["tz"]
        self.uniques, self.sets, self.monsters = raw["uniques"], raw["sets"], raw["monsters"]
        self.areas = {a["id"]: a for a in raw["areas"]}
        self.sources = {s["id"]: s for s in raw["sources"]}
        # La cadena de mejora de cada TC con grupo: las filas CONTIGUAS de la tabla (el orden del JSON es el de
        # treasureclassex.txt) con el mismo grupo. Una fila sin grupo o de otro grupo la corta.
        self.chains, run, run_group = {}, [], 0
        for name, tc in self.tcs.items():
            g = tc.get("g")
            if not g:
                run_group = 0
                continue
            if g != run_group:
                run, run_group = [], g
            run.append(name)
            self.chains[name] = run
        # Los que entran al sorteo de cada base: sin los que sólo salen por nombre y sin los de rareza 0.
        self.uniq_by_code, self.sets_by_code = {}, {}
        for u in self.uniques:
            if not u.get("f") and u["rar"] > 0:
                self.uniq_by_code.setdefault(u["code"], []).append(u)
        for x in self.sets:
            if x["rar"] > 0:
                self.sets_by_code.setdefault(x["code"], []).append(x)
        # Las Facetas de arcoíris comparten nombre: ninguna sale por nombre, así que alcanza con la primera.
        self.unique_by_key, self.set_by_key = {}, {}
        for u in self.uniques:
            self.unique_by_key.setdefault(u["key"], u)
        for x in self.sets:
            self.set_by_key.setdefault(x["key"], x)
        self.unique_by_id = {u["id"]: u for u in self.uniques}
        self.set_by_id = {x["id"]: x for x in self.sets}

    def ratio_row(self, b):
        for r in self.ratio:
            if r["u"] == b["u"] and r["cl"] == b["cl"]:
                return r
        return self.ratio[0]


def upgrade_tc(D, name, level):
    """Sube por su cadena mientras el nivel de la siguiente no pase `level`. Nunca baja."""
    chain = D.chains.get(name)
    if not chain:
        return name
    best = name
    for n in chain[chain.index(name) + 1:]:
        if (D.tcs[n].get("l") or 0) > level:
            break
        best = n
    return best


# ── Lugares (las reglas de site/src/d2r/drops/places.ts) ──────────────────
def make_kill(tc, mlvl, diff=2, desec=False, herald=False, tier=0):
    return {"tc": tc, "mlvl": mlvl, "diff": diff, "desec": desec, "herald": herald, "tier": tier}


def terror_level(D, base, clvl, diff):
    lo, hi = D.tz["b"][diff]
    return max(base, min(max(clvl + D.tz["boost"], lo), hi))


def source_kill(D, src_id, diff, tz=0, quest=False):
    """Cómo muere un jefe o superúnico; None si ahí no suelta nada."""
    src = D.sources[src_id]
    mon = D.monsters.get(src["mon"])
    if not mon:
        return None
    area = D.areas.get(src["area"]) if src["area"] is not None else None
    desec = tz > 0 and bool(area and area.get("tz"))
    boss = bool(mon.get("boss"))
    own = mon["lv"][diff] if (boss or diff == 0 or not area) else area["lv"][diff]
    mlvl = terror_level(D, own, tz, diff) + 3 if desec else own + (0 if boss else 3)
    m = mon["tc"][diff]
    if src.get("tc"):
        tc = (desec and src.get("tcd") and src["tcd"][diff]) or src["tc"][diff]
    else:
        tc = (desec and m[4]) or (quest and m[3]) or m[0]
    if not tc or tc not in D.tcs:
        return None
    if not boss or desec:
        tc = upgrade_tc(D, tc, mlvl)
    return make_kill(tc, mlvl, diff, desec)


# Columna de TC de monstats para cada tipo (sin y con Zona de Terror) y lo que suma al nivel.
TC_COL = {"normal": (0, 4), "champ": (1, 5), "unique": (2, 6), "herald": (2, 7)}
BONUS = {"normal": 0, "champ": 2, "unique": 3, "herald": 3}


def area_kills(D, area_id, diff, cat, tz=0, tier=1):
    """Los monstruos de un área para un tipo de muerte: [(monstruo, peso, muerte o None si no tiene TC)]."""
    area = D.areas[area_id]
    if area.get("hell") and diff != 2:
        return []
    desec = tz > 0 and bool(area.get("tz"))
    if cat == "herald" and not (desec and diff == 2 and D.tz["maxTier"] > 0):
        return []
    lst = area["nmon"] if diff > 0 else (area["umon"] if cat in ("unique", "herald") and area["umon"] else area["mon"])
    plain, terror = TC_COL[cat]
    out = []
    for mid in lst:
        mon = D.monsters.get(mid)
        if not mon:
            continue
        base = mon["lv"][diff] if (mon.get("boss") or diff == 0) else area["lv"][diff]
        mlvl = (terror_level(D, base, tz, diff) if desec else base) + BONUS[cat]
        tc = mon["tc"][diff][terror] if cat == "herald" else ((desec and mon["tc"][diff][terror]) or mon["tc"][diff][plain])
        if not tc or tc not in D.tcs:
            out.append((mid, mon["rar"], None))
            continue
        boost = D.tz["heraldTc"][min(tier, len(D.tz["heraldTc"])) - 1] if cat == "herald" else 0
        herald = cat == "herald"
        out.append((mid, mon["rar"], make_kill(upgrade_tc(D, tc, mlvl + boost), mlvl, diff, desec, herald, tier if herald else 0)))
    return out


# ── El evaluador exacto ──────────────────────────────────────────────────
class Exact:
    def __init__(self, D, target, kill, mf=0, players=1, party=1, ladder=False, season=15):
        """target: ('b', código) | ('u', id) | ('s', id), con los ids de la wiki, como el motor."""
        self.D, self.target, self.kill = D, target, kill
        self.mf, self.players, self.party, self.ladder, self.season = mf, players, party, ladder, season
        k, t = target
        if k == "b":
            self.keys = [t]
        else:
            x = (D.unique_by_id if k == "u" else D.set_by_id).get(t)
            self.keys = [x["code"], x["key"]] if x else []
        self.memo_hit, self.memo_dist, self.memo_leaf = {}, {}, {}

    def roll_of(self, name):
        """Lo que puede salir de un TC en esta muerte: una sub-TC que no pasa su condición (o no es de esta
        partida) sale del sorteo con su Prob, ANTES de contar las tiradas negativas. El NoDrop, ajustado."""
        D, tc = self.D, self.D.tcs[name]
        lst = []
        for e in tc["e"]:
            sub = D.tcs.get(e[0])
            if sub is None or (cond_ok(sub.get("c"), self.kill) and ladder_ok(sub.get("lad"), self.ladder, self.season)):
                lst.append(e)
        total = sum(e[1] for e in lst)
        nd = adjust_no_drop(tc.get("nd", 0), total, player_exponent(self.players, self.party)) if tc["p"] >= 0 else 0
        return lst, nd, total + nd

    def eligible(self, code):
        k, _ = self.target
        pool = (self.D.uniq_by_code if k == "u" else self.D.sets_by_code).get(code, [])
        return [x for x in pool if x["lvl"] <= self.kill["mlvl"] and ladder_ok(x.get("lad"), self.ladder, self.season)
                and cond_ok(x.get("c"), self.kill)]

    def leaf(self, code, q):
        """La chance de que una hoja sea el buscado: un nombre fijo sale seguro; una base tira calidad y sorteo."""
        key = (code, q)
        if key in self.memo_leaf:
            return self.memo_leaf[key]
        D, (k, t) = self.D, self.target
        if code not in D.bases:
            fu, fs = D.unique_by_key.get(code), D.set_by_key.get(code)
            r = 1.0 if (fu and k == "u" and t == fu["id"]) or (not fu and fs and k == "s" and t == fs["id"]) else 0.0
        elif k == "b":
            r = 1.0 if t == code else 0.0
        else:
            base = D.bases[code]
            wanted = (D.unique_by_id if k == "u" else D.set_by_id).get(t)
            if not wanted or wanted["code"] != code or base["qf"] == 1:
                r = 0.0
            else:
                row, mlvl = D.ratio_row(base), self.kill["mlvl"]
                pu = quality_chance(row["U"], "u", mlvl, base["q"], self.mf, q[0])
                pool = self.eligible(code)
                w = next((x["rar"] for x in pool if x["id"] == t), 0)
                total = sum(x["rar"] for x in pool)
                pick = w / total if (w and total) else 0.0
                # La calidad de conjunto sólo se tira si falló la de único.
                quality = pu if k == "u" else (1 - pu) * quality_chance(row["S"], "s", mlvl, base["q"], self.mf, q[1])
                r = quality * pick
        self.memo_leaf[key] = r
        return r

    # Sin el tope: las tiradas son independientes.
    def hit_entry(self, e, q):
        qe = max_q(q, tuple(e[2]) if len(e) > 2 else None)
        if e[0] in self.D.tcs:
            return self.hit_tc(e[0], qe)
        return self.leaf(e[0], qe) if e[0] in self.keys else 0.0

    def hit_tc(self, name, q):
        tc = self.D.tcs[name]
        qq = max_q(q, tuple(tc["q"]) if tc.get("q") else None)
        key = (name, qq)
        if key not in self.memo_hit:
            lst, nd, total = self.roll_of(name)
            if tc["p"] >= 0:
                h = sum(e[1] / total * self.hit_entry(e, qq) for e in lst) if total else 0.0
                self.memo_hit[key] = 1 - (1 - h) ** tc["p"]
            else:
                miss = 1.0
                for e in negative_sequence(lst, -tc["p"]):
                    miss *= 1 - self.hit_entry(e, qq)
                self.memo_hit[key] = 1 - miss
        return self.memo_hit[key]

    # Con el tope: la distribución de (ítems generados k, salió el buscado h), en d[k*2 + h].
    @staticmethod
    def item_dist(room, p):
        d = [0.0] * ((room + 1) * 2)
        if room == 0:
            d[0] = 1.0  # sin lugar, el ítem no se genera
        else:
            d[2], d[3] = 1 - p, p
        return d

    def entry_dist(self, e, room, q):
        qe = max_q(q, tuple(e[2]) if len(e) > 2 else None)
        if e[0] in self.D.tcs:
            return self.tc_dist(e[0], room, qe)
        return self.item_dist(room, self.leaf(e[0], qe) if e[0] in self.keys else 0.0)

    def tc_dist(self, name, cap, q):
        tc = self.D.tcs[name]
        qq = max_q(q, tuple(tc["q"]) if tc.get("q") else None)
        key = (name, cap, qq)
        if key in self.memo_dist:
            return self.memo_dist[key]
        lst, nd, total = self.roll_of(name)
        seq = negative_sequence(lst, -tc["p"]) if tc["p"] < 0 else None
        state = [0.0] * ((cap + 1) * 2)
        state[0] = 1.0
        for i in range(len(seq) if seq is not None else tc["p"]):
            nxt = [0.0] * ((cap + 1) * 2)
            for used in range(cap + 1):
                for h in (0, 1):
                    pi = state[used * 2 + h]
                    if not pi:
                        continue
                    # Con el tope lleno no se genera nada más; una TC sin entradas no suelta nada.
                    if used == cap or (seq is None and not total):
                        nxt[used * 2 + h] += pi
                        continue
                    if seq is None and nd:
                        nxt[used * 2 + h] += pi * nd / total
                    room = cap - used
                    for e, w in ([(seq[i], 1.0)] if seq is not None else [(e, e[1] / total) for e in lst]):
                        d = self.entry_dist(e, room, qq)
                        for k in range(room + 1):
                            if d[k * 2]:
                                nxt[(used + k) * 2 + h] += pi * w * d[k * 2]
                            if d[k * 2 + 1]:
                                nxt[(used + k) * 2 + 1] += pi * w * d[k * 2 + 1]
            state = nxt
        self.memo_dist[key] = state
        return state

    def chance(self, cap=True):
        """La chance de que la muerte suelte al menos uno del buscado; cap=False sin el tope de 6 ítems."""
        tc = self.D.tcs.get(self.kill["tc"])
        if not tc or not cond_ok(tc.get("c"), self.kill) or not ladder_ok(tc.get("lad"), self.ladder, self.season):
            return 0.0
        if not cap:
            return self.hit_tc(self.kill["tc"], NO_Q)
        d = self.tc_dist(self.kill["tc"], MAX_ITEMS, NO_Q)
        return sum(d[k * 2 + 1] for k in range(MAX_ITEMS + 1))


# ── Los casos de los tests ───────────────────────────────────────────────
# La temporada de los tests (fija, para que no cambien con `SEASON`).
TEST_SEASON = 15
SHAKO, BER, TAL, IST = ("u", "harlequin-crest"), ("b", "r30"), ("s", "tal-rashas-guardianship"), ("b", "r24")
TARGET_NAME = {SHAKO: "SHAKO", BER: "BER", TAL: "TAL", IST: "IST"}
# Las opciones como se escriben en el test y lo que valen.
S0 = ("S0", {})
MF300 = ("{ ...S0, mf: 300 }", {"mf": 300})
P8 = ("{ ...S0, players: 8 }", {"players": 8})
# d2rDropsEngine.test.ts: [TC, nivel, buscado, opciones].
ENGINE_CASES = [
    ("Mephisto (H)", 87, SHAKO, S0), ("Diablo (H)", 94, SHAKO, S0), ("Baal (H)", 99, SHAKO, S0),
    ("Andarielq (H)", 75, SHAKO, S0), ("Duriel (H)", 88, SHAKO, S0), ("Nihlathak (H)", 92, SHAKO, S0),
    ("Radament (H)", 83, SHAKO, S0), ("Summoner (H)", 80, SHAKO, S0), ("Blood Raven (H)", 88, SHAKO, S0),
    ("Izual (H)", 86, SHAKO, S0), ("Griswold (H)", 84, SHAKO, S0),
    ("Mephisto (H)", 87, SHAKO, MF300), ("Baal (H)", 99, SHAKO, MF300), ("Andarielq (H)", 75, SHAKO, MF300),
    ("Mephisto (H)", 87, SHAKO, P8), ("Baal (H)", 99, SHAKO, P8), ("Andarielq (H)", 75, SHAKO, P8),
    ("Mephisto (H)", 87, BER, S0), ("Baal (H)", 99, BER, S0), ("Baal (H)", 99, TAL, S0),
]
# d2rDropsPlaces.test.ts: jefes y superúnicos de Infierno, sin Zona de Terror.
SOURCE_CASES = [("the-countess", IST), ("pindleskin", IST), ("eldritch-the-rectifier", IST),
                ("mephisto", SHAKO), ("radament", SHAKO), ("the-summoner", SHAKO)]
# d2rDropsPlaces.test.ts: el Foso Nivel 1 (área 12) de Infierno, con tu nivel en la Zona de Terror (0 = sin).
PIT = 12
PIT_CASES = [("normal", "skeleton3", 0), ("normal", "cr_archer3", 0), ("champ", "skeleton3", 0),
             ("unique", "skeleton3", 0), ("normal", "skeleton3", 90), ("normal", "cr_archer3", 90)]


def fmt(v):
    """Nueve cifras significativas, como las escriben los tests (4.83630312e-7, 0.000561844573)."""
    return re.sub(r"e([+-])0*(\d)", r"e\1\2", f"{v:.9g}").replace("e+", "e")


def chance(D, target, kill, opts, cap=True):
    return Exact(D, target, kill, season=TEST_SEASON, **opts).chance(cap)


def main():
    D = Data(json.load(open(DROPS, encoding="utf-8")))
    print(f"drops_check: {len(D.tcs)} TCs · referencias del evaluador exacto (MF 0 y 1 jugador si no se dice otra cosa)")

    print("\nd2rDropsEngine.test.ts · contra el evaluador exacto: [TC, nivel, buscado, opciones, sin tope, con el tope de 6]")
    for tc, mlvl, target, (label, opts) in ENGINE_CASES:
        k = make_kill(tc, mlvl)
        off, cap6 = chance(D, target, k, opts, cap=False), chance(D, target, k, opts)
        print(f'  ["{tc}", {mlvl}, {TARGET_NAME[target]}, {label}, {fmt(off)}, {fmt(cap6)}],')

    print("\nd2rDropsPlaces.test.ts · jefes y superúnicos de Infierno (sourceKill; con el tope de 6, y sin él)")
    for src, target in SOURCE_CASES:
        k = source_kill(D, src, 2)
        print(f"  {src:24s} {TARGET_NAME[target]:5s} {k['tc']:22s} nivel {k['mlvl']:3d}   "
              f"{fmt(chance(D, target, k, {}))}   sin tope {fmt(chance(D, target, k, {}, cap=False))}")

    print("\nd2rDropsPlaces.test.ts · Foso Nivel 1 de Infierno (areaKills), la Cresta del arlequín con el tope de 6")
    for cat, mon, tz in PIT_CASES:
        k = next(x for m, _, x in area_kills(D, PIT, 2, cat, tz) if m == mon)
        print(f"  {cat:7s} {mon:11s} Zona de Terror {tz or '-':>2}  {k['tc']:34s} nivel {k['mlvl']:3d}   {fmt(chance(D, SHAKO, k, {}))}")
    # La fila del área: cada monstruo con su Rarity; el que aparece sin TC, con chance 0.
    kills = area_kills(D, PIT, 2, "normal")
    wsum = sum(w for _, w, _ in kills)
    row = sum(w * chance(D, SHAKO, k, {}) for _, w, k in kills if k) / wsum
    mix = " + ".join(f"{w}×{m}" for m, w, _ in kills)
    print(f"  fila del área (comunes): ({mix}) / {wsum} = {fmt(row)}")


if __name__ == "__main__":
    sys.exit(main())
