"""
Rust → el recorrido de los puzzles de cada monumento (2026-10-09), escrito a mano.

Escribe `games/rust/data/puzzles.json`: por monumento (el `id` de `monuments.json`), qué hay que llevar, los pasos en
orden (inglés y español, con los objetos de cada paso enlazables por su shortname de `items.json`), qué hay en la sala
del final, los cambios recientes y la confianza de cada cosa.

Cómo se armó cada monumento (las fuentes van en el comentario de cada uno):

- **El esqueleto sale del cliente** (la caché del 8/10/2026, `cache/io/monument_instances.json`): qué lectores hay y de
  qué color, qué caja de fusible alimenta qué interruptor, qué temporizador (y de cuántos segundos) prende qué lector,
  qué puerta abre cada lector, qué pide la red de Power Trip (`requiredPowergridStage`). Se leyó el cableado entero de
  cada monumento (las salidas de cada componente y a qué entrada van), así que el orden de las cosas y lo que hace falta
  es seguro aunque las guías sean viejas.
- **Dónde está cada cosa y qué hay adentro** sale de guías y notas de parche, cruzadas: Facepunch (rust.facepunch.com/
  news: Meta Shift 2/10/2025, Common Ground 2/7/2026, Power Trip 6/8/2026, Breach and Clear 3/9/2026, Livestock
  1/10/2026), Rustafied (resumen de Power Trip, 6/8/2026), Corrosion Hour (guía de puzzles de Malonik, 2018, act.
  2020), GamesOMG (páginas de puzzles, sep./oct. 2026, que en parte repiten la de Corrosion Hour) y rustrician.io.
  Las wikis de Fandom y rustlabs no se pudieron leer (bloquean el acceso automático).
- Lo que el cliente no trae (qué cajas aparecen, qué tarjeta hay en la mesa) es del servidor: se dice sólo lo que
  confirma Facepunch o lo que repiten varias fuentes, y con confianza más baja.

Confianza: "high" = el cliente y al menos dos fuentes coinciden; "medium" = el cliente lo confirma pero el lugar o el
contenido sale de una sola fuente, o de fuentes viejas que el cliente no contradice; "low" = una fuente sola, sin
confirmar en el cliente.

Datos que salen del cliente y valen para todos (código decompilado de agosto de 2024 + prefabs actuales):
- El lector pide la tarjeta de su color exacto y energía; cada pasada gasta 1 de condición: la verde y la azul
  aguantan 4 pasadas, la roja 2 (`CardReader.ServerCardSwiped`, `condition.max` de cada tarjeta). La puerta queda
  abierta 10 s (`accessDuration`).
- La caja de fusible gasta 1 de condición por segundo mientras pasa corriente (`TickPassthroughItem`,
  `passthroughItemConditionLossPerSec` 1): un fusible común (200) dura 3 min 20 s; uno pesado (1.000), casi 17 min.
- Los puzzles se reinician cada 30 min (`PuzzleReset.timeBetweenResets` 1.800 s); en las plataformas, cada 65 min
  (3.900 s). Si hay jugadores cerca, el reinicio espera.

Uso, desde la raíz del repo (instantáneo, no abre la caché):
    python games/rust/tools/puzzles.py
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from farming import Items, dump  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "games" / "rust" / "data"
VERIFIED = "2026-10-09"

GREEN, BLUE, RED = "keycard_green", "keycard_blue", "keycard_red"
FUSE, HEAVY = "fuse", "fuse.highgrade"
BASIC, ADVANCED = "basicblueprintfragment", "advancedblueprintfragment"

# Las etapas de la red de Power Trip (`PowergridStageConfig`: 1, 4, 10 y 18 fusibles pesados en la central).
STAGE_FUSES = {1: 1, 2: 4, 3: 10, 4: 18}


def S(en, es, items=(), conf="high"):
    """Un paso: texto en inglés y español, los objetos que usa (shortname o (shortname, cantidad)) y su confianza."""
    return {"en": en, "es": es, "items": list(items), "conf": conf}


def C(date, en, es):
    """Un cambio reciente del monumento."""
    return {"date": date, "en": en, "es": es}


def loot_room(stage, conf="high"):
    """La sala de botín de la red (Livestock, 1/10/2026): la puerta se abre con el interruptor de al lado cuando la red
    llega a su etapa. En el cliente: `generator.hidden.controlroomloot.powergrid` (sólo da corriente con la etapa)
    → `ControlRoomLoot_SimpleSwitch` → OR → puerta; el botón de adentro sale de otro generador que siempre anda."""
    n = STAGE_FUSES[stage]
    return S(
        f"Power grid loot room: once the island grid reaches stage {stage} ({n} Heavy Fuse{'s' if n > 1 else ''} in the Power Plant), flip the switch next to its door to open it. No card or fuse needed; the button inside opens it from within.",
        f"Sala de botín de la red: cuando la red de la isla llega a la etapa {stage} ({n} fusible{'s' if n > 1 else ''} pesado{'s' if n > 1 else ''} en la central), prendé el interruptor que está al lado de la puerta y se abre. No pide tarjeta ni fusible; el botón de adentro la abre desde dentro.",
        [HEAVY], conf)


GREEN_ROOM_LOOT = ("A Blue Keycard and 1 Basic Blueprint Fragment (always, since Meta Shift), plus crates.",
                   "Una tarjeta azul y 1 fragmento de plano básico (siempre, desde Meta Shift), más cajas.")
BLUE_ROOM_LOOT = ("A Red Keycard and 2 Basic Blueprint Fragments next to it (always, since Meta Shift), plus crates.",
                  "Una tarjeta roja y 2 fragmentos de plano básicos al lado (siempre, desde Meta Shift), más cajas.")
META_GREEN = C("2025-10-02", "Meta Shift: green rooms always hold 1 Basic Blueprint Fragment; loot was moved around the monument.",
               "Meta Shift: las salas verdes tienen siempre 1 fragmento de plano básico; el botín del monumento cambió de lugar.")
META_BLUE = C("2025-10-02", "Meta Shift: blue rooms always hold 2 Basic Blueprint Fragments next to the red card; loot was moved around the monument.",
              "Meta Shift: las salas azules tienen siempre 2 fragmentos de plano básicos al lado de la tarjeta roja; el botín del monumento cambió de lugar.")
LIVESTOCK = C("2026-10-01", "Livestock: new power grid loot room, opened by the island grid.",
              "Livestock: sala de botín nueva que abre la red eléctrica de la isla.")
BLOCKERS = C("2026-09-03", "Breach and Clear: monument blockers in front of the red rooms. Most need explosives, a few break with melee; they don't respawn and start to decay after 24 hours.",
             "Breach and Clear: bloqueos delante de las salas rojas. La mayoría se rompe con explosivos y unos pocos a golpes; no vuelven a aparecer y a las 24 h empiezan a deteriorarse.")

MONUMENTS = [
    # ── Antenas parabólicas ────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: generator.static → FuseBox → SimpleSwitch → GCD_A_CardReader (verde) → OR → puerta; el botón de adentro
    # tiene corriente siempre. Fuentes: Corrosion Hour 2018 (dos casillas de metal, fusible en una, interruptor atrás,
    # puerta verde en la otra), GamesOMG oct. 2026 (lo mismo), Meta Shift 2/10/2025 (fragmento).
    {
        "id": "satellite-dish", "conf": "high", "cards": {"green": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("Find the two metal sheds under the dishes. The fuse box is in the one without the green door: put a fuse in.",
              "Buscá las dos casillas de metal debajo de las antenas. La caja de fusible está en la que no tiene puerta verde: poné un fusible.", [FUSE]),
            S("Flip the switch on the outside of that same shed. It powers the green reader while the fuse lasts (about 3 min 20 s).",
              "Prendé el interruptor de afuera de esa misma casilla. Le da corriente al lector verde mientras dure el fusible (unos 3 min 20 s)."),
            S("Walk to the other shed and swipe the green card at its door.",
              "Andá a la otra casilla y pasá la tarjeta verde por la puerta.", [GREEN]),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [META_GREEN],
    },
    # ── La cúpula ───────────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox (lado oeste, a 6 m de altura) → SimpleSwitch → lector verde (lado norte, misma altura); recicladora
    # en la escena. Bombas de crudo (CrudeOilProducer, etapa 1) y el interruptor de las plataformas (etapa 3).
    # Fuentes: Facepunch Meta Shift ("Added puzzles to ... sphere tank", "Added a recycler to sphere tank"), Facepunch y
    # Rustafied Power Trip (bombas, manguera, módulo cisterna), GamesOMG oct. 2026 (pasos sin recorrer en el juego).
    {
        "id": "the-dome", "conf": "medium", "cards": {"green": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("At the base of the dome, find the fuse box on the outer walkway and put a fuse in.",
              "En la base de la cúpula, buscá la caja de fusible en la pasarela de afuera y poné un fusible.", [FUSE], "medium"),
            S("Flip the switch right next to it. It powers the green reader on the other side of the dome, at the same height.",
              "Prendé el interruptor que está al lado. Le da corriente al lector verde del otro lado de la cúpula, a la misma altura."),
            S("Go around and swipe the green card. The room has a recycler.",
              "Dá la vuelta y pasá la tarjeta verde. La sala tiene una recicladora.", [GREEN]),
            S("Crude oil (Power Trip): with the grid at stage 1 or more, the three pumps fill a car's tanker module through the Hose Tool, but only after someone presses the switch on an oil rig (stage 3 there). Take the crude to a car lift to get it out.",
              "Petróleo (Power Trip): con la red en etapa 1 o más, las tres bombas llenan el módulo cisterna de un auto con la herramienta de manguera, pero sólo después de que alguien apriete el interruptor de una plataforma petrolífera (ahí pide etapa 3). El petróleo se saca en un elevador de autos.",
              ["hosetool", "crude.oil"], "medium"),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [
            C("2025-10-02", "Meta Shift: new green card puzzle and a recycler inside its room.", "Meta Shift: puzzle nuevo de tarjeta verde y una recicladora en su sala."),
            C("2026-08-06", "Power Trip: three crude oil pumps, fed by the oil rig switches.", "Power Trip: tres bombas de petróleo que dependen de los interruptores de las plataformas."),
        ],
    },
    # ── Radtown ─────────────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox → SimpleSwitch (a un metro) → lector verde en el piso de arriba del mismo grupo de casas (11 m);
    # sala de botín de la red en etapa 2. Fuentes: Facepunch Meta Shift (puzzle nuevo), Facepunch Livestock (sala),
    # GamesOMG oct. 2026 (fusible, interruptor, verde; sin recorrer).
    {
        "id": "radtown", "conf": "medium", "cards": {"green": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("Put a fuse in the puzzle fuse box and flip the switch right beside it.",
              "Poné un fusible en la caja del puzzle y prendé el interruptor que está pegado.", [FUSE], "medium"),
            S("The green door is a few meters away, one floor up. Swipe the green card.",
              "La puerta verde está a unos metros, un piso más arriba. Pasá la tarjeta verde.", [GREEN], "medium"),
            loot_room(2),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [C("2025-10-02", "Meta Shift: new green card puzzle.", "Meta Shift: puzzle nuevo de tarjeta verde."), LIVESTOCK],
    },
    # ── Terminal del transbordador ─────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox y SimpleSwitch en el extremo oeste (x −61); el lector verde, en el extremo este (x +59): ~120 m,
    # sin temporizador (lo que corre es el fusible). Sala de botín en etapa 1. Fuentes: Facepunch Meta Shift (puzzle
    # nuevo), Facepunch Livestock (sala), rust-survival.com (la sala verde da al hall de salidas; "community-documented").
    {
        "id": "ferry-terminal", "conf": "medium", "cards": {"green": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("The fuse box and its switch are at one end of the terminal and the green door at the other, about 120 m apart. Put a fuse in and flip the switch.",
              "La caja de fusible y su interruptor están en una punta de la terminal y la puerta verde en la otra, a unos 120 m. Poné un fusible y prendé el interruptor.", [FUSE], "medium"),
            S("Run to the other end and swipe the green card. There is no timer: you have as long as the fuse lasts (about 3 min 20 s).",
              "Corré a la otra punta y pasá la tarjeta verde. No hay temporizador: tenés lo que dure el fusible (unos 3 min 20 s).", [GREEN]),
            loot_room(1),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [C("2025-10-02", "Meta Shift: new green card puzzle.", "Meta Shift: puzzle nuevo de tarjeta verde."), LIVESTOCK],
    },
    # ── Puerto (las dos variantes) ─────────────────────────────────────────────────────────────────────────────────
    # Cliente harbor_1: FuseBox y SimpleSwitch en la planta baja; el lector verde 3 m más arriba, en el mismo edificio.
    # harbor_2: FuseBox adentro y el interruptor del otro lado de la pared; el lector verde a ~43 m, en el hangar.
    # Sala de botín en etapa 1 en los dos. Fuentes: Corrosion Hour 2018, GamesOMG oct. 2026 (contenedores D11, D2 y H2),
    # Facepunch Livestock ("Harbour 1", "Harbour 2").
    {
        "id": "harbor", "conf": "high", "cards": {"green": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("Small harbor: in the two-storey building on the edge, put a fuse in the box on the ground floor and flip the switch next to it.",
              "Puerto chico: en el edificio de dos pisos del borde, poné un fusible en la caja de la planta baja y prendé el interruptor de al lado.", [FUSE]),
            S("Small harbor: go up to the top floor of that same building and swipe the green card.",
              "Puerto chico: subí al piso de arriba de ese mismo edificio y pasá la tarjeta verde.", [GREEN]),
            S("Large harbor: the fuse box is inside the building across from the big red hangar; the switch is on the outside, on the other side of that wall.",
              "Puerto grande: la caja de fusible está adentro del edificio de enfrente del hangar rojo grande; el interruptor, afuera, del otro lado de esa pared.", [FUSE], "medium"),
            S("Large harbor: walk into the hangar; the green door is about halfway down on one side. Swipe the green card.",
              "Puerto grande: entrá al hangar; la puerta verde está más o menos por la mitad, a un costado. Pasá la tarjeta verde.", [GREEN], "medium"),
            loot_room(1),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [META_GREEN, LIVESTOCK],
    },
    # ── Rama de alcantarillado ─────────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox y SimpleSwitch_upstairs en el edificio de arriba (20 m de altura) → los dos lectores verdes, uno
    # bajo tierra (−6 m) y otro a media altura (6 m). Sala de botín en etapa 2. Fuentes: Corrosion Hour 2018 (edificio
    # rojo, túnel, puerta verde), GamesOMG oct. 2026 (dos entradas al túnel), Facepunch Livestock.
    {
        "id": "sewer-branch", "conf": "high", "cards": {"green": 2}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (FUSE, 1)],
        "steps": [
            S("Go into the red building next to the parking lot, put a fuse in the box and flip the switch beside it.",
              "Entrá al edificio rojo que está al lado del estacionamiento, poné un fusible en la caja y prendé el interruptor de al lado.", [FUSE]),
            S("That one switch powers both green doors. Drop into the tunnels and follow them to either one.",
              "Ese interruptor le da corriente a las dos puertas verdes. Bajá a los túneles y seguilos hasta cualquiera de las dos."),
            S("Swipe the green card.", "Pasá la tarjeta verde.", [GREEN]),
            loot_room(2),
        ],
        "reward": GREEN_ROOM_LOOT, "rewardItems": [BLUE, BASIC],
        "changes": [META_GREEN, LIVESTOCK],
    },
    # ── Vertedero ───────────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: sin lectores ni cajas de fusible; sala de botín de la red en etapa 1. Fuentes: Facepunch Livestock (sala),
    # Corrosion Hour 2018 y GamesOMG oct. 2026 (tarjeta verde que aparece en un escritorio; eso es del servidor).
    {
        "id": "junkyard", "conf": "medium", "cards": {}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [],
        "steps": [
            S("No card puzzle here. A green keycard can spawn on a desk, which makes it a starting point for the card chain.",
              "Acá no hay puzzle de tarjeta. En un escritorio puede aparecer una tarjeta verde: sirve para empezar la cadena de tarjetas.", [GREEN], "medium"),
            loot_room(1),
        ],
        "reward": None, "rewardItems": [],
        "changes": [LIVESTOCK],
    },
    # ── Planta potabilizadora ──────────────────────────────────────────────────────────────────────────────────────
    # Cliente: el generador da corriente fija al lector verde (piso alto del edificio central) y a la FuseBox de al lado;
    # la FuseBox → botón de las compuertas (→ volante → compuerta) y → TimerSwitch de 60 s → lector azul (otro edificio,
    # 2.º piso). Adentro, un SimpleSwitch alimenta el botón de salida. Engranajes: generador de etapa 2 → los dos
    # GearBox → tanque. Fuentes: Corrosion Hour 2018 (compuertas con volante, fusible arriba, azul en el edificio grande,
    # interruptor de la oficina para salir), GamesOMG sep. 2026 (igual; "sin puerta verde"), Facepunch Power Trip y
    # Breach and Clear (engranajes: 3 h cada uno, 6 h los dos). DISCREPANCIA: las guías dicen que no hay puerta verde;
    # el cliente tiene un lector verde con corriente fija en el edificio central (no se sabe qué hay adentro).
    {
        "id": "water-treatment-plant", "conf": "high", "cards": {"green": 1, "blue": 1}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(BLUE, 1), (FUSE, 1)],
        "steps": [
            S("Go to the central building with the two blast doors. Hold the use key on the wheel to lift them and duck under (they drop when you let go).",
              "Andá al edificio central de las dos compuertas. Mantené apretada la tecla de usar en el volante para levantarlas y pasá agachado (bajan cuando soltás)."),
            S("Upstairs, put a fuse in the box and start the 60-second timer next to it.",
              "Arriba, poné un fusible en la caja y arrancá el temporizador de 60 segundos que está al lado.", [FUSE]),
            S("Within those 60 seconds, reach the blue door on the second floor of the big building across and swipe the blue card.",
              "En esos 60 segundos, llegá a la puerta azul del segundo piso del edificio grande de enfrente y pasá la tarjeta azul.", [BLUE]),
            S("To get out, flip the switch in the back office: it powers the exit button.",
              "Para salir, prendé el interruptor de la oficina del fondo: le da corriente al botón de salida."),
            S("The central building also has a green door with permanent power (no fuse needed). Guides don't cover what is inside.",
              "En el edificio central también hay una puerta verde con corriente fija (no pide fusible). Las guías no dicen qué hay adentro.", [GREEN], "medium"),
            S("Water production (Power Trip): with the grid at stage 2, put Gears into each of the two gearboxes and turn the wheel. Each full gearbox keeps the roadside water pipes running for 3 hours; both, for 6. Gears are used up.",
              "Producción de agua (Power Trip): con la red en etapa 2, poné engranajes en cada una de las dos cajas y girá el volante. Cada caja llena mantiene 3 horas los caños de agua de las rutas; las dos, 6. Los engranajes se gastan.",
              ["gears"]),
            loot_room(2),
        ],
        "reward": BLUE_ROOM_LOOT, "rewardItems": [RED, (BASIC, 2)],
        "changes": [META_BLUE,
                    C("2026-08-06", "Power Trip: two gearboxes that pressurise the tank and feed the water pipes along roads.", "Power Trip: dos cajas de engranajes que presurizan el tanque y alimentan los caños de agua de las rutas."),
                    C("2026-09-03", "Breach and Clear: the tank was simplified (3 hours per gearbox, 6 with both; output follows the pressure).", "Breach and Clear: el tanque se simplificó (3 horas por caja, 6 con las dos; el caudal sigue a la presión)."),
                    LIVESTOCK],
    },
    # ── Patio ferroviario ──────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: SimpleSwitch (edificio de la recicladora, oeste) y SimpleSwitch (balcón de la torre, 18 m) → AND →
    # FuseBox (2.º piso del edificio principal) → SimpleSwitch → lector verde y lector azul (escalera de afuera, pisos
    # 12 y 18). Torre de carbón: dos lectores verdes con corriente fija (abajo y arriba) y una FuseBox que mueve la
    # máquina. Sala de botín en etapa 2. Fuentes: Corrosion Hour 2018, GamesOMG oct. 2026 (mezcla los dos primeros
    # interruptores en un mismo edificio; el cliente los pone a 140 m), Facepunch Livestock.
    {
        "id": "train-yard", "conf": "high", "cards": {"green": 3, "blue": 1}, "fuseBoxes": 2, "resetMin": 30,
        "needs": [(BLUE, 1), (FUSE, 1)],
        "steps": [
            S("Go into the recycler building through the garage door and flip the switch.",
              "Entrá al edificio de la recicladora por el portón y prendé el interruptor."),
            S("Cross to the tall tower, climb to the top and flip the switch out on the balcony. Both switches must be on.",
              "Cruzá a la torre alta, subí hasta arriba y prendé el interruptor del balcón. Tienen que estar prendidos los dos."),
            S("In the main building, go to the second floor: put a fuse in the box in the back corner and flip the switch beside it.",
              "En el edificio principal, subí al segundo piso: poné un fusible en la caja del rincón del fondo y prendé el interruptor de al lado.", [FUSE]),
            S("Take the outside stairs. One floor up is an optional green door (a small room).",
              "Salí por la escalera de afuera. Un piso más arriba hay una puerta verde opcional (una sala chica).", [GREEN]),
            S("One more floor up, swipe the blue card.", "Un piso más, pasá la tarjeta azul.", [BLUE]),
            S("The coaling tower has two more green doors (bottom and top) with permanent power; its fuse box only runs the coal machinery.",
              "La torre de carbón tiene otras dos puertas verdes (abajo y arriba) con corriente fija; su caja de fusible sólo mueve la máquina de carbón.", [GREEN], "medium"),
            loot_room(2),
        ],
        "reward": BLUE_ROOM_LOOT, "rewardItems": [RED, (BASIC, 2)],
        "changes": [META_BLUE, LIVESTOCK],
    },
    # ── Aeródromo ───────────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox_surface (edificio de oficinas, junto a la pista) → TimerSwitch de 120 s → los 4 lectores verdes
    # (bajo tierra). FuseBox_armory (bajo tierra) → lector azul (sin temporizador). Torre: FuseBox (1) con corriente de
    # la etapa 3 y FuseBox con la de la etapa 4; las dos → XOR → terminal de lanzamientos y → AND → terminal del
    # Chinook; la etapa 3 también abre la puerta de abajo de la torre. Sala de botín en etapa 2. Fuentes: Corrosion
    # Hour 2018 (dos fusibles, temporizador, túnel entre hangares), GamesOMG sep. 2026 (igual), Facepunch y Rustafied
    # Power Trip (terminales; "con la red a medias, sólo lanzamientos"). DISCREPANCIA: las guías hablan de una puerta
    # verde; el cliente tiene cuatro, todas del mismo temporizador.
    {
        "id": "airfield", "conf": "medium", "cards": {"green": 4, "blue": 1}, "fuseBoxes": 4, "resetMin": 30,
        "needs": [(GREEN, 1), (BLUE, 1), (FUSE, 2)],
        "steps": [
            S("In the office building across the runway from the hangars, go in through the garage and into the side room: put a fuse in and start the 2-minute timer.",
              "En el edificio de oficinas de enfrente de los hangares, entrá por el garaje y pasá al cuarto del costado: poné un fusible y arrancá el temporizador de 2 minutos.", [FUSE], "medium"),
            S("Within 2 minutes, take the tunnel entrance between the hangars and swipe the green card at a green door. The timer powers all four underground green doors.",
              "En esos 2 minutos, bajá por la entrada al túnel que está entre los hangares y pasá la tarjeta verde en una puerta verde. El temporizador les da corriente a las cuatro puertas verdes de abajo.", [GREEN], "medium"),
            S("Near the blue door there is a second fuse box: put the second fuse in. It powers the blue reader with no timer.",
              "Cerca de la puerta azul hay otra caja de fusible: poné el segundo fusible. Le da corriente al lector azul sin temporizador.", [FUSE]),
            S("Swipe the blue card.", "Pasá la tarjeta azul.", [BLUE]),
            S("Control tower (Power Trip): its two fuse boxes on the second floor only get power from the island grid, one at stage 3 and the other at stage 4. With a fuse in one live box the small terminal speeds up airdrops; at stage 4 with fuses in both, the big terminal calls a Chinook crate instead (and the small one switches off).",
              "Torre de control (Power Trip): sus dos cajas de fusible del segundo piso sólo tienen corriente con la red de la isla, una en etapa 3 y la otra en etapa 4. Con un fusible en una caja con corriente, la terminal chica acelera los lanzamientos aéreos; en etapa 4 y con fusible en las dos, la terminal grande llama un Chinook con caja (y la chica se apaga).",
              [FUSE, HEAVY], "medium"),
            loot_room(2),
        ],
        "reward": BLUE_ROOM_LOOT, "rewardItems": [RED, (BASIC, 2)],
        "changes": [META_BLUE,
                    C("2026-08-06", "Power Trip: control tower with an airdrop terminal and a Chinook terminal, charged from the grid.", "Power Trip: torre de control con una terminal de lanzamientos y otra del Chinook, que se cargan con la red."),
                    LIVESTOCK],
    },
    # ── Central nuclear ─────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: SimpleSwitch_garage (edificio de la esquina, con su propio lector verde) y SimpleSwitch del edificio del
    # otro extremo → AND → TimerSwitch de 60 s → los 3 lectores verdes del edificio principal. Adentro, SimpleSwitch →
    # FuseBox_control_room (piso de arriba) → los 2 lectores azules. Cajas de fusibles pesados: la grande (15) junto a
    # ese interruptor, la chica (5) movida en Livestock. Recicladora roja arriba; sala de botín en etapa 2. Fuentes:
    # Corrosion Hour 2018, GamesOMG oct. 2026, BisectHosting 24/3/2026 (mismo orden), Rustafied Power Trip (caja de
    # fusibles pesados y recicladora roja en la sala verde; arriba un interruptor y un fusible común abren la azul),
    # Facepunch Power Trip y Livestock.
    {
        "id": "power-plant", "conf": "high", "cards": {"green": 4, "blue": 2}, "fuseBoxes": 1, "resetMin": 30,
        "needs": [(GREEN, 1), (BLUE, 1), (FUSE, 1)],
        "steps": [
            S("Start at the building in the corner with the garage and flip the switch (under the stairs). It also powers the garage's own green door.",
              "Empezá en el edificio de la esquina, el del garaje, y prendé el interruptor (debajo de la escalera). También le da corriente a la puerta verde del garaje.", [], "medium"),
            S("Cross to the small building with the slanted roof at the far side: flip its switch, then start the 60-second timer next to it.",
              "Cruzá al edificio chico de techo inclinado del otro extremo: prendé su interruptor y arrancá el temporizador de 60 segundos de al lado."),
            S("Within 60 seconds, swipe the green card at one of the three green doors of the main building.",
              "En esos 60 segundos, pasá la tarjeta verde en una de las tres puertas verdes del edificio principal.", [GREEN]),
            S("Inside the green room, flip the switch: it powers the fuse box upstairs. The big Heavy Fuse box of the island grid is right there.",
              "Adentro de la sala verde, prendé el interruptor: le da corriente a la caja de fusible de arriba. La caja grande de fusibles pesados de la red está ahí mismo.", [HEAVY]),
            S("Go upstairs, put a fuse in the control room box and swipe the blue card at either blue door.",
              "Subí, poné un fusible en la caja de la sala de control y pasá la tarjeta azul en cualquiera de las dos puertas azules.", [FUSE, BLUE]),
            S("Heavy Fuses only go into the grid boxes (15 slots in the big one, 5 in the small one, which since Livestock is reached from outside through a broken window). They can't be taken out and slowly wear down; with 10 or fewer players online they last four times longer.",
              "Los fusibles pesados van sólo en las cajas de la red (15 lugares en la grande y 5 en la chica, que desde Livestock se alcanza desde afuera por una ventana rota). No se pueden sacar y se gastan de a poco; con 10 jugadores o menos conectados duran cuatro veces más.",
              [(HEAVY, 18)]),
            S("With the grid at stage 4 (18 Heavy Fuses) the red recycler upstairs starts working: it returns 75% and runs a 4-second cycle.",
              "Con la red en etapa 4 (18 fusibles pesados) arranca la recicladora roja de arriba: devuelve el 75 % y hace ciclos de 4 segundos.", [], "medium"),
            loot_room(2),
        ],
        "reward": BLUE_ROOM_LOOT, "rewardItems": [RED, (BASIC, 2)],
        "changes": [META_BLUE,
                    C("2026-08-06", "Power Trip: Heavy Fuse boxes that power the island grid, a red recycler in place of the old green one, and a loot room that needs grid power.", "Power Trip: cajas de fusibles pesados que prenden la red de la isla, una recicladora roja en lugar de la verde y una sala de botín que pide energía de la red."),
                    C("2026-10-01", "Livestock: the small Heavy Fuse box moved (reachable from outside) and Heavy Fuses wear slower on quiet servers.", "Livestock: la caja chica de fusibles pesados se mudó (se alcanza desde afuera) y los fusibles pesados se gastan más lento en servidores con poca gente.")],
    },
    # ── Túnel militar ───────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: FuseBox_Entrance (nivel de arriba, junto a la entrada) → TimerSwitch de 120 s → los 2 lectores verdes.
    # El SimpleSwitch de la sala verde tiene corriente fija y alimenta los 2 lectores azules, la FuseBox_A del
    # laboratorio y un TimerSwitch de 10 s junto a la roja A. La roja A se prende con ese temporizador o con
    # FuseBox_A → SimpleSwitch_Lab (que también prende la roja B). Sala de botín en etapa 3; bloqueos. Fuentes:
    # Corrosion Hour 2018 (un fusible, temporizador, "Storage", "Laboratory", roja con temporizador corto), GamesOMG
    # oct. 2026 (repite esa ruta), Facepunch Breach and Clear y Livestock. DISCREPANCIA: las guías hablan de un fusible y
    # una puerta de cada color; el cliente tiene dos de cada una y un segundo fusible para la segunda roja.
    {
        "id": "military-tunnel", "conf": "medium", "cards": {"green": 2, "blue": 2, "red": 2}, "fuseBoxes": 2, "resetMin": 30,
        "needs": [(GREEN, 1), (BLUE, 1), (RED, 1), (FUSE, 1)],
        "steps": [
            S("Near the entrance, find the fuse box and its 2-minute timer (older guides: through the door marked Armory). Put a fuse in and start the timer.",
              "Cerca de la entrada, buscá la caja de fusible y su temporizador de 2 minutos (en guías viejas: pasando la puerta que dice Armory). Poné un fusible y arrancá el temporizador.", [FUSE], "medium"),
            S("Within 2 minutes, run down the tunnels to the green doors marked Storage and swipe the green card.",
              "En esos 2 minutos, corré por los túneles hasta las puertas verdes que dicen Storage y pasá la tarjeta verde.", [GREEN], "medium"),
            S("Inside, flip the switch. It powers both blue doors, the lab fuse box and a short timer by the first red door.",
              "Adentro, prendé el interruptor. Le da corriente a las dos puertas azules, a la caja de fusible del laboratorio y a un temporizador corto junto a la primera puerta roja."),
            S("Go to the blue door marked Laboratory and swipe the blue card.",
              "Andá a la puerta azul que dice Laboratory y pasá la tarjeta azul.", [BLUE], "medium"),
            S("At the first red door, start the 10-second timer next to it and swipe the red card before it runs out.",
              "En la primera puerta roja, arrancá el temporizador de 10 segundos de al lado y pasá la tarjeta roja antes de que se termine.", [RED]),
            S("Optional: a second fuse in the lab box, plus its switch, powers the second red door (and the first one without the timer).",
              "Opcional: un segundo fusible en la caja del laboratorio, con su interruptor, le da corriente a la segunda puerta roja (y a la primera sin temporizador).", [FUSE, RED], "medium"),
            S("The red rooms have a separate exit door with a button.", "Las salas rojas tienen otra puerta de salida con botón.", [], "medium"),
            loot_room(3),
        ],
        "reward": ("Elite and military crates. Advanced Blueprint Fragments come in pairs from hackable crates and, 1 time in 10, from elite crates.",
                   "Cajas de élite y militares. Los fragmentos de plano avanzados salen de a dos en las cajas hackeables y, 1 de cada 10 veces, en las de élite."),
        "rewardItems": [ADVANCED],
        "changes": [BLOCKERS, LIVESTOCK],
    },
    # ── Zona de lanzamiento ─────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: lector verde con corriente fija (edificio chico junto a los tres silos); adentro FuseBox → SimpleSwitch;
    # otra FuseBox → SimpleSwitch (edificio junto a los contenedores azules); los dos → AND → los 4 lectores rojos del
    # edificio principal. Los botones de salida de las rojas cuelgan de un SimpleSwitch con corriente fija ("main puzzle
    # reset"). Parkour: dos SimpleSwitch → AND → TimerSwitch de 60 s → botón → puerta. Salas de botín en etapa 3 (2).
    # Fuentes: Corrosion Hour 2018, GamesOMG oct. 2026 (igual), Facepunch Power Trip (computadora del satélite),
    # Breach and Clear y Livestock. DISCREPANCIA: Corrosion Hour dice que para salir hay que poner un fusible en
    # "Auxiliary Power"; en el cliente ese interruptor tiene corriente fija.
    {
        "id": "launch-site", "conf": "high", "cards": {"green": 1, "red": 4}, "fuseBoxes": 2, "resetMin": 30,
        "needs": [(GREEN, 1), (RED, 1), (FUSE, 2)],
        "steps": [
            S("At the small building by the three silos, swipe the green card (that reader always has power).",
              "En el edificio chico de los tres silos, pasá la tarjeta verde (ese lector tiene corriente siempre).", [GREEN]),
            S("Inside, put a fuse in the box and flip the switch.", "Adentro, poné un fusible en la caja y prendé el interruptor.", [FUSE]),
            S("Go to the far side of that area, by the two blue containers: put the second fuse in that box and flip its switch. Both switches must be on.",
              "Andá al otro lado de esa zona, junto a los dos contenedores azules: poné el segundo fusible en esa caja y prendé su interruptor. Tienen que estar prendidos los dos.", [FUSE]),
            S("The four red doors of the main building now have power. Swipe the red card at one of them.",
              "Las cuatro puertas rojas del edificio principal ya tienen corriente. Pasá la tarjeta roja en una.", [RED]),
            S("To leave, flip the switch in the Auxiliary Power room on the ground floor: it powers the exit buttons.",
              "Para salir, prendé el interruptor del cuarto Auxiliary Power de la planta baja: les da corriente a los botones de salida.", [], "medium"),
            S("Optional rocket room (no card): flip the switch in the green building marked 011 and the one in the stone building with the metal ramp, drop into the hole by the rocket, start the 60-second timer and cross the beams to the red button.",
              "Sala opcional del cohete (sin tarjeta): prendé el interruptor del edificio verde 011 y el del edificio de piedra con rampa de metal, bajá por el agujero de al lado del cohete, arrancá el temporizador de 60 segundos y cruzá las vigas hasta el botón rojo."),
            S("Satellite Crash (Power Trip): with a well-restored grid, the Satellite Control Computer takes Tech Trash and an Aiming Module and lets you aim where a satellite falls; its crates spill on impact.",
              "Caída del satélite (Power Trip): con la red bastante restablecida, la computadora de control del satélite toma basura electrónica y un módulo de apuntado y deja elegir dónde cae un satélite; sus cajas se desparraman al caer.",
              ["techparts", "aiming.module.mlrs"], "medium"),
            loot_room(3),
        ],
        "reward": ("Elite and military crates in the red rooms, and more elite crates on the roof. Advanced Blueprint Fragments can appear in elite crates (1 in 10).",
                   "Cajas de élite y militares en las salas rojas, y más de élite en el techo. Pueden salir fragmentos de plano avanzados en las de élite (1 de cada 10)."),
        "rewardItems": [ADVANCED],
        "changes": [C("2026-08-06", "Power Trip: Satellite Control Computer and the Satellite Crash event.", "Power Trip: computadora de control del satélite y el evento de la caída."),
                    BLOCKERS, LIVESTOCK],
    },
    # ── Silo misilístico ────────────────────────────────────────────────────────────────────────────────────────────
    # Cliente: un solo lector, rojo, con corriente fija ("keycard reset"): su salida prende un botón, y el botón abre la
    # puerta. La puerta de seguridad (puzzle_security) es un botón con corriente fija. Sin cajas de fusible. Sala de botín
    # en etapa 3; bloqueos. Fuentes: Facepunch Meta Shift (pasa a roja, +3 cajas de élite, fragmentos avanzados),
    # Breach and Clear, Livestock. DISCREPANCIA: GamesOMG (sin recorrer) y rust-survival piden verde, azul y fusible;
    # el cliente no tiene ni lectores verdes o azules ni cajas de fusible.
    {
        "id": "missile-silo", "conf": "medium", "cards": {"red": 1}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [(RED, 1)],
        "steps": [
            S("There is no fuse box. Make your way to the red card door and swipe the red card.",
              "No hay caja de fusible. Llegá hasta la puerta roja y pasá la tarjeta roja.", [RED]),
            S("The reader doesn't open the door by itself: it powers the button next to it. Press the button within 10 seconds.",
              "El lector no abre la puerta solo: le da corriente al botón de al lado. Apretá el botón antes de 10 segundos."),
            S("The security room door elsewhere in the silo opens with a button, no card.",
              "La puerta de la sala de seguridad, en otra parte del silo, se abre con un botón, sin tarjeta.", [], "medium"),
            loot_room(3),
        ],
        "reward": ("Elite loot: 3 extra elite crates were added around the silo in Meta Shift, and Advanced Blueprint Fragments can be found here.",
                   "Botín de élite: en Meta Shift se sumaron 3 cajas de élite por el silo, y acá salen fragmentos de plano avanzados."),
        "rewardItems": [ADVANCED],
        "changes": [C("2025-10-02", "Meta Shift: now a red card monument, with 3 more elite crates.", "Meta Shift: pasa a ser de tarjeta roja, con 3 cajas de élite más."),
                    BLOCKERS, LIVESTOCK],
    },
]

# ── Plataformas petrolíferas ───────────────────────────────────────────────────────────────────────────────────────
# Cliente (las dos): lectores verde, azul y rojo con corriente fija; la FuseBox prende un botón que abre una sala del
# costado (`RecycleOrSwitch`, aunque no hay recicladora). Interruptor de Power Trip: generador de etapa 3 →
# TimerSwitch de 1.200 s (20 min) → OilSwitchBroadcast, junto a la sala roja en la grande y entre la azul y la roja en
# la chica. Caja hackeable (`codelockedhackablecrate_oilrig`) y `CH47ReinforcementListener` (refuerzos en Chinook).
# Reinicio 3.900 s. Bloqueos (14 en la grande, 2 en la chica). Fuentes: Facepunch Power Trip (interruptor, 20 min,
# la chica a la mitad, las dos 1,5×), Rustafied Power Trip ("switches inside the red puzzle rooms"), Facepunch Meta
# Shift (fragmentos avanzados en las plataformas), Breach and Clear (bloqueos). Las guías de las plataformas
# (rustly, frozen-rust, nolimithost) se contradicen en tarjetas y fusibles; se sigue el cliente.
for rig, half in (("large-oil-rig", False), ("oil-rig", True)):
    MONUMENTS.append({
        "id": rig, "conf": "medium", "cards": {"green": 1, "blue": 1, "red": 1}, "fuseBoxes": 1, "resetMin": 65,
        "needs": [(GREEN, 1), (BLUE, 1), (RED, 1)],
        "steps": [
            S("The green, blue and red doors always have power: no fuse is needed for them. Swipe each card as you climb the rig.",
              "Las puertas verde, azul y roja tienen corriente siempre: no piden fusible. Pasá cada tarjeta a medida que subís.", [GREEN, BLUE, RED]),
            S("The fuse box only powers the button of a side room: put a fuse in and press the button to open it.",
              "La caja de fusible sólo le da corriente al botón de una sala del costado: poné un fusible y apretá el botón para abrirla.", [FUSE], "medium"),
            S("Hacking the locked crate takes 15 minutes and calls heavy scientists in by Chinook.",
              "Hackear la caja bloqueada tarda 15 minutos y trae científicos pesados en Chinook.", [], "medium"),
            S("Crude for the Dome (Power Trip): with the grid at stage 3 (10 Heavy Fuses), press the switch by the red room. It sends crude to the Dome for 20 minutes"
              + (", at half the rate of the large rig. Both rigs at once give 1.5 times the crude." if half else ". The small rig pumps at half this rate; both at once give 1.5 times the crude."),
              "Petróleo para la cúpula (Power Trip): con la red en etapa 3 (10 fusibles pesados), apretá el interruptor de al lado de la sala roja. Manda petróleo a la cúpula durante 20 minutos"
              + (", a la mitad de lo que manda la grande. Las dos a la vez dan 1,5 veces el petróleo." if half else ". La chica bombea a la mitad; las dos a la vez dan 1,5 veces el petróleo."),
              [HEAVY], "medium"),
        ],
        "reward": ("Military and elite crates and the hackable locked crate. Advanced Blueprint Fragments come in pairs from the hackable crate.",
                   "Cajas militares y de élite y la caja bloqueada hackeable. Los fragmentos de plano avanzados salen de a dos en la hackeable."),
        "rewardItems": [ADVANCED],
        "changes": [C("2026-08-06", "Power Trip: switch near the red room that pumps crude to the Dome.", "Power Trip: interruptor junto a la sala roja que bombea petróleo a la cúpula."),
                    BLOCKERS],
    })

MONUMENTS += [
    # ── Base de investigación polar ────────────────────────────────────────────────────────────────────────────────
    # Cliente: dos lectores azules, uno en cada garaje (izquierdo y derecho), con corriente fija del generador "main
    # puzzle reset"; sin cajas de fusible ni lectores verdes. Fuentes: Facepunch Meta Shift (arreglos de las salas azules
    # de la base polar). DISCREPANCIA: GamesOMG (sin recorrer) pide verde, azul y fusible; el cliente no.
    {
        "id": "arctic-research-base", "conf": "medium", "cards": {"blue": 2}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [(BLUE, 1)],
        "steps": [
            S("Each of the two garages has a blue door with permanent power: no fuse or switch. Swipe the blue card.",
              "Cada uno de los dos garajes tiene una puerta azul con corriente fija: no hay fusible ni interruptor. Pasá la tarjeta azul.", [BLUE]),
            S("Scientists guard the base: clear them before the run.", "La base está custodiada por científicos: limpiala antes.", [], "medium"),
        ],
        "reward": ("Crates; what spawns inside is not confirmed by more than one source.",
                   "Cajas; lo que aparece adentro no lo confirma más de una fuente."),
        "rewardItems": [],
        "changes": [C("2025-10-02", "Meta Shift: the blue card rooms no longer close or reset with players inside.", "Meta Shift: las salas azules ya no se cierran ni se reinician con jugadores adentro.")],
    },
    # ── Gasolinera Oxum, supermercado y faro ────────────────────────────────────────────────────────────────────────
    # Cliente: ninguno tiene lectores ni cajas de fusible. Gasolinera: generador de etapa 1 + generador chico a
    # combustible → OR → interruptor de afuera → puerta del garaje y elevador. Supermercado: heladera de botín con
    # generador de etapa 1. Fuentes: Corrosion Hour 2018 y GamesOMG oct. 2026 (tarjeta verde en un escritorio en los
    # tres), Facepunch y Rustafied Power Trip (garaje y congelador).
    {
        "id": "oxums-gas-station", "conf": "medium", "cards": {}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [],
        "steps": [
            S("No card puzzle. A green keycard can spawn on a desk inside.", "No hay puzzle de tarjeta. Adentro puede aparecer una tarjeta verde en un escritorio.", [GREEN], "medium"),
            S("Car garage (Power Trip): it gets power from the island grid (stage 1) or from the small backup generator on the side, which burns Low Grade Fuel. With power, the switch on the outer wall opens the garage door and the car lift works.",
              "Garaje (Power Trip): toma corriente de la red de la isla (etapa 1) o del generador chico de reserva del costado, que quema combustible de grado bajo. Con corriente, el interruptor de la pared de afuera abre el portón y anda el elevador de autos.",
              ["lowgradefuel"]),
        ],
        "reward": None, "rewardItems": [],
        "changes": [C("2026-08-06", "Power Trip: working garage with a car lift.", "Power Trip: garaje con elevador de autos que funciona.")],
    },
    {
        "id": "abandoned-supermarket", "conf": "medium", "cards": {}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [],
        "steps": [
            S("No card puzzle. A green keycard can spawn on a desk inside.", "No hay puzzle de tarjeta. Adentro puede aparecer una tarjeta verde en un escritorio.", [GREEN], "medium"),
            S("Freezer (Power Trip): while the island grid is at stage 1 or more, the freezer restocks with chilled food, with a bigger restock every few cycles.",
              "Congelador (Power Trip): mientras la red de la isla esté en etapa 1 o más, el congelador se llena de comida fría, con una carga más grande cada tantas vueltas.", [HEAVY]),
        ],
        "reward": None, "rewardItems": [],
        "changes": [C("2026-08-06", "Power Trip: freezer powered by the grid.", "Power Trip: congelador que anda con la red.")],
    },
    {
        "id": "lighthouse", "conf": "medium", "cards": {}, "fuseBoxes": 0, "resetMin": 30,
        "needs": [],
        "steps": [
            S("No card puzzle. A green keycard can spawn on a desk at the top, which makes it a starting point for the card chain.",
              "No hay puzzle de tarjeta. Arriba puede aparecer una tarjeta verde en un escritorio: sirve para empezar la cadena de tarjetas.", [GREEN], "medium"),
        ],
        "reward": None, "rewardItems": [],
        "changes": [],
    },
]


def build(items_list):
    items = Items(items_list, [])
    known = {i["id"] for i in items_list}

    def ref(x):
        sid, n = (x, 1) if isinstance(x, str) else x
        if sid not in known:
            raise KeyError(f"{sid} no está en items.json")
        return {"item": items.ref(sid), "n": n}

    out = {}
    for m in MONUMENTS:
        out[m["id"]] = {
            "conf": m["conf"],
            "verified": VERIFIED,
            "cards": m["cards"],
            "fuseBoxes": m["fuseBoxes"],
            "resetMin": m["resetMin"],
            "needs": [ref(x) for x in m["needs"]],
            "steps": [{"en": s["en"], "es": s["es"], "conf": s["conf"], "items": [ref(x) for x in s["items"]]} for s in m["steps"]],
            "reward": {"en": m["reward"][0], "es": m["reward"][1], "items": [ref(x) for x in m["rewardItems"]]} if m["reward"] else None,
            "changes": m["changes"],
        }
    return {"verified": VERIFIED, "monuments": out}


def main():
    with open(DATA / "items.json", encoding="utf-8") as f:
        items_list = json.load(f)["items"]
    doc = build(items_list)
    dump(DATA / "puzzles.json", doc)
    print(f"[rust] puzzles: {len(doc['monuments'])} monumentos")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
