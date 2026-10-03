"""
Los nombres en inglés y en español rioplatense de lo que el botín nombra y el juego no (o no sirve tal cual), para los
archivos de data/loot (2026-10-01): muebles, partes de vehículo, grupos de vehículo, atuendos de zombi, escondites y
zonas. Los usa `loot.py`.

Por qué a mano:
  - Los muebles sí tienen nombre en el juego (`IGUI_ContainerTitle_*` de Translate/<idioma>/IG_UI.json), pero son
    ambiguos para elegir dónde buscar: `counter`, `overhead` y `cupboard` son los tres "Armario"; `sidetable`,
    `dresser` y `officedrawers`, los tres "Cajón". Y vienen en mexicano o en español de España ("Refrigerador",
    "Nevera"). Acá cada uno tiene un nombre distinto y en rioplatense (heladera, mesada, alacena), como los cuartos de
    site/src/zomboid/map/rooms.ts.
  - Los grupos de vehículo, los atuendos de zombi, los escondites y las zonas son claves internas que el juego nunca
    muestra (`StepVan_MarineBites`, `Survivalist03_Mid`, `SafehouseLoot_Late`).

Lo que falta en una tabla no se inventa: `name()` lo devuelve con el nombre del juego separado en palabras, igual en los
dos idiomas, y avisa por stderr para que se escriba (test_loot.py exige que no falte ninguno de los que se usan).
"""
import re, sys

# El mueble: qué es en una casa o un negocio de Kentucky dicho como se dice acá. Cubre los 72 tipos de los cuartos y
# los de `all`, más `all` mismo (los 3 cuartos que tiran la misma tabla en cualquier mueble: `empty`, `sodatruck`…).
CONTAINERS = {
    "all": ("Any furniture", "Cualquier mueble"),
    "other": ("Other furniture", "Otros muebles"),
    "counter": ("Counter", "Mesada"),
    "overhead": ("Overhead cupboard", "Alacena"),
    "cupboard": ("Cupboard", "Aparador"),
    "shelves": ("Shelves", "Estante"),
    "metal_shelves": ("Metal shelves", "Estantería de metal"),
    "fridge": ("Fridge", "Heladera"),
    "freezer": ("Freezer", "Freezer"),
    "locker": ("Locker", "Casillero"),
    "militarylocker": ("Military locker", "Casillero militar"),
    "desk": ("Desk", "Escritorio"),
    "schooldesk": ("School desk", "Pupitre"),
    "clothingrack": ("Clothing rack", "Perchero"),
    "restaurantdisplay": ("Restaurant display", "Exhibidor del restaurante"),
    "sidetable": ("Side table", "Mesa de luz"),
    "stove": ("Oven", "Horno"),
    "woodstove": ("Wood stove", "Salamandra"),
    "displaycase": ("Display case", "Vitrina"),
    "displaycasebakery": ("Bakery display case", "Vitrina de panadería"),
    "displaycasebutcher": ("Butcher display case", "Vitrina de carnicería"),
    "dresser": ("Dresser", "Cómoda"),
    "wardrobe": ("Wardrobe", "Ropero"),
    "filingcabinet": ("Filing cabinet", "Archivero"),
    "officedrawers": ("Office drawers", "Cajonera de oficina"),
    "toolcabinet": ("Tool cabinet", "Armario de herramientas"),
    "shelvesmag": ("Magazine stand", "Revistero"),
    "bin": ("Trash can", "Tacho de basura"),
    "dumpster": ("Dumpster", "Contenedor de basura"),
    "crate": ("Crate", "Cajón"),
    "militarycrate": ("Military crate", "Cajón militar"),
    "smallbox": ("Small box", "Caja chica"),
    "cardboardbox": ("Cardboard box", "Caja de cartón"),
    "clothingdryerbasic": ("Laundry cart", "Carrito de lavandería"),
    "clothingdryer": ("Clothes dryer", "Secarropas"),
    "clothingwasher": ("Washing machine", "Lavarropas"),
    "grocerstand": ("Produce stand", "Exhibidor de verdulería"),
    "medicine": ("Medicine cabinet", "Botiquín"),
    "microwave": ("Microwave", "Microondas"),
    "fireplace": ("Fireplace", "Chimenea"),
    "dishescabinet": ("China cabinet", "Mueble de vajilla"),
    "dishwasher": ("Dishwasher", "Lavavajillas"),
    "plankstash": ("Floorboard stash", "Escondite bajo el piso"),
    "barbecue": ("Barbecue", "Parrilla"),
    "barbecuepropane": ("Gas barbecue", "Parrilla a gas"),
    "doghouse": ("Doghouse", "Cucha"),
    "tent": ("Tent", "Carpa"),
    "shelter": ("Shelter", "Refugio"),
    "SurvivorCrate": ("Survivor crate", "Cajón de sobreviviente"),
    "GunBox": ("Ammo crate", "Cajón de munición"),
    # Las cajas de los escondites de escopetas y médicos están bajo el piso (son plankstash con otro nombre).
    "ShotgunBox": ("Floorboard stash", "Escondite bajo el piso"),
    "MedicalBox": ("Floorboard stash", "Escondite bajo el piso"),
    "BombBox": ("Explosives box", "Caja de explosivos"),
    "BoozeBox": ("Booze box", "Caja de bebidas"),
    "FoodBox": ("Food box", "Caja de comida"),
    "ToolsBox": ("Tool box", "Caja de herramientas"),
    "safe": ("Safe", "Caja fuerte"),
    "campfire": ("Campfire", "Fogata"),
    "brazier": ("Brazier", "Brasero"),
    "cashregister": ("Cash register", "Caja registradora"),
    "coffin": ("Coffin", "Ataúd"),
    "composter": ("Composter", "Compostera"),
    "logs": ("Log pile", "Pila de troncos"),
    "newspaper_dispatch": ("Newspaper box", "Expendedor de diarios"),
    "newspaper_herald": ("Newspaper box", "Expendedor de diarios"),
    "newspaper_knews": ("Newspaper box", "Expendedor de diarios"),
    "newspaper_times": ("Newspaper box", "Expendedor de diarios"),
    "postbox": ("Mailbox", "Buzón"),
    "trough": ("Trough", "Bebedero"),
    "vendingpop": ("Soda machine", "Máquina de gaseosas"),
    "vendingsnack": ("Snack machine", "Máquina de golosinas"),
}

PARTS = {
    "GloveBox": ("Glove box", "Guantera"),
    "TruckBed": ("Trunk", "Baúl"),
    "TruckBedOpen": ("Truck bed", "Caja de carga"),
    "TrailerTrunk": ("Trailer", "Acoplado"),
    "SeatFrontLeft": ("Driver's seat", "Asiento del conductor"),
    "SeatFrontRight": ("Front passenger seat", "Asiento del acompañante"),
    "SeatRearLeft": ("Rear left seat", "Asiento trasero izquierdo"),
    "SeatRearRight": ("Rear right seat", "Asiento trasero derecho"),
    "SeatMiddleLeft": ("Middle left seat", "Asiento del medio izquierdo"),
    "SeatMiddleRight": ("Middle right seat", "Asiento del medio derecho"),
}


def split_words(key):
    """`StepVan_MarineBites` → "Step Van Marine Bites": el nombre del juego dicho en palabras."""
    s = key.replace("_", " ")
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _trade(en, es):
    """El vehículo de un oficio. En español, el oficio en minúscula y, si es una profesión del juego, con el nombre que
    le da el juego en data/site/professions.json (Welder → "obrero metalúrgico")."""
    return (f"{en}'s vehicle", f"Vehículo de {es}")


VEHICLES = {
    "NormalStandard": ("Regular car", "Auto común"),
    "NormalHeavy": ("Truck or van", "Camioneta o furgón"),
    "NormalLuxury": ("Luxury car", "Auto de lujo"),
    "NormalSports": ("Sports car", "Auto deportivo"),
    "Police": ("Police car", "Patrullero"),
    "PoliceSheriff": ("Sheriff's car", "Patrullero del sheriff"),
    "PoliceState": ("State police car", "Patrullero de la policía estatal"),
    "PoliceDetective": ("Unmarked police car", "Auto de detective"),
    "PoliceSWAT": ("SWAT truck", "Camión de los SWAT"),
    "Ambulance": ("Ambulance", "Ambulancia"),
    "Fire": ("Fire truck", "Autobomba"),
    "Taxi": ("Taxi", "Taxi"),
    "Postal": ("Mail truck", "Camioneta del correo"),
    "ArmyLight": ("Army vehicle (light)", "Vehículo del ejército (liviano)"),
    "ArmyHeavy": ("Army vehicle (heavy)", "Vehículo del ejército (pesado)"),
    # Oficios (con el nombre de la profesión del juego cuando existe).
    "Blacksmith": _trade("Blacksmith", "herrero"),
    "Butcher": _trade("Butcher", "carnicero"),
    "Carpenter": _trade("Carpenter", "carpintero"),
    "ConstructionWorker": _trade("Construction worker", "obrero"),
    "Doctor": _trade("Doctor", "médico"),
    "Electrician": _trade("Electrician", "electricista"),
    "Exterminator": _trade("Exterminator", "fumigador"),
    "Farmer": _trade("Farmer", "granjero"),
    "Fisherman": _trade("Fisherman", "pescador"),
    "Gardener": _trade("Gardener", "jardinero"),
    "Glass": _trade("Glassblower", "vidriero"),
    "Hunter": _trade("Hunter", "cazador"),
    "Leather": _trade("Leatherworker", "talabartero"),
    "Mason": _trade("Mason", "albañil"),
    "Mechanic": _trade("Mechanic", "mecánico"),
    "MetalWelder": _trade("Welder", "obrero metalúrgico"),
    "Nurse": _trade("Nurse", "enfermera"),
    "Painter": _trade("Painter", "pintor"),
    "Plumber": _trade("Plumber", "plomero"),
    "PrisonGuard": _trade("Prison guard", "guardiacárcel"),
    "Rancher": _trade("Rancher", "ganadero"),
    "Ranger": _trade("Park ranger", "guardia forestal"),
    "Tailoring": _trade("Tailor", "sastre"),
    # Gente que no es un oficio: el mismo patrón, dicho con lo que lleva en el auto.
    "Adventurer": _trade("Adventurer", "aventurero"),
    "Bandit": _trade("Bandit", "bandido"),
    "Camper": ("Camper's vehicle", "Vehículo de campamento"),
    "Dancer": _trade("Dancer", "bailarín"),
    "Drinker": _trade("Drinker", "bebedor"),
    "Evacuee": _trade("Evacuee", "evacuado"),
    "Golf": _trade("Golfer", "golfista"),
    "PackRat": _trade("Hoarder", "acumulador"),
    "Survivalist": _trade("Survivalist", "supervivencialista"),
    "BadTeens": ("Teenagers' car", "Auto de adolescentes"),
    # Repartos y empresas (las marcas del juego quedan igual en los dos idiomas).
    "Catering": ("Catering van", "Camioneta de catering"),
    "Clothing": ("Clothing delivery vehicle", "Vehículo de reparto de ropa"),
    "Courier": ("Courier vehicle", "Vehículo de mensajería"),
    "Distillery": ("Distillery vehicle", "Vehículo de destilería"),
    "Eggs": ("Egg delivery vehicle", "Vehículo de reparto de huevos"),
    "Fossoil": ("Fossoil vehicle", "Vehículo de Fossoil"),
    "Groceries": ("Grocery delivery vehicle", "Vehículo de reparto de almacén"),
    "Heralds": ("Newspaper delivery vehicle (Herald)", "Vehículo de reparto de diarios (Herald)"),
    "KnoxDistillery": ("Knox Distillery vehicle", "Vehículo de Knox Distillery"),
    "Laundry": ("Laundry vehicle", "Vehículo de lavandería"),
    "MassGenFac": ("MassGenFac vehicle", "Vehículo de MassGenFac"),
    "McCoy": ("McCoy Logging vehicle", "Vehículo de la maderera McCoy"),
    "MobileLibrary": ("Mobile library", "Biblioteca móvil"),
    "NNN": ("News van (NNN)", "Camioneta de noticias (NNN)"),
    "PickUpTruckLights_Airport": ("Airport pickup truck", "Camioneta del aeropuerto"),
    "Propane": ("Propane truck", "Camión de gas"),
    "Radio": ("Radio station van", "Camioneta de la radio"),
    "Spiffo": ("Spiffo's van", "Camioneta de Spiffo's"),
    "Transit": ("Transit authority vehicle", "Vehículo del transporte público"),
    "VanSeats_AirportShuttle": ("Airport shuttle", "Combi del aeropuerto"),
}
# Los furgones y camionetas de reparto: "<tipo> (<marca>)", con la marca en palabras e igual en los dos idiomas.
for _brand in ("AirportCatering", "Beer", "Cereal", "Chips", "Florist", "Genuine_Beer", "MarineBites", "Plonkies",
               "Soda", "Windows", "Zippee"):
    VEHICLES[f"StepVan_{_brand}"] = (f"Step van ({split_words(_brand)})", f"Furgón ({split_words(_brand)})")
for _brand in ("Beer", "CraftSupplies", "Locksmith"):
    VEHICLES[f"Van_{_brand}"] = (f"Van ({split_words(_brand)})", f"Camioneta ({split_words(_brand)})")

# Los atuendos sin el número ni el sufijo de etapa (Survivalist02_Mid es Survivalist con el sufijo de etapa). La fila
# de la ficha dice "Zombi: <nombre>", así que van como sustantivo.
_OUTFIT_BASE = {
    "Agent": ("Federal agent", "Agente federal"),
    "AirportSecurityTarmac": ("Airport security", "Seguridad del aeropuerto"),
    "AmbulanceDriver": ("Paramedic", "Paramédico"),
    "ArmyCamoDesert": ("Soldier (desert camo)", "Soldado (camuflaje del desierto)"),
    "ArmyCamoGreen": ("Soldier (green camo)", "Soldado (camuflaje verde)"),
    "Backpacker": ("Backpacker", "Mochilero"),
    "Bandit": ("Bandit", "Bandido"),
    "BaseballPlayer_KY": ("Baseball player (KY)", "Jugador de béisbol (KY)"),
    "BaseballPlayer_Rangers": ("Baseball player (Rangers)", "Jugador de béisbol (Rangers)"),
    "BaseballPlayer_Z": ("Baseball player (Z)", "Jugador de béisbol (Z)"),
    "Bathrobe": ("In a bathrobe", "En bata"),
    "Biker": ("Biker", "Motoquero"),
    "BountyHunter": ("Bounty hunter", "Cazarrecompensas"),
    "Camper": ("Camper", "Acampante"),
    "Classy": ("Well-dressed", "Bien vestido"),
    "ClubGoer": ("Clubgoer", "Bolichero"),
    "ConstructionWorker": ("Construction worker", "Obrero"),
    "Cook_Generic": ("Cook", "Cocinero"),
    "Cook_Spiffos": ("Spiffo's cook", "Cocinero de Spiffo's"),
    "CostumeWildWestBoss": ("Wild West boss (costume)", "Jefe del Lejano Oeste (disfraz)"),
    "CostumeWildWestLawman": ("Wild West lawman (costume)", "Comisario del Lejano Oeste (disfraz)"),
    "CostumeWildWestMayor": ("Wild West mayor (costume)", "Intendente del Lejano Oeste (disfraz)"),
    "CostumeWildWestOutlaw": ("Wild West outlaw (costume)", "Forajido del Lejano Oeste (disfraz)"),
    "Cultist": ("Cultist", "Miembro de la secta"),
    "Detective": ("Detective", "Detective"),
    "Doctor": ("Doctor", "Médico"),
    "Evacuee": ("Evacuee", "Evacuado"),
    "ExterminatorSuited": ("Exterminator", "Fumigador"),
    "Farmer": ("Farmer", "Granjero"),
    "FiremanFullSuit": ("Firefighter", "Bombero"),
    "FiremanStripper": ("Firefighter stripper", "Stripper vestido de bombero"),
    "Fisherman": ("Fisherman", "Pescador"),
    "Foreman": ("Foreman", "Capataz"),
    "Fossoil": ("Fossoil attendant", "Playero de Fossoil"),
    "Gas2Go": ("Gas-2-Go attendant", "Playero de Gas-2-Go"),
    "Gaudy": ("Flashy dresser", "Vestido llamativo"),
    "Ghillie": ("Ghillie suit", "Traje ghillie"),
    "Golfer": ("Golfer", "Golfista"),
    "Goth": ("Goth", "Gótico"),
    "Grunge": ("Grunge", "Grunge"),
    "GuitarGuy": ("Guitarist", "Guitarrista"),
    "Hobbo": ("Hobo", "Linyera"),
    "Hobbyist": ("Hobbyist", "Aficionado"),
    "HonorStudent": ("Honor student", "Alumno ejemplar"),
    "HospitalPatient": ("Hospital patient", "Paciente de hospital"),
    "HospitalPatientBathrobe": ("Hospital patient (bathrobe)", "Paciente de hospital (en bata)"),
    "Hunter": ("Hunter", "Cazador"),
    "Inmate": ("Inmate", "Preso"),
    "InmateKhaki": ("Inmate (khaki)", "Preso (caqui)"),
    "McCoys": ("McCoy Logging worker", "Trabajador de la maderera McCoy"),
    "Mechanic": ("Mechanic", "Mecánico"),
    "MetalWorker": ("Metalworker", "Metalúrgico"),
    "Mob": ("Mobster", "Mafioso"),
    "Naked": ("Naked", "Desnudo"),
    "NakedVeil": ("Naked with a veil", "Desnudo con velo"),
    "Nurse": ("Nurse", "Enfermero"),
    "OfficeWorker": ("Office worker", "Oficinista"),
    "OfficeWorkerSkirt": ("Office worker (skirt)", "Oficinista (pollera)"),
    "Pharmacist": ("Pharmacist", "Farmacéutico"),
    "PokerDealer": ("Poker dealer", "Crupier de póker"),
    "Police": ("Police officer", "Policía"),
    "PoliceState": ("State trooper", "Policía estatal"),
    "PoliceStripper": ("Police stripper", "Stripper vestido de policía"),
    "Priest": ("Priest", "Cura"),
    "PrisonGuard": ("Prison guard", "Guardiacárcel"),
    "PrivateMilitia": ("Militia member", "Miliciano"),
    "Punk": ("Punk", "Punk"),
    "Raider": ("Raider", "Saqueador"),
    "Ranger": ("Park ranger", "Guardia forestal"),
    # Redneck queda igual: el juego no lo traduce (no hay clave en ES_MX) y "Paisano" en rioplatense es "compatriota";
    # "campesino" o "gaucho" cambian de significado. Es un préstamo usado así, como Punk o Stripper.
    "Redneck": ("Redneck", "Redneck"),
    "Rocker": ("Rocker", "Rockero"),
    "Sanitation": ("Sanitation worker", "Recolector de basura"),
    "Stripper": ("Stripper", "Stripper"),
    "StripperBlack": ("Stripper (in black)", "Stripper (de negro)"),
    "StripperNaked": ("Stripper (naked)", "Stripper (desnudo)"),
    "StripperPink": ("Stripper (in pink)", "Stripper (de rosa)"),
    "Student": ("Student", "Estudiante"),
    "Survivalist": ("Survivalist", "Supervivencialista"),
    "Teacher": ("Teacher", "Maestro"),
    "ThunderGas": ("Thunder Gas attendant", "Playero de Thunder Gas"),
    "Tourist": ("Tourist", "Turista"),
    "Trader": ("Trader", "Comerciante"),
    "Trucker": ("Trucker", "Camionero"),
    "Varsity": ("Varsity athlete", "Deportista universitario"),
    "Waiter_Classy": ("Waiter (fancy restaurant)", "Mozo (restaurante elegante)"),
    "Waiter_Diner": ("Waiter (diner)", "Mozo (bodegón)"),
    "Waiter_Market": ("Waiter (market)", "Mozo (mercado)"),
    "Waiter_PileOCrepe": ("Waiter (Pile-o-Crepe)", "Mozo (Pile-o-Crepe)"),
    "Waiter_PizzaWhirled": ("Waiter (Pizza Whirled)", "Mozo (Pizza Whirled)"),
    "Waiter_Restaurant": ("Waiter (restaurant)", "Mozo (restaurante)"),
    "Waiter_Spiffo": ("Waiter (Spiffo's)", "Mozo (Spiffo's)"),
    "Waiter_TacoDelPancho": ("Waiter (Taco del Pancho)", "Mozo (Taco del Pancho)"),
    "Woodcut": ("Lumberjack", "Leñador"),
    # Los que tienen nombre propio en el juego: iguales en los dos idiomas, salvo el cargo.
    "Judge_Matt_Hass": ("Judge Matt Hass", "Juez Matt Hass"),
    "Mayor_West_point": ("Mayor of West Point", "Intendente de West Point"),
    "Rev_Peter_Watts": ("Rev. Peter Watts", "Rev. Peter Watts"),
}
for _who in ("Bob", "Kate", "Joan", "John", "Duke", "Dean", "Nolan", "Groucho", "Jackie_Jaye", "Kirsty_Kormick",
             "Frank_Hemingway", "Sir_Twiggy"):
    _OUTFIT_BASE[_who] = (_who.replace("_", " "),) * 2

# Las etapas de la partida en que aparece el atuendo (los bandidos y supervivencialistas cambian de ropa y de botín).
_STAGES = {"_Early": (" (early)", " (al principio)"), "_Mid": (" (mid-game)", " (a mitad de partida)"),
           "_Late": (" (late game)", " (avanzada la partida)")}
# Las variantes numeradas del juego (Survivalist02…05): el número no se nombra, son la misma gente con otra ropa.
_NUMBERED = {"Survivalist": ("02", "03", "04", "05")}

OUTFITS = dict(_OUTFIT_BASE)
for _base, _stages in (("Bandit", ("_Early", "_Mid", "_Late")), ("Survivalist", ("_Mid", "_Late"))):
    for _num in ("",) + _NUMBERED.get(_base, ()):
        for _st in ("",) + _stages:
            en, es = _OUTFIT_BASE[_base]
            sen, ses = _STAGES.get(_st, ("", ""))
            OUTFITS[f"{_base}{_num}{_st}"] = (en + sen, es + ses)

STASHES = {
    "BombCache1": ("Explosives stash", "Escondite de explosivos"),
    "BoozeCache1": ("Booze stash", "Escondite de bebidas"),
    "FoodCache1": ("Food stash", "Escondite de comida"),
    "GunCache1": ("Gun stash", "Escondite de armas"),
    "GunCache2": ("Gun stash", "Escondite de armas"),
    "MedicalCache1": ("Medical stash", "Escondite médico"),
    "ShotgunCache1": ("Shotgun stash", "Escondite de escopetas"),
    "ShotgunCache2": ("Shotgun stash", "Escondite de escopetas"),
    "SurvivorCache1": ("Survivor stash", "Escondite de sobreviviente"),
    "SurvivorCache2": ("Survivor stash", "Escondite de sobreviviente"),
    "SurvivorCacheBigBuilding": ("Survivor stash (large building)", "Escondite de sobreviviente (edificio grande)"),
    "ToolsCache1": ("Tool stash", "Escondite de herramientas"),
    "SafehouseLoot": ("Survivor safehouse", "Refugio de sobreviviente"),
    "SafehouseLoot_Mid": ("Survivor safehouse (mid-game)", "Refugio de sobreviviente (a mitad de partida)"),
    "SafehouseLoot_Late": ("Survivor safehouse (late game)", "Refugio de sobreviviente (avanzada la partida)"),
}

# La zona de una lista forzada: la frase entera, porque va sola en la fila ("sólo en barrios ricos").
ZONES = {
    "Rich": ("only in rich neighborhoods", "sólo en barrios ricos"),
    "Poor": ("only in poor neighborhoods", "sólo en barrios pobres"),
    "TrailerPark": ("only in trailer parks", "sólo en parques de casas rodantes"),
    "University": ("only at the university", "sólo en la universidad"),
    "Cultists": ("only at the cult's compound", "sólo en el complejo de la secta"),
}

_warned = set()


def name(table, key, fallback_en=None):
    """
    (en, es) de `key` en `table`. Si no está, el nombre del juego (`fallback_en`, o la clave separada en palabras),
    igual en los dos idiomas, con un aviso por stderr (una vez por clave): mejor un nombre en inglés que un hueco, y el
    aviso dice qué escribir.
    """
    if key in table:
        return table[key]
    en = fallback_en or split_words(key)
    if key not in _warned:
        _warned.add(key)
        print(f"loot_names.py: aviso: falta el nombre de {key!r} (va {en!r} en los dos idiomas)", file=sys.stderr)
    return (en, en)
