"""
Las build orders de AoE2 (2026-11-21), escritas a mano acá y volcadas a `games/aoe2/data/buildorders.json`.

    python games/aoe2/tools/buildorders.py

Los tiempos no se escriben: salen del ritmo del centro urbano. Se arranca con 3 aldeanos, cada aldeano tarda 25 s y el
Telar 25 s; el aldeano N sale a los (N − 3) × 25 s (más 25 si ya se hizo el Telar). Feudal tarda 130 s y Castillos
160 s. Así ningún paso pide algo que el juego no deja. La columna es de **aldeanos** (sin explorador ni milicias) y la
hora de Feudal es la de **pedirla**.
"""
import json
from pathlib import Path

SALIDA = Path(__file__).resolve().parents[1] / "data" / "buildorders.json"
ALDEANO, TELAR, FEUDAL, CASTILLOS = 25, 25, 130, 160


def sale(n: int, telar: bool = False) -> int:
    """Segundo en que sale el aldeano `n` (los 3 primeros están desde el arranque)."""
    return max(0, (n - 3) * ALDEANO) + (TELAR if telar else 0)


def reloj(s: int) -> str:
    return f"{s // 60}:{s % 60:02d}"


def build(slug, opening, name, maps, summary, feudal_vils, pasos, despues=()):
    """`pasos`: (aldeanos, en, es) en la Edad Oscura; el último pide Feudal tras el Telar. `despues`: (segundos desde que
    se pide Feudal, aldeanos, en, es)."""
    click = sale(feudal_vils) + TELAR
    steps = [{"vils": v, "time": reloj(sale(v)), "en": en, "es": es} for v, en, es in pasos]
    steps.append({"vils": feudal_vils, "time": reloj(click), "en": "Research Loom, then click Feudal Age.", "es": "Telar y avanzar a la Edad Feudal."})
    for dt, v, en, es in despues:
        steps.append({"vils": v, "time": reloj(click + dt), "en": en, "es": es})
    return {"slug": slug, "opening": opening, "name": name, "maps": maps, "feudal": {"vils": feudal_vils, "time": reloj(click)}, "summary": summary, "steps": steps}


OSCURA = [
    (6, "First 6 villagers to sheep. Two of the starting ones build a house each first.", "Los 6 primeros aldeanos a las ovejas. Dos de los iniciales hacen una casa cada uno antes."),
    (10, "Villagers 7 to 10 to wood: lumber camp on the nearest good woodline.", "Aldeanos 7 a 10 a la madera: campamento maderero en el bosque bueno más cercano."),
    (11, "Villager 11 lures the first boar to the Town Center.", "El aldeano 11 atrae el primer jabalí al centro urbano."),
]
LLEGA = FEUDAL  # segundos desde el pedido hasta estar en Feudal

LISTA = [
    build(
        "scouts", "scouts", {"en": "Scouts", "es": "Scouts"}, ["arabia", "gold-rush"],
        {"en": "Feudal Age with 20 villagers and raid the opponent's woodlines and berries with 3 to 6 Scout Cavalry. Good against slower archer openings and to keep the opponent on the back foot.",
         "es": "Feudal con 20 aldeanos y a molestar madera y bayas del rival con 3 a 6 exploradores. Sirve contra aperturas de arqueros más lentas y para tener al rival a la defensiva."},
        20,
        OSCURA + [
            (14, "Villagers 12 to 14 to berries: the first builds the mill. A house when you reach 13 population.", "Aldeanos 12 a 14 a las bayas: el primero hace el molino. Una casa al llegar a 13 de población."),
            (15, "Villager 15 lures the second boar when the first is almost eaten.", "El aldeano 15 atrae el segundo jabalí cuando el primero está por terminarse."),
            (17, "Villagers 16 and 17 to food (sheep or boar under the Town Center).", "Aldeanos 16 y 17 a comida (ovejas o jabalí bajo el centro urbano)."),
            (20, "Villagers 18 to 20 to a second woodline.", "Aldeanos 18 a 20 a un segundo bosque."),
        ],
        [
            (5, 20, "During the age-up, two wood villagers build a barracks and the sheep villagers start farms as the food runs out.", "Durante el avance, dos aldeanos de madera hacen el cuartel y los de las ovejas pasan a granjas a medida que se termina la comida."),
            (LLEGA, 20, "In Feudal: the barracks builders make a stable; Scout Cavalry nonstop and Double-Bit Axe.", "En Feudal: los del cuartel levantan el establo; exploradores sin parar y Hacha de doble filo."),
            (LLEGA + 90, 24, "New villagers to farms and gold. Horse Collar and Bloodlines when you can afford them.", "Los aldeanos nuevos a granjas y oro. Collera y Pureza de sangre cuando alcance."),
        ],
    ),
    build(
        "archers", "archers", {"en": "Archers", "es": "Arqueros"}, ["arabia", "gold-rush"],
        {"en": "Two archery ranges in Feudal and a steady stream of archers with Fletching. Strong against Men-at-Arms and slow openings; it needs gold early, so a mining camp goes up before clicking.",
         "es": "Dos galerías de tiro en Feudal y arqueros sin parar con Emplumado de flechas. Fuerte contra hombres de armas y aperturas lentas; necesita oro temprano, así que va un campamento minero antes de avanzar."},
        21,
        OSCURA + [
            (14, "Villagers 12 to 14 to berries with a mill.", "Aldeanos 12 a 14 a las bayas con molino."),
            (15, "Villager 15 lures the second boar.", "El aldeano 15 atrae el segundo jabalí."),
            (19, "Villagers 16 to 19 to a second woodline.", "Aldeanos 16 a 19 a un segundo bosque."),
            (21, "Villagers 20 and 21 build a mining camp on gold and stay there.", "Aldeanos 20 y 21 hacen un campamento minero en el oro y se quedan ahí."),
        ],
        [
            (5, 21, "During the age-up, a wood villager builds a barracks and 2 more go to gold.", "Durante el avance, un aldeano de madera hace el cuartel y 2 más pasan al oro."),
            (LLEGA, 21, "In Feudal: two archery ranges at once (3 or 4 wood villagers build them). Archers nonstop and Double-Bit Axe.", "En Feudal: dos galerías de tiro a la vez (las hacen 3 o 4 aldeanos de madera). Arqueros sin parar y Hacha de doble filo."),
            (LLEGA + 90, 24, "Fletching at the blacksmith and Horse Collar. New villagers to farms and gold.", "Emplumado de flechas en la herrería y Collera. Los aldeanos nuevos a granjas y oro."),
        ],
    ),
    build(
        "men-at-arms", "maa", {"en": "Men-at-Arms into Archers", "es": "Hombres de armas y después arqueros"}, ["arabia"],
        {"en": "A barracks in Dark Age and 3 militia trained while you age up, upgraded to Men-at-Arms the moment you reach Feudal, then archery ranges behind them.",
         "es": "Cuartel en la Edad Oscura y 3 milicias mientras avanzás, que pasan a hombres de armas apenas llegás a Feudal; después, galerías de tiro."},
        20,
        OSCURA + [
            (12, "Villager 12 builds a barracks, then goes to wood.", "El aldeano 12 hace el cuartel y después va a la madera."),
            (15, "Villagers 13 to 15 to berries with a mill.", "Aldeanos 13 a 15 a las bayas con molino."),
            (16, "Villager 16 lures the second boar.", "El aldeano 16 atrae el segundo jabalí."),
            (18, "Villagers 17 and 18 to wood.", "Aldeanos 17 y 18 a la madera."),
            (20, "Villagers 19 and 20 to gold with a mining camp.", "Aldeanos 19 y 20 al oro con campamento minero."),
        ],
        [
            (0, 20, "As you click Feudal, queue 3 militia at the barracks and send them toward the opponent.", "Al pedir Feudal, encolá 3 milicias en el cuartel y mandalas hacia el rival."),
            (LLEGA, 20, "In Feudal: research Men-at-Arms first, then two archery ranges and archers. Double-Bit Axe and Fletching next.", "En Feudal: primero la mejora a hombres de armas, después dos galerías de tiro y arqueros. Hacha de doble filo y Emplumado de flechas a continuación."),
        ],
    ),
    build(
        "drush-fast-castle", "drush_fc", {"en": "Drush into Fast Castle", "es": "Drush y Fast Castle"}, ["arabia", "hideout"],
        {"en": "Three militia in Dark Age to annoy the opponent's woodline and gold, then straight to the Castle Age. You trade a small early army for a safer Castle Age.",
         "es": "Tres milicias en la Edad Oscura para molestar la madera y el oro del rival y después directo a la Edad de los Castillos. Cambiás un ejército chico temprano por llegar más seguro a Castillos."},
        21,
        [
            (6, "First 6 villagers to sheep; two starting villagers build houses.", "Los 6 primeros a las ovejas; dos de los iniciales hacen casas."),
            (9, "Villagers 7 to 9 to wood.", "Aldeanos 7 a 9 a la madera."),
            (10, "Villager 10 lures the first boar.", "El aldeano 10 atrae el primer jabalí."),
            (11, "Villager 11 builds a barracks, then goes to wood. Train 3 militia as soon as it's up.", "El aldeano 11 hace el cuartel y después va a la madera. Tres milicias apenas esté."),
            (14, "Villagers 12 to 14 to berries with a mill.", "Aldeanos 12 a 14 a las bayas con molino."),
            (15, "Villager 15 lures the second boar; the militia go to the opponent's woodline.", "El aldeano 15 atrae el segundo jabalí; las milicias van a la madera del rival."),
            (18, "Villagers 16 to 18 to wood.", "Aldeanos 16 a 18 a la madera."),
            (21, "Villagers 19 to 21 to gold.", "Aldeanos 19 a 21 al oro."),
        ],
        [
            (5, 21, "During the age-up, 2 or 3 sheep villagers start farms and one more goes to gold.", "Durante el avance, 2 o 3 aldeanos de las ovejas pasan a granjas y uno más al oro."),
            (LLEGA, 21, "In Feudal: market and blacksmith, and Double-Bit Axe. Click Castle Age as soon as both are up and you have 800 food and 200 gold.", "En Feudal: mercado, herrería y Hacha de doble filo. Avanzar a Castillos apenas estén los dos y tengas 800 de comida y 200 de oro."),
            (LLEGA + 70, 21, "Click Castle Age. Horse Collar during the age-up.", "Avanzar a Castillos. Collera durante el avance."),
            (LLEGA + 70 + CASTILLOS, 22, "In Castle Age: stable or archery ranges for your main unit, a second Town Center, Bow Saw and Wheelbarrow.", "En Castillos: establo o galerías para tu unidad principal, un segundo centro urbano, Sierra de arco y Carretilla."),
        ],
    ),
    build(
        "fast-castle-knights", "fc", {"en": "Fast Castle into Knights", "es": "Fast Castle con caballeros"}, ["arena", "hideout", "black-forest"],
        {"en": "No army in Dark or Feudal Age: 27 villagers, Feudal, then straight to Castle Age with two stables making knights. Best on closed maps or when the opponent can't punish you early.",
         "es": "Sin ejército en Oscura ni en Feudal: 27 aldeanos, Feudal y directo a Castillos con dos establos sacando caballeros. Ideal en mapas cerrados o cuando el rival no puede castigarte temprano."},
        27,
        OSCURA + [
            (15, "Villagers 12 to 15 to berries with a mill.", "Aldeanos 12 a 15 a las bayas con molino."),
            (16, "Villager 16 lures the second boar.", "El aldeano 16 atrae el segundo jabalí."),
            (20, "Villagers 17 to 20 to wood; the sheep villagers start farms as the food runs out.", "Aldeanos 17 a 20 a la madera; los de las ovejas pasan a granjas a medida que se termina la comida."),
            (24, "Villagers 21 to 24 to gold with a mining camp.", "Aldeanos 21 a 24 al oro con campamento minero."),
            (27, "Villagers 25 to 27 to farms.", "Aldeanos 25 a 27 a granjas."),
        ],
        [
            (LLEGA, 27, "In Feudal: two wood villagers build a market and a blacksmith at once. Double-Bit Axe.", "En Feudal: dos aldeanos de madera hacen mercado y herrería a la vez. Hacha de doble filo."),
            (LLEGA + 60, 27, "Click Castle Age (800 food, 200 gold). Horse Collar during the age-up.", "Avanzar a Castillos (800 de comida y 200 de oro). Collera durante el avance."),
            (LLEGA + 60 + CASTILLOS, 27, "In Castle Age: two stables, knights nonstop, Bloodlines and Forging. More villagers to gold.", "En Castillos: dos establos, caballeros sin parar, Pureza de sangre y Forja. Más aldeanos al oro."),
        ],
    ),
    build(
        "fast-castle-boom", "boom", {"en": "Fast Castle boom", "es": "Fast Castle con boom"}, ["arena", "black-forest", "hideout"],
        {"en": "The same Fast Castle, but the first Castle Age resources go into two or three extra Town Centers. You aim to out-produce the opponent and reach Imperial Age first; it only works if they can't attack you right away.",
         "es": "El mismo Fast Castle, pero lo primero en Castillos son dos o tres centros urbanos más. Buscás producir más que el rival y llegar antes a Imperial; sólo funciona si no puede atacarte enseguida."},
        27,
        OSCURA + [
            (15, "Villagers 12 to 15 to berries with a mill.", "Aldeanos 12 a 15 a las bayas con molino."),
            (16, "Villager 16 lures the second boar.", "El aldeano 16 atrae el segundo jabalí."),
            (20, "Villagers 17 to 20 to wood; the sheep villagers start farms.", "Aldeanos 17 a 20 a la madera; los de las ovejas pasan a granjas."),
            (24, "Villagers 21 to 24 to gold.", "Aldeanos 21 a 24 al oro."),
            (27, "Villagers 25 to 27 to farms.", "Aldeanos 25 a 27 a granjas."),
        ],
        [
            (LLEGA, 27, "In Feudal: market and blacksmith at once, Double-Bit Axe.", "En Feudal: mercado y herrería a la vez, Hacha de doble filo."),
            (LLEGA + 60, 27, "Click Castle Age. During the age-up, 4 or 5 villagers go to stone.", "Avanzar a Castillos. Durante el avance, 4 o 5 aldeanos a la piedra."),
            (LLEGA + 60 + CASTILLOS, 27, "In Castle Age: two extra Town Centers on woodlines or gold, 3 or 4 villagers each. Wheelbarrow and Bow Saw.", "En Castillos: dos centros urbanos más en madera u oro, con 3 o 4 aldeanos cada uno. Carretilla y Sierra de arco."),
            (LLEGA + 60 + CASTILLOS + 300, 45, "Villagers from every Town Center nonstop, to farms and wood. A castle or a few defensive units if the opponent moves out.", "Aldeanos de todos los centros urbanos sin parar, a granjas y madera. Un castillo o algunas unidades de defensa si el rival sale."),
        ],
    ),
    build(
        "tower-rush", "tower", {"en": "Tower rush", "es": "Rush de torres"}, ["arabia"],
        {"en": "Forward villagers build towers on the opponent's food and gold in early Feudal. All-in: if the towers don't kill villagers or win resources, you're far behind.",
         "es": "Aldeanos adelantados hacen torres sobre la comida y el oro del rival al inicio de Feudal. Todo o nada: si las torres no matan aldeanos ni ganan recursos, quedás muy atrás."},
        19,
        [
            (6, "First 6 villagers to sheep; two starting villagers build houses.", "Los 6 primeros a las ovejas; dos de los iniciales hacen casas."),
            (9, "Villagers 7 to 9 to wood.", "Aldeanos 7 a 9 a la madera."),
            (10, "Villager 10 lures the first boar.", "El aldeano 10 atrae el primer jabalí."),
            (13, "Villagers 11 to 13 to stone with a mining camp.", "Aldeanos 11 a 13 a la piedra con campamento minero."),
            (16, "Villagers 14 to 16 to berries with a mill; the second boar.", "Aldeanos 14 a 16 a las bayas con molino; segundo jabalí."),
            (19, "Villagers 17 to 19 to wood.", "Aldeanos 17 a 19 a la madera."),
        ],
        [
            (5, 19, "During the age-up, 3 or 4 villagers walk forward with stone and hide near the opponent's gold or berries.", "Durante el avance, 3 o 4 aldeanos van adelante con la piedra y se esconden cerca del oro o las bayas del rival."),
            (LLEGA, 19, "In Feudal: towers covering their resources, one at a time and close together; keep villagers repairing. A barracks for spearmen if scouts show up.", "En Feudal: torres que cubran sus recursos, de a una y juntas; aldeanos reparando. Cuartel con lanceros si aparecen exploradores."),
        ],
    ),
]


def main() -> None:
    SALIDA.write_text(json.dumps({"updated": "2026-11-21", "list": LISTA}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(LISTA)} build orders")


if __name__ == "__main__":
    main()
