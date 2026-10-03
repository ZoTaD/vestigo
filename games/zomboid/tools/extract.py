"""
Project Zomboid → los datos de la wiki (2026-09-30, Build 42).

Lee TU instalación del juego (sólo lectura: scripts, traducciones, .pack y el
.jar) y escribe:

  games/zomboid/data/items.json          el índice de ítems: id, nombre en/es, tipo,
                                         categoría, ícono y peso (lo que usan las listas,
                                         el buscador y las recetas), más el nombre de
                                         cada categoría
  games/zomboid/data/items/<tipo>.json   la ficha completa de cada ítem, partida por tipo
                                         (weapon, clothing, food, literature…): stats
                                         normalizadas a número/lista, dónde se aprende lo
                                         que enseña, receta evolutiva, contenedor de líquido
  games/zomboid/data/recipes.json        las craftRecipe del menú de fabricación y las
                                         construcciones (entities), con estación, requisitos,
                                         XP y dónde se aprende cada una
  games/zomboid/data/evolved.json        recetas evolutivas (sopa, ensalada…) y sus ingredientes
  games/zomboid/data/fixing.json         reparaciones del viejo sistema `fixing` (armas de
                                         fuego y chapa de autos: las demás ya son craftRecipe)
  games/zomboid/data/traits.json         rasgos: costo, XP, recetas, exclusiones, ícono
  games/zomboid/data/professions.json    profesiones: costo, XP, rasgos y recetas que dan
  games/zomboid/data/skills.json         cada habilidad (Woodwork = Carpintería): nombre en/es, categoría, XP por
                                         nivel, nivel inicial y sus multiplicadores si no son los generales
  games/zomboid/data/media.json          los VHS y los programas de TV que dan XP y cuánta en cada habilidad
  games/zomboid/data/moodles.json        estados de ánimo: nombre y descripción por nivel
  games/zomboid/data/tags.json           qué ítems tiene cada tag (resuelve `tags[base:saw]`)
  games/zomboid/data/index.json          las fichas del sitio (objetos, recetas, rasgos, profesiones,
                                         habilidades, moodles, y las dos subpáginas de Servidor): slug,
                                         nombre en/es e ids del juego; de acá salen las direcciones y el
                                         sitemap (ver site_index)
  games/zomboid/data/server.json         la pestaña Servidor, con `server.py`: las opciones de sandbox y del
                                         .ini, los presets y cómo se cortan el agua y la luz
  games/zomboid/data/meta.json           versión del juego, build de Steam, cantidades y fecha; los multiplicadores
                                         de XP por bonificación y el nivel tope de los medios grabados
  site/public/zomboid/{items,build,traits,professions,moodles}/*.webp   los íconos que se usan
  games/zomboid/data/site/**             al final, con `site.py`: las listas y las fichas de Objetos y Recetas
                                         repartidas en archivos chicos, y las de Rasgos, Profesiones, Habilidades y
                                         Moodles, con las relaciones resueltas

Uso (una vez por parche, en la PC que tiene el juego):
    python games/zomboid/tools/extract.py
    PZ_DIR=D:/otra/ruta/ProjectZomboid python games/zomboid/tools/extract.py

`extractedAt` sólo cambia si cambió algún dato (JSON o píxeles de un ícono): es
el `lastmod` del sitemap, y una fecha que se mueve sin que cambie nada le enseña
a Google a no creerla.

Corta antes de escribir nada, con un mensaje, si no puede leer la versión del juego
(nunca se deja la del parche anterior: datos de un parche rotulados con el número de
otro son peores que no extraer), si lee menos de 20 moodles, si no puede leer la tabla
de XP, los multiplicadores de bonificación o el nivel inicial de las habilidades, si no
entiende los VHS o si no encuentra ningún libro de habilidad: esas lecturas dependen del
bytecode del .jar y de unos .lua, y un parche que los cambie tiene que romper acá y no
publicar datos a medias (ni inventar un número). También corta
si dos íconos de una carpeta se llaman igual salvo por las mayúsculas (en Windows uno
pisaría al otro) o si dos fichas del sitio quedan con la misma dirección. El build de
Steam, si falta (el juego fuera de Steam), sólo avisa por stderr y queda en null.

Qué se deja afuera, a propósito:
  - Ítems de prueba del desarrollo: nombre con "debug", que empieza con "Test" o que lleva "DEV" como palabra
    suelta entre guiones bajos (Hat_SantaHatDebug, YardstickDEBUG, TestMug, FISH_DEV_ITEM…), los que el juego mismo
    rotula en inglés como "DEBUG" o "NOT SPAWN" (Animal_Item_Dummy es "DEBUG DUMMY ITEM", FISH_DEV_ITEM es "FISH DEV
    ITEM (NOT SPAWN)": el nombre del script no siempre lo dice) y la carpeta TEMPORARY_TESTING.
  - Ítems `hidden = true` y los de categoría `Hidden`: son capas que el juego le
    pinta al cuerpo (heridas, vendas puestas, maquillaje, barba, ropa rota del
    zombi) o restos internos (Stairs, WaterDrop). Nunca están en un inventario.
  - Muebles sin `WorldObjectSprite` (Base.Moveable): la plantilla genérica de la
    que el juego arma cada mueble levantado, no un objeto que se encuentre.
  - Recetas de categoría `Debug`.
  - Las claves de sonido, animación, modelos 3D y colores de los scripts: no
    dicen nada que le sirva a quien juega.
Sin valor en el script = el juego usa su valor por defecto (p. ej. el peso de
la ropa que no declara `Weight`): no lo inventamos, queda null / ausente.

Las traducciones: inglés de Translate/EN; el español es el de Latinoamérica
(Translate/ES_MX, el mismo criterio que Diablo II: Base.Bag_ALICEpack es "Mochila
militar" y no "Mochila grande") y, sólo donde a ES_MX le falta la clave o la
tiene vacía, el de España (Translate/ES). Si falta en los dos, `es` queda "" y
se completa a mano después: no se copia el inglés.
"""
import datetime, glob, gzip, hashlib, importlib.util, json, os, re, struct, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pack import Pack  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GAME_DIR = os.environ.get("PZ_DIR") or r"C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid"
MEDIA = os.path.join(GAME_DIR, "media")
SCRIPTS = os.path.join(MEDIA, "scripts")
TRANSLATE = os.path.join(MEDIA, "lua", "shared", "Translate")
SKILLBOOK_LUA = os.path.join(MEDIA, "lua", "server", "XpSystem", "XPSystem_SkillBook.lua")
RADIO_LUA = os.path.join(MEDIA, "lua", "shared", "RadioCom", "ISRadioInteractions.lua")
RECORDED_MEDIA_LUA = os.path.join(MEDIA, "lua", "shared", "RecordedMedia", "recorded_media.lua")
SANDBOX_PRESET = os.path.join(MEDIA, "lua", "shared", "Sandbox", "Apocalypse.lua")
RADIO_DATA = os.path.join(MEDIA, "radio", "RadioData.xml")
DATA = os.path.join(ROOT, "games", "zomboid", "data")
PUBLIC = os.path.join(ROOT, "site", "public", "zomboid")
APP_ID = "108600"

EN = "EN"
ES = ["ES_MX", "ES"]  # el primero manda; el segundo sólo tapa huecos
# Los archivos de traducción que se usan (RadioData, SurvivorNames y compañía pesan
# megas y no tienen nada de esto). Recorded_Media trae el nombre de cada VHS y CD (media.json).
LANG_FILES = ["ItemName", "Recipes", "UI", "IG_UI", "Tooltip", "Moodles", "ContextMenu", "EvolvedRecipeName",
              "Entity", "Moveables", "Fluids", "Farming", "MultiStageBuild", "Recorded_Media"]

# Los .pack de interfaz en el orden en que los carga el juego (GameWindow): si un
# sprite se repite, gana el último.
UI_PACKS = ["UI", "UI2", "IconsMoveables", "RadioIcons", "ApComUI", "Mechanics", "WeatherFx"]
# Los muebles (Icon = default) usan como ícono el sprite de su baldosa; si está
# en más de un pack gana el primero (el de 2x, que se ve mejor al achicarlo).
TILE_PACKS = ["Tiles2x", "Tiles2x.floor", "blair_temp", "Tiles1x", "Tiles1x.floor"]
MOVEABLE_ICON = 64  # los muebles se achican para entrar en 64×64 (los ítems son 32×32)
# Las carpetas de íconos de este extractor (el mapa escribe las suyas al lado).
ICON_FOLDERS = ("items", "build", "traits", "professions", "moodles")
MOODLE_SIZE = "64"  # media/ui/Moodles/<tamaño>/ trae 32, 48, 64, 80, 96 y 128
# La 42.21 trae 26 moodles. Se lee el bytecode de MoodleTextureSet: si un parche lo cambia y la lectura
# devuelve casi nada, es mejor cortar que publicar una pestaña de moodles casi vacía.
MIN_MOODLES = 20

# La bala de cada tipo de munición. En los scripts un arma dice `AmmoType = base:bullets_9mm`, que no es un ítem: es
# un registro de Java (zombie.scripting.objects.AmmoType, con los ids de ItemKey$Normal), leído del bytecode de la
# 42.21 con javap. Las balas no declaran su tipo, así que no hay forma de sacarlo de los scripts. Si un parche suma un
# tipo, build_items avisa.
AMMO_ITEM = {
    "bullets_3030": "Base.3030Bullets", "bullets_308": "Base.308Bullets", "bullets_357": "Base.Bullets357",
    "bullets_38": "Base.Bullets38", "bullets_44": "Base.Bullets44", "bullets_45": "Base.Bullets45",
    "bullets_556": "Base.556Bullets", "bullets_9mm": "Base.Bullets9mm", "cap_gun_cap": "Base.CapGunCap",
    "shotgun_shells": "Base.ShotgunShells",
}

# Tags de receta que no son una estación: dónde o cómo se puede hacer.
RECIPE_FLAG_TAGS = {"AnySurfaceCraft", "InHandCraft", "CanBeDoneInDark", "CanBeDoneFromFloor", "RightClickOnly",
                    "RemoveResultItems", "CannotBeResearched", "CanAlwaysBeResearched"}
# Flags de ingrediente que sólo dicen en qué mano se ve el objeto durante la animación.
ANIM_FLAGS = {"Prop1", "Prop2"}


# ---------------------------------------------------------------------------
# Lector de scripts
# ---------------------------------------------------------------------------

class Block:
    """
    Un bloque `tipo nombre { ... }` de los scripts. `values` son las líneas en el
    orden del archivo (con repetidas: `Fixer = …` aparece varias veces) y
    `children` los bloques de adentro (inputs, outputs, component, itemMapper…).
    """
    __slots__ = ("kind", "name", "values", "children", "file")

    def __init__(self, header, file=None):
        parts = header.split(None, 1)
        self.kind = parts[0] if parts else ""
        self.name = parts[1].strip() if len(parts) > 1 else ""
        self.values, self.children, self.file = [], [], file

    def pairs(self):
        """[(clave, valor)] de las líneas `Clave = valor`, en orden y con repetidas."""
        out = []
        for v in self.values:
            if "=" in v:
                k, x = v.split("=", 1)
                out.append((k.strip(), x.strip()))
        return out

    def props(self):
        """{clave: valor}; si una clave se repite, gana la última (como en el juego)."""
        return dict(self.pairs())

    def child(self, kind, name=None):
        for c in self.children:
            if c.kind == kind and (name is None or c.name == name):
                return c
        return None


def strip_line_comment(line):
    """
    Saca el `// comentario` de una línea, sea de línea entera o al final de un valor
    (`Weight = 1.5 // pesado`). Sólo cuenta como comentario un `//` precedido de
    espacio (o al principio) y fuera de comillas: así una URL (`http://…`) o un
    texto entre comillas con `//` adentro no se cortan. En la 42.21 no hay ningún
    comentario al final de línea, pero el día que aparezca uno, sin esto se leería
    como parte del valor y se colaría en los datos.
    """
    if "//" not in line:  # casi todas: no vale la pena recorrerlas letra por letra
        return line
    quoted = False
    for i, c in enumerate(line):
        if c == '"':
            quoted = not quoted
        elif c == "/" and not quoted and line.startswith("//", i) and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def parse_script(text, file=None):
    """
    El formato de los scripts de PZ: bloques con llaves y líneas separadas por
    coma. Una línea sin coma que sigue con otra línea también se corta (el
    parser del juego lo tolera); una línea seguida de `{` es la cabecera de un
    bloque (`inputs`, `component FluidContainer`, `item Axe`…).
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = "\n".join(strip_line_comment(line) for line in text.split("\n"))
    root = Block("root", file)
    stack, buf, n = [root], [], len(text)
    for i, c in enumerate(text):
        if c == "{":
            b = Block("".join(buf).strip(), file)
            stack[-1].children.append(b)
            stack.append(b)
            buf = []
        elif c == "}":
            v = "".join(buf).strip()
            if v:
                stack[-1].values.append(v)
            buf = []
            if len(stack) > 1:
                stack.pop()
        elif c == ",":
            v = "".join(buf).strip()
            if v:
                stack[-1].values.append(v)
            buf = []
        elif c == "\n":
            v = "".join(buf).strip()
            if not v:
                buf = []
                continue
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] != "{":
                stack[-1].values.append(v)
                buf = []
            else:
                buf.append(" ")
        else:
            buf.append(c)
    return root


def load_scripts():
    """
    Todos los bloques de primer nivel dentro de `module X { }`, agrupados por tipo.
    Los ítems repetidos (13 en la 42.21, casi idénticos) quedan con la última
    definición, como los carga el juego.
    """
    out = defaultdict(list)
    # generated/ trae ítems, recetas y entities; entities/ y xui/, los estilos
    # (nombre e ícono) de las construcciones.
    for base in (os.path.join(SCRIPTS, "generated"), os.path.join(SCRIPTS, "entities"), os.path.join(SCRIPTS, "xui")):
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if not d.upper().startswith("TEMPORARY_TESTING"))
            for fn in sorted(filenames):
                if not fn.endswith(".txt"):
                    continue
                path = os.path.join(dirpath, fn)
                with open(path, encoding="utf-8-sig", errors="replace") as f:
                    root = parse_script(f.read(), os.path.relpath(path, SCRIPTS).replace(os.sep, "/"))
                for module in root.children:
                    if module.kind != "module":
                        continue
                    for b in module.children:
                        b.file = f"{module.name}|{b.file}"
                        out[b.kind].append(b)
    return out


# ---------------------------------------------------------------------------
# Textos
# ---------------------------------------------------------------------------

class Texts:
    def __init__(self):
        self.en = self._load(EN)
        self.es = {}
        for lang in reversed(ES):  # el primero de la lista pisa a los demás, salvo con vacíos
            self.es.update({k: v for k, v in self._load(lang).items() if v and v.strip()})
        self.en_ci = {k.lower(): k for k in self.en}
        self.es_ci = {k.lower(): k for k in self.es}
        self.missing_es = set()
        self.missing_en = set()

    @staticmethod
    def _load(lang):
        out = {}
        for fn in LANG_FILES:
            path = os.path.join(TRANSLATE, lang, fn + ".json")
            if os.path.exists(path):
                with open(path, encoding="utf-8-sig") as f:
                    out.update(json.load(f))
        return out

    def has(self, key):
        return key in self.en or key.lower() in self.en_ci

    @staticmethod
    def tidy(v):
        """
        Sin espacios de más: la 42.21 trae "Skirt -  Garbage Bag" (dos espacios) y el sitio lo mostraba así en la lista,
        en la ficha y en cada receta que la nombra. Sólo los espacios comunes repetidos y los de las puntas: los saltos
        (`<br>`) y los espacios duros quedan como están.

        Y sin comillas escapadas de más: la traducción ES_MX de la 42.21 escribe `\\\"` en el JSON de dos libros
        (Carpintería V y Soldadura IV), así que al leerlo queda una barra pegada a la comilla ("…Arquitectónica\\""). En
        la página parece un error nuestro y no es lo que el juego quiso decir. La regla es general (cualquier `\\"` o
        `\\'` → la comilla sola), no un arreglo para esos dos: los `\\n` y las rutas con barras de los textos de la
        interfaz no se tocan.
        """
        if not isinstance(v, str):
            return v
        return re.sub(r" {2,}", " ", re.sub(r"\\+([\"'])", r"\1", v)).strip()

    def get(self, key, fallback=None):
        """{en, es} de una clave. Sin inglés: `fallback` (o None); sin español: ""."""
        en = self.en.get(key)
        if en is None and key.lower() in self.en_ci:
            en = self.en[self.en_ci[key.lower()]]
        es = self.es.get(key)
        if es is None and key.lower() in self.es_ci:
            es = self.es[self.es_ci[key.lower()]]
        en, es = self.tidy(en), self.tidy(es)
        if en is None:
            if fallback is None:
                return None
            self.missing_en.add(key)
            en = fallback
        if es is None:
            self.missing_es.add(key)
            es = ""
        return {"en": en, "es": es}

    def first(self, keys, fallback=None):
        keys = [k for k in keys if k]
        for k in keys:
            if self.has(k):
                return self.get(k)
        if fallback is None:
            return None
        self.missing_en.add(keys[0] if keys else fallback)
        self.missing_es.add(keys[0] if keys else fallback)
        return {"en": fallback, "es": ""}


# ---------------------------------------------------------------------------
# Conversión de valores
# ---------------------------------------------------------------------------

def num(v):
    v = v.strip().rstrip("fF")
    try:
        x = float(v)
    except ValueError:
        return v
    return int(x) if x.is_integer() else round(x, 6)


def flag(v):
    return v.strip().lower() == "true"


def text(v):
    return v.strip()


def strip_ns(v):
    v = v.strip()
    return v[5:] if v.lower().startswith("base:") else v


def lst(v):
    return [x.strip() for x in v.split(";") if x.strip()]


def ns_list(v):
    return [strip_ns(x) for x in lst(v)]


def item_ref(v):
    v = v.strip()
    return v if "." in v else "Base." + v


def item_list(v):
    return [item_ref(x) for x in lst(v)]


def skill_map(v):
    """"Woodwork:5;Carving:1" o "Glassmaking=1;Pottery=1" → {"Woodwork": 5, …}."""
    out = {}
    for part in lst(v):
        m = re.match(r"\s*([^:=]+?)\s*[:=]\s*(-?[\d.]+)\s*$", part)
        if m:
            out[m.group(1)] = num(m.group(2))
    return out


def evolved_map(v):
    """"Soup:10;Stew:10|Cooked" → {"Soup": 10, "Stew": [10, "cooked"]}: con |Cooked sólo entra cocinado."""
    out = {}
    for part in lst(v):
        if ":" not in part:
            continue
        k, amount = part.split(":", 1)
        cooked = "|cooked" in amount.lower()
        amount = num(amount.split("|")[0])
        out[k.strip()] = [amount, "cooked"] if cooked else amount
    return out


# Las claves de los scripts de ítems que pasan a `stats`, con su conversión. El
# nombre de salida es la misma clave con la primera letra en minúscula, así se
# puede buscar en los scripts o en la wiki del juego sin traducir nada.
STATS = {}
for _keys, _conv in [
    # Cuerpo a cuerpo
    ("MinDamage MaxDamage MinRange MaxRange BaseSpeed Swingtime MinimumSwingtime CriticalChance CritDmgMultiplier "
     "MaxHitcount PushBackMod KnockdownMod DoorDamage TreeDamage MinAngle EnduranceMod Sharpness HeadCondition "
     "HeadConditionMax HeadConditionLowerChanceMultiplier WeaponLength StompPower SoundRadius SoundVolume "
     "HitAngleMod CantAttackWithLowestEndurance", num),
    ("TwoHandWeapon RequiresEquippedBothHands DamageMakeHole KnockBackOnNoDeath AlwaysKnockdown CloseKillMove "
     "UseEndurance MultipleHitConditionAffected RemoveOnBroken CanStack", flag),
    ("SubCategory DamageCategory WeaponReloadType FireMode", text),
    ("Categories", ns_list),
    # Armas de fuego y explosivos
    ("MaxAmmo ClipSize HitChance Aimingtime Reloadtime RecoilDelay AimingPerkCritModifier AimingPerkHitChanceModifier "
     "AimingPerkMinAngleModifier AimingPerkRangeModifier Projectilecount ProjectileSpread ProjectileWeightCenter "
     "JamGunChance StopPower AimingMod MinSightRange MaxSightRange ToHitModifier AngleFalloff RangeFalloff CyclicRateMultiplier "
     "ExplosionPower ExplosionRange ExplosionTimer ExplosionDuration FireRange NoiseRange NoiseDuration SmokeRange "
     "SensorRange RemoteRange triggerExplosionTimer", num),
    ("PiercingBullets IsAimedFirearm IsAimedHandWeapon Ranged HaveChamber RackAfterShoot ManuallyRemoveSpentRounds "
     "InsertAllBulletsReload needtobeclosedoncereload CanBeRemote CanBeReused", flag),
    ("AmmoBox MagazineType", item_ref),
    ("GunType", item_list),
    ("AmmoType", strip_ns),  # un tipo de munición del juego (bullets_9mm), no un ítem
    ("FireModePossibilities", lst),
    # Accesorios de armas
    ("WeightModifier AimingTimeModifier ReloadTimeModifier RecoilDelayModifier HitChanceModifier MaxRangeModifier "
     "LowLightBonus ProjectileSpreadModifier", num),
    ("MountOn", item_list),
    ("PartType", text),
    # Durabilidad (armas, ropa, herramientas, repuestos)
    ("ConditionMax ConditionLowerChanceOneIn ConditionLowerStandard ConditionLowerOffroad ChanceToSpawnDamaged", num),
    # Ropa y contenedores
    ("BiteDefense ScratchDefense BulletDefense NeckProtectionModifier CorpseSicknessDefense Insulation WindResistance "
     "WaterResistance RunSpeedModifier CombatSpeedModifier DiscomfortModifier VisionModifier HearingModifier "
     "ChanceToFall Capacity WeightReduction MaxItemSize MaxCapacity WeightEmpty", num),
    ("CanHaveHoles Cosmetic ConditionAffectsCapacity ProtectFromRainWhenEquipped", flag),
    ("BodyLocation CanBeEquipped", strip_ns),
    ("FabricType", text),
    ("BloodLocation AttachmentsProvided", lst),
    ("ClothingItemExtra", item_list),
    # Comida, bebida, remedios
    ("HungerChange ThirstChange Calories Carbohydrates Proteins Lipids DaysFresh DaysTotallyRotten MinutesToCook "
     "MinutesToBurn UnhappyChange BoredomChange StressChange FoodSicknessChange PoisonPower AlcoholPower "
     "painReduction fluReduction enduranceChange fatigueChange ReduceInfectionPower Eattime BandagePower "
     "InverseCoughProbability InverseCoughProbabilitySmoker", num),
    ("IsCookable DangerousUncooked Spice CantEat Packaged CannedFood GoodHot BadCold BadInMicrowave CantBeFrozen "
     "RemoveUnhappinessWhenCooked RemoveNegativeEffectOnCooked Alcoholic Medical CanBandage IsDung FishingLure", flag),
    ("FoodType HerbalistType AnimalFeedType", text),
    ("EvolvedRecipe", evolved_map),
    ("ReplaceOnUse ReplaceOnRotten ReplaceOnDeplete ReplaceOnExtinguish ItemAfterCleaning ItemWhenDry", item_ref),
    ("ReplaceOnCooked", item_list),
    # Libros, revistas, lectura
    ("LvlSkillTrained NumLevelsTrained NumberOfPages PageToWrite", num),
    ("CanBeWrite", flag),
    ("ReadType", text),
    ("book_subject magazine_subject", strip_ns),
    # Consumibles, luces, fuego
    ("UseDelta ticksPerEquipUse LightDistance LightStrength TorchCone TorchDot FireStartingChance FireStartingEnergy "
     "FireFuelRatio", num),
    ("UseWhileEquipped UseWhileUnequipped KeepOnDeplete DisappearOnUse UseSelf CanStoreWater IsWaterSource", flag),
    ("ActivatedItem", flag),
    # Si el juego deja juntar dos a medio usar en uno ("Unir"). Los que no (`cantBeConsolided`) guardan un nivel que
    # algo va gastando de a poco: la carga de una batería, el gas de un tanque, la mecha de una vela, un filtro. El
    # sitio lo usa para no mostrar "usos" donde `UseDelta` es lo que se gasta por minuto (ver site/src/zomboid/items/
    # stats.ts).
    ("cantBeConsolided", flag),
    # Radios y televisores
    ("MinChannel MaxChannel TransmitRange MicRange BaseVolumeRange", num),
    ("TwoWay IsPortable IsTelevision IsHighTier UsesBattery NoTransmit", flag),
    ("AcceptMediaType MediaCategory", text),
    # Repuestos de auto
    ("wheelFriction brakeForce engineLoudness suspensionDamping suspensionCompression", num),
    ("VehicleType", num),
    ("MechanicsItem", flag),
    # Varios
    ("MetalValue RainFactor count", num),
    ("SurvivalGear AlwaysWelcomeGift CanBarricade Padlock DigitalPadlock Trap Wet CanBePlaced RequireInHandOrInventory "
     "EquippedNoSprint CanAttach CanDetach", flag),
    ("AttachmentType DigType ShoutType MakeUpType Map", text),
    ("SpawnWith", item_list),
    ("OtherHandRequire", text),  # un tag (base:lighter)
    ("OtherHandUse", flag),
    ("ShoutMultiplier WetCooldown", num),
]:
    for _k in _keys.split():
        STATS[_k] = _conv

# Claves que se leen aparte (van arriba de todo en el ítem o se usan para cruzar datos).
TOP_KEYS = {"DisplayCategory", "ItemType", "Weight", "Icon", "IconsForTexture", "Tags", "Tooltip", "Researchablerecipes",
            "LearnedRecipes", "TeachedRecipes", "SkillTrained", "WorldObjectSprite", "hidden", "DoubleClickRecipe",
            "OpeningRecipe"}

# Lo que no le sirve a quien juega: sonidos, animaciones, modelos 3D, colores,
# funciones Lua y detalles de dibujo. Si un parche trae una clave que no está
# ni en STATS ni acá, el extractor la lista para decidir qué hacer con ella.
IGNORED = set("""
StaticModel WorldStaticModel StaticModelsByIndex WorldStaticModelsByIndex WeaponSprite WeaponSpritesByIndex
ClothingItem ClothingItemExtraOption ClothingExtraSubmenu IconColorMask IconFluidMask ColorRed ColorGreen ColorBlue
ReplaceInPrimaryHand ReplaceInSecondHand WorldRender ScaleWorldIcon UseWorldItem SplatNumber SplatSize
SplatBloodOnNoDeath MuzzleFlashModelKey PhysicsObject primaryAnimMask secondaryAnimMask OriginX OriginY originZ
PlacedSprite EatType PourType SwingAmountBeforeImpact AttachmentReplacement CustomContextMenu ModelWeaponPart
VehiclePartModel OnCreate OnBreak OnEat OnCooked AcceptItemFunction ConsolidateOption SwingAnim
RunAnim IdleAnim SoundMap SoundParameter SoundGain NPCSoundBoost WithDrainable WithoutDrainable WeaponWeight
RemoteController EvolvedRecipeName VisualAid
""".split())


def camel(key):
    """MinDamage → minDamage, book_subject → bookSubject."""
    key = key[0].lower() + key[1:]
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), key)


def is_audio(key):
    return key.endswith("Sound") or key.endswith("Sounds") or key in ("CustomEatSound",)


# ---------------------------------------------------------------------------
# Íconos
# ---------------------------------------------------------------------------

class Icons:
    """
    Índice de los sprites de los .pack. Los íconos se escriben al final, sólo
    los que usa algún dato publicado.
    """
    def __init__(self):
        tp = os.path.join(MEDIA, "texturepacks")
        self.ui = {}  # sprite → Pack (gana el último pack, como en el juego)
        self.ui_packs = {name: Pack(os.path.join(tp, name + ".pack")) for name in UI_PACKS
                         if os.path.exists(os.path.join(tp, name + ".pack"))}
        for name in UI_PACKS:
            if name in self.ui_packs:
                for sprite in self.ui_packs[name].names():
                    self.ui[sprite] = name
        self.tiles = {}
        self.tile_packs = {}
        for name in TILE_PACKS:
            path = os.path.join(tp, name + ".pack")
            if not os.path.exists(path):
                continue
            self.tile_packs[name] = Pack(path)
            for sprite in self.tile_packs[name].names():
                self.tiles.setdefault(sprite, name)  # el primero de TILE_PACKS: el de 2x
        self.want = {}  # carpeta/archivo → (fuente, sprite o ruta)

    def item_icon(self, name, props):
        """
        El ícono de inventario: `Icon = X` → sprite `Item_X`; si no hay Icon, el
        primero de `IconsForTexture` (la ropa y herramientas con variantes); si
        tampoco, `Item_<nombre>`. Los muebles (`Icon = default`) usan el sprite de
        su baldosa (`WorldObjectSprite`).
        """
        cands = []
        icon = props.get("Icon")
        if icon and icon.lower() != "default":
            cands.append(icon)
        cands += lst(props.get("IconsForTexture", ""))
        cands.append(name)
        for c in cands:
            if "Item_" + c in self.ui:
                self.want["items/" + c] = ("ui", "Item_" + c)
                return c
            for loose in (os.path.join(MEDIA, "textures", "Item_" + c + ".png"), os.path.join(MEDIA, "ui", "Item_" + c + ".png")):
                if os.path.exists(loose):
                    self.want["items/" + c] = ("file", loose)
                    return c
        tile = props.get("WorldObjectSprite")
        if tile and tile not in self.tiles:
            # Algunos minerales piden "crafting_ore_01_9" y la hoja se llama "crafting_ore"
            # (crafting_ore_9): mismo dibujo, nombre de hoja viejo.
            alt = re.sub(r"_01_(\d+)$", r"_\1", tile)
            tile = alt if alt in self.tiles else None
        if tile:
            self.want["items/" + tile] = ("tile", tile)
            return tile
        return None

    def sprite(self, folder, sprite, loose=None):
        """Un sprite de interfaz suelto (rasgos, profesiones, construcciones); `loose` gana si existe."""
        if loose and os.path.exists(loose):
            self.want[f"{folder}/{sprite}"] = ("file", loose)
            return sprite
        if sprite in self.ui:
            self.want[f"{folder}/{sprite}"] = ("ui", sprite)
            return sprite
        return None

    def file(self, folder, name, path):
        if os.path.exists(path):
            self.want[f"{folder}/{name}"] = ("file", path)
            return name
        return None

    def check_names(self):
        """
        Corta si dos íconos de una misma carpeta se llaman igual salvo por las mayúsculas (Item_Axe y Item_axe). En
        Windows serían un solo archivo y el segundo pisaría al primero sin avisar (`write` borra el de otras mayúsculas
        para arreglar los renombres entre parches); en Netlify, que sí distingue, una de las dos páginas pediría un
        ícono que no está. En la 42.21 no pasa. `main` lo llama antes de escribir nada, como los otros cortes.
        """
        seen = {}
        for key in sorted(self.want):
            other = seen.setdefault(key.lower(), key)
            if other != key:
                raise SystemExit(
                    f"Los íconos {other}.webp y {key}.webp se llaman igual salvo por las mayúsculas: en Windows serían "
                    "el mismo archivo y uno pisaría al otro sin avisar. No se escribió nada: hay que darle otro nombre "
                    "a uno de los dos en Icons (extract.py) antes de volver a extraer.")

    def write(self):
        """
        Escribe los WebP (sin pérdida) y borra los que ya no se usan. Devuelve el hash de los píxeles. Cuenta con que
        `check_names` ya pasó: dos claves con las mismas letras en otras mayúsculas se pisarían acá.
        """
        images = {}
        by_pack = defaultdict(set)
        tiles = defaultdict(set)
        for key, (src, ref) in self.want.items():
            if src == "ui":
                by_pack[self.ui[ref]].add(ref)
            elif src == "tile":
                tiles[self.tiles[ref]].add(ref)
        loaded = {}
        for pk, names in by_pack.items():
            loaded.update(self.ui_packs[pk].sprites(names))
        loaded_tiles = {}
        for pk, names in tiles.items():
            loaded_tiles.update(self.tile_packs[pk].sprites(names, trim=True))
        for key, (src, ref) in self.want.items():
            if src == "ui":
                im = loaded[ref]
            elif src == "tile":
                im = loaded_tiles[ref]
                im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
                if max(im.size) > MOVEABLE_ICON:
                    k = MOVEABLE_ICON / max(im.size)
                    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            else:
                im = Image.open(ref).convert("RGBA")
            images[key] = im.convert("RGBA")

        def canon(im):
            """Los píxeles transparentes con RGB en 0: WebP sin pérdida no guarda ese color."""
            clear = Image.new("RGBA", im.size, (0, 0, 0, 0))
            return Image.composite(im, clear, im.getchannel("A").point(lambda v: 255 if v else 0))

        h = hashlib.sha256()
        written = set()
        removed = 0
        listing = {}  # carpeta → {nombre en minúsculas: [nombres que hay en disco]}, se lista una vez por carpeta
        for key in sorted(images):
            im = canon(images[key])
            pixels = im.tobytes()
            h.update(key.encode() + b"\0" + f"{im.width}x{im.height}".encode() + pixels)
            path = os.path.join(PUBLIC, *key.split("/")) + ".webp"
            os.makedirs(os.path.dirname(path), exist_ok=True)
            written.add(os.path.normcase(os.path.abspath(path)))
            # Si un parche le cambia las mayúsculas al nombre de un ícono (Item_axe → Item_Axe), en
            # Windows escribir encima deja el nombre viejo (el sistema de archivos no distingue) y
            # Netlify sí distingue: la página pediría Axe.webp y daría 404. Se borra el del nombre
            # viejo antes de escribir (y antes de mirar si los píxeles cambiaron).
            folder, fname = os.path.split(path)
            if folder not in listing:
                listing[folder] = defaultdict(list)
                for n in os.listdir(folder):
                    listing[folder][n.lower()].append(n)
            for other in listing[folder][fname.lower()]:
                if other != fname:
                    os.remove(os.path.join(folder, other))
                    removed += 1
            listing[folder][fname.lower()] = [fname]
            # Comprimir sin pérdida al máximo tarda ~15 ms por ícono (un minuto en total):
            # si el archivo que ya está tiene los mismos píxeles, queda como está.
            if os.path.exists(path):
                try:
                    with Image.open(path) as old:
                        if old.size == im.size and canon(old.convert("RGBA")).tobytes() == pixels:
                            continue
                except OSError:
                    pass
            im.save(path, "WEBP", lossless=True, quality=100, method=6)
        for folder in ICON_FOLDERS:
            for path in glob.glob(os.path.join(PUBLIC, folder, "*.webp")):
                if os.path.normcase(os.path.abspath(path)) not in written:
                    os.remove(path)
                    removed += 1
        return h.hexdigest(), len(images), removed


# ---------------------------------------------------------------------------
# Lector de .class (la versión, los moodles y las habilidades salen del .jar)
# ---------------------------------------------------------------------------

def _parse_pool(d):
    """
    El pool de constantes de un .class: ({índice: (tipo, …)}, dónde termina). Los enteros y los float se guardan como
    ("int", n) y ("float", x): de ahí salen la tabla de XP y los multiplicadores (ver perk_factory y xp_boost_rules).
    Los long y los double, como ("long", n) y ("double", x): los rangos y defaults de las opciones de sandbox y del .ini
    son double (ver server.py). Cada uno ocupa dos entradas del pool (así lo define la JVM): la segunda queda vacía.
    """
    n = struct.unpack(">H", d[8:10])[0]
    i, k, cp = 10, 1, {}
    while k < n:
        t = d[i]
        if t == 1:
            ln = struct.unpack(">H", d[i + 1:i + 3])[0]
            cp[k] = ("utf", d[i + 3:i + 3 + ln].decode("utf-8", "replace"))
            i += 3 + ln
        elif t == 3:
            cp[k] = ("int", struct.unpack(">i", d[i + 1:i + 5])[0])
            i += 5
        elif t == 4:
            cp[k] = ("float", struct.unpack(">f", d[i + 1:i + 5])[0])
            i += 5
        elif t in (5, 6):
            if t == 5:
                cp[k] = ("long", struct.unpack(">q", d[i + 1:i + 9])[0])
            else:
                cp[k] = ("double", struct.unpack(">d", d[i + 1:i + 9])[0])
            i += 9
            k += 1
        elif t in (7, 8, 16, 19, 20):
            cp[k] = (t, struct.unpack(">H", d[i + 1:i + 3])[0])
            i += 3
        elif t in (9, 10, 11, 12, 17, 18):
            cp[k] = (t,) + struct.unpack(">HH", d[i + 1:i + 5])
            i += 5
        elif t == 15:
            i += 4
        else:
            raise ValueError(f"constante desconocida {t}")
        k += 1
    return cp, i


def _constant_pool(d):
    """El pool de constantes de un .class: {índice: (tipo, …)}."""
    return _parse_pool(d)[0]


def _class_code(d):
    """
    (pool, {(método, descriptor): bytecode}) de un .class. Se saltea lo que no hace falta (interfaces, campos y los
    atributos que no son `Code`) sabiendo sólo cuánto mide.
    """
    cp, i = _parse_pool(d)
    i += 6  # access_flags, this_class, super_class
    i += 2 + 2 * struct.unpack(">H", d[i:i + 2])[0]  # interfaces
    code = {}
    for is_method in (False, True):  # primero los campos, después los métodos: tienen la misma forma
        count = struct.unpack(">H", d[i:i + 2])[0]
        i += 2
        for _ in range(count):
            _acc, name, desc, n_attr = struct.unpack(">HHHH", d[i:i + 8])
            i += 8
            for _ in range(n_attr):
                a_name, a_len = struct.unpack(">HI", d[i:i + 6])
                if is_method and cp[a_name][1] == "Code":
                    c_len = struct.unpack(">I", d[i + 10:i + 14])[0]  # después de max_stack y max_locals
                    code[(cp[name][1], cp[desc][1])] = d[i + 14:i + 14 + c_len]
                i += 6 + a_len
    return cp, code


# Cuántos bytes ocupa cada instrucción de la JVM (opcode + operandos). tableswitch, lookupswitch y wide son de largo
# variable y se miden aparte en _instructions.
_OPLEN = {}
for _ops, _n in ((range(0x00, 0x10), 1), ((0x10,), 2), ((0x11,), 3), ((0x12,), 2), ((0x13, 0x14), 3),
                 (range(0x15, 0x1a), 2), (range(0x1a, 0x36), 1), (range(0x36, 0x3b), 2), (range(0x3b, 0x84), 1),
                 ((0x84,), 3), (range(0x85, 0x99), 1), (range(0x99, 0xa9), 3), ((0xa9,), 2), (range(0xac, 0xb2), 1),
                 (range(0xb2, 0xb9), 3), ((0xb9, 0xba), 5), ((0xbb,), 3), ((0xbc,), 2), ((0xbd,), 3),
                 ((0xbe, 0xbf), 1), ((0xc0, 0xc1), 3), ((0xc2, 0xc3), 1), ((0xc5,), 4), ((0xc6, 0xc7), 3),
                 ((0xc8, 0xc9), 5)):
    for _op in _ops:
        _OPLEN[_op] = _n
_BRANCH = set(range(0x99, 0xa9)) | {0xc6, 0xc7}  # ifeq … jsr, ifnull, ifnonnull: destino relativo de 16 bits
_LOCAL = {0x15, 0x16, 0x17, 0x18, 0x19, 0x36, 0x37, 0x38, 0x39, 0x3a, 0xa9}  # iload … astore, ret: índice de 1 byte


def _instructions(code):
    """
    El bytecode de un método como [(pc, opcode, argumento)]. El argumento ya viene resuelto: el pc de destino en los
    saltos, el valor en bipush/sipush, el índice del pool en ldc/getstatic/invoke*, el de la variable local en
    iload/istore, y en tableswitch la tabla entera: (bajo, alto, pc del default, [pc de cada caso de bajo a alto]), que es
    de donde salen los rangos de los cortes de agua y luz (server.py). Alcanza para leer patrones cortos (una constante
    antes de una llamada) sin ejecutar nada.
    """
    out, pc = [], 0
    while pc < len(code):
        op, arg = code[pc], None
        if op in (0xaa, 0xab):  # tableswitch / lookupswitch: relleno hasta múltiplo de 4 y la tabla
            p = pc + 1 + (-(pc + 1) % 4)
            if op == 0xaa:
                default, lo, hi = struct.unpack(">iii", code[p:p + 12])
                ln = p + 12 + 4 * (hi - lo + 1) - pc
                offs = struct.unpack(f">{hi - lo + 1}i", code[p + 12:p + 12 + 4 * (hi - lo + 1)])
                arg = (lo, hi, pc + default, [pc + o for o in offs])
            else:
                ln = p + 8 + 8 * struct.unpack(">i", code[p + 4:p + 8])[0] - pc
        elif op == 0xc4:  # wide
            ln = 6 if code[pc + 1] == 0x84 else 4
        elif op in _OPLEN:
            ln = _OPLEN[op]
            if op in _BRANCH:
                arg = pc + struct.unpack(">h", code[pc + 1:pc + 3])[0]
            elif op in (0xc8, 0xc9):
                arg = pc + struct.unpack(">i", code[pc + 1:pc + 5])[0]
            elif op == 0x10:
                arg = struct.unpack(">b", code[pc + 1:pc + 2])[0]
            elif op == 0x11:
                arg = struct.unpack(">h", code[pc + 1:pc + 3])[0]
            elif op == 0x12 or op in _LOCAL or op == 0xbc:
                arg = code[pc + 1]
            elif ln >= 3:
                arg = struct.unpack(">H", code[pc + 1:pc + 3])[0]
        else:
            raise ValueError(f"opcode desconocido {op:#x} en {pc}")
        out.append((pc, op, arg))
        pc += ln
    return out


def _member(cp, ins, *ops):
    """(clase, nombre, descriptor) del campo o método que usa la instrucción, si es de `ops`; si no, None."""
    if ins[1] not in ops:
        return None
    e = cp.get(ins[2])
    if not e or e[0] not in (9, 10, 11):
        return None
    nt = cp[e[2]]
    return cp[cp[e[1]][1]][1], cp[nt[1]][1], cp[nt[2]][1]


def _ldc(cp, ins):
    """El valor que empuja un ldc/ldc_w (entero, float o texto), o None."""
    if ins[1] not in (0x12, 0x13):
        return None
    e = cp.get(ins[2], (0,))
    if e[0] in ("int", "float"):
        return e[1]
    return cp[e[1]][1] if e[0] == 8 else None


def _push_int(cp, ins):
    """El entero que empuja la instrucción (iconst_*, bipush, sipush, ldc de un int), o None."""
    if 0x02 <= ins[1] <= 0x08:
        return ins[1] - 0x03
    if ins[1] in (0x10, 0x11):
        return ins[2]
    v = _ldc(cp, ins)
    return v if isinstance(v, int) else None


def _push_float(cp, ins):
    """El float que empuja la instrucción (fconst_0/1/2 o ldc de un float), o None."""
    if 0x0b <= ins[1] <= 0x0d:
        return float(ins[1] - 0x0b)
    v = _ldc(cp, ins)
    return v if isinstance(v, float) else None


def _push_double(cp, ins):
    """El double que empuja la instrucción (dconst_0/1 o ldc2_w de un double), o None."""
    if ins[1] in (0x0e, 0x0f):
        return float(ins[1] - 0x0e)
    if ins[1] == 0x14:
        e = cp.get(ins[2], (0,))
        return e[1] if e[0] == "double" else None
    return None


def _f32(x):
    """x redondeado a float de 32 bits, como lo guarda la JVM."""
    return struct.unpack(">f", struct.pack(">f", x))[0]


def _tidy_float(x):
    """
    Un float de 32 bits del juego, legible: 1.33f se lee 1.3300000429153442 y se guarda 1.33 (siete cifras son las que
    tiene un float); 1.0 se guarda 1.
    """
    x = float(f"{x:.7g}")
    return int(x) if x.is_integer() else x


def game_version():
    """
    "42.21" desde projectzomboid.jar: Core arma `gameVersion = new GameVersion(42, 21, "")`
    en su inicialización. Se busca ese `new GameVersion(int, int, String)` seguido de
    `putstatic gameVersion` en el bytecode (no hace falta Java).
    """
    try:
        with zipfile.ZipFile(os.path.join(GAME_DIR, "projectzomboid.jar")) as z:
            d = z.read("zombie/core/Core.class")
    except (OSError, KeyError, zipfile.BadZipFile):  # sin .jar, sin la clase o .jar a medio bajar de Steam
        return None
    # Un parche que cambie el bytecode puede dejar un índice fuera de la clase o una constante de otro tipo: eso es
    # "no pude leer la versión" (main corta con su mensaje), no un traceback.
    try:
        return _game_version(d)
    except (IndexError, KeyError, TypeError, struct.error):
        return None


def _game_version(d):
    """El `new GameVersion(…)` de `game_version()`, sobre los bytes de Core.class."""
    cp = _constant_pool(d)
    gv = [k for k, v in cp.items() if v[0] == 7 and cp[v[1]][1] == "zombie/core/GameVersion"]

    def read_int(pos):
        op = d[pos]
        if 0x02 <= op <= 0x08:
            return op - 0x03, pos + 1
        if op == 0x10:
            return struct.unpack(">b", d[pos + 1:pos + 2])[0], pos + 2
        if op == 0x11:
            return struct.unpack(">h", d[pos + 1:pos + 3])[0], pos + 3
        return None, pos

    for g in gv:
        for m in re.finditer(re.escape(b"\xbb" + struct.pack(">H", g) + b"\x59"), d):
            major, p = read_int(m.end())
            minor, p = read_int(p) if major is not None else (None, p)
            if minor is None:
                continue
            if d[p] == 0x12:
                sidx, p = d[p + 1], p + 2
            elif d[p] == 0x13:
                sidx, p = struct.unpack(">H", d[p + 1:p + 3])[0], p + 3
            else:
                continue
            if d[p] != 0xB7 or d[p + 3] != 0xB3:  # invokespecial <init>; putstatic
                continue
            field = cp[struct.unpack(">H", d[p + 4:p + 6])[0]]
            if cp[cp[field[2]][1]][1] != "gameVersion":
                continue
            suffix = cp[cp[sidx][1]][1] if cp.get(sidx, (0,))[0] == 8 else ""
            return f"{major}.{minor}{suffix}"
    return None


def steam_build():
    """
    El buildid de Steam, del appmanifest que está dos carpetas más arriba
    (steamapps/common/ProjectZomboid → steamapps/appmanifest_108600.acf). None si no
    está: una copia del juego fuera de Steam es válida, sólo que sin build.
    """
    path = os.path.join(GAME_DIR, "..", "..", f"appmanifest_{APP_ID}.acf")
    try:
        with open(path, encoding="utf-8") as f:
            m = re.search(r'"buildid"\s+"(\d+)"', f.read())
        return int(m.group(1)) if m else None
    except OSError:
        return None


def moodle_textures():
    """
    {tipo de moodle: archivo de ícono} leído de MoodleTextureSet en el .jar: el
    constructor recorre los MoodleType y a cada uno le arma la ruta del PNG con
    una concatenación (invokedynamic). No hay una tabla en texto: el orden del
    bytecode es la tabla. Devuelve {"ENDURANCE": "Status_DifficultyBreathing", …}.
    """
    # Si el parche cambió esa clase y no se entiende, vuelve vacío: build_moodles() corta con su mensaje (pide un piso
    # de moodles) en vez de un traceback.
    try:
        with zipfile.ZipFile(os.path.join(GAME_DIR, "projectzomboid.jar")) as z:
            d = z.read("zombie/ui/MoodleTextureSet.class")
        return _moodle_textures(d)
    except (OSError, KeyError, zipfile.BadZipFile, StopIteration, IndexError, TypeError, struct.error):
        return {}


def _moodle_textures(d):
    """El recorrido de `moodle_textures()`, sobre los bytes de MoodleTextureSet.class."""
    cp = _constant_pool(d)
    bm_name = next(k for k, v in cp.items() if v == ("utf", "BootstrapMethods"))
    p = d.rfind(struct.pack(">H", bm_name))
    count = struct.unpack(">H", d[p + 6:p + 8])[0]
    q, recipes = p + 8, []
    for _ in range(count):
        _ref, na = struct.unpack(">HH", d[q:q + 4])
        args = struct.unpack(">" + "H" * na, d[q + 4:q + 4 + 2 * na])
        q += 4 + 2 * na
        recipes.append(next((cp[cp[a][1]][1] for a in args if cp.get(a, (0,))[0] == 8), ""))
    out, current = {}, None
    for m in re.finditer(rb"\xb2..|\xba....", d):
        op, idx = m.group()[0], struct.unpack(">H", m.group()[1:3])[0]
        ref = cp.get(idx, (0,))
        if op == 0xB2 and ref[0] == 9 and cp[cp[ref[1]][1]][1] == "zombie/scripting/objects/MoodleType":
            current = cp[cp[ref[2]][1]][1]
        elif op == 0xBA and ref[0] == 18 and current:
            png = re.search(r"([A-Za-z_]+)\.png", recipes[ref[1]])
            if png:
                out[current] = png.group(1)
            current = None
    return out


# ---------------------------------------------------------------------------
# Habilidades: XP por nivel, multiplicadores de bonificación y nivel inicial (bytecode)
# ---------------------------------------------------------------------------
# Nada de esto está en un script ni en un .lua: son números escritos en el código Java. Se leen del .jar como la versión
# y los moodles, buscando patrones cortos en el bytecode, así un parche que cambie un número lo cambia acá solo; si cambia
# la forma del código, las funciones cortan con un mensaje en vez de inventar.

PERKS_CLASS = "zombie/characters/skills/PerkFactory$Perks"
PERK_TYPE = "Lzombie/characters/skills/PerkFactory$Perk;"
XP_CLASS = "zombie/characters/IsoGameCharacter$XP"


def _jar_class(path):
    with zipfile.ZipFile(os.path.join(GAME_DIR, "projectzomboid.jar")) as z:
        return _class_code(z.read(path))


def perk_factory():
    """
    Las habilidades, de `PerkFactory.init()`: una llamada `AddPerk(Perks.X, "Traducción", [Perks.Padre], 10 enteros,
    [pasiva])` por habilidad o categoría. Devuelve [{perk, name, parent, xp, passive}] en el orden del juego (el de la
    pantalla de habilidades). `name` es la clave de traducción sin `IGUI_perks_` (Perks.Woodwork → "Carpentry"); las
    categorías son las que no tienen padre.

    `xp[i]` es la XP para pasar del nivel i al i+1: el entero del script por `PERK_XP_REQ_MULTIPLIER` (1,5 en la 42.21),
    truncado. Esa cuenta la hace el `AddPerk` completo (`perk.xpN = (int)(argN * 1.5f)`): se lee de ahí el factor y qué
    argumento va a qué nivel, en vez de copiar el 1,5. (`Perk.getXpForLevel(n)` devuelve `xpN`, y
    `getTotalXpForLevel(n)` la suma de 1 a n.)
    """
    try:
        cp, code = _jar_class("zombie/characters/skills/PerkFactory.class")
    except (OSError, KeyError, zipfile.BadZipFile):
        code = {}
    full = f"({PERK_TYPE}Ljava/lang/String;{PERK_TYPE}IIIIIIIIIIZ){PERK_TYPE}"
    if ("AddPerk", full) not in code or ("init", "()V") not in code:
        raise SystemExit(
            "No encontré PerkFactory.AddPerk(…, 10 enteros, boolean) o PerkFactory.init() en projectzomboid.jar: el parche "
            "cambió cómo se definen las habilidades. No se escribió nada: hay que adaptar perk_factory() (extract.py).")
    # El AddPerk completo: `iload k; i2f; ldc F; fmul; f2i; putfield xpN` para N de 1 a 10.
    factor = {}
    ins = _instructions(code[("AddPerk", full)])
    for a, b, c, e, f, g in zip(ins, ins[1:], ins[2:], ins[3:], ins[4:], ins[5:]):
        field = _member(cp, g, 0xb5)
        local = a[2] if a[1] == 0x15 else (a[1] - 0x1a if 0x1a <= a[1] <= 0x1d else None)
        mult = _push_float(cp, c)
        if (local is not None and b[1] == 0x86 and mult is not None and e[1] == 0x6a and f[1] == 0x8b and field
                and re.fullmatch(r"xp\d+", field[1])):
            factor[int(field[1][2:])] = (local, mult)
    # Los parámetros del AddPerk completo: 0 perk, 1 nombre, 2 padre, 3 a 12 los diez enteros, 13 pasiva.
    if sorted(factor) != list(range(1, 11)) or any(factor[n][0] != n + 2 for n in factor) \
            or len({m for _, m in factor.values()}) != 1:
        raise SystemExit(
            f"No pude leer cómo PerkFactory.AddPerk arma la XP de cada nivel (leí {factor}): el parche cambió esa cuenta. "
            "No se escribió nada: hay que adaptar perk_factory() (extract.py).")
    mult = factor[1][1]

    def perk_field(y):
        m = _member(cp, y, 0xb2)
        return m[1] if m and m[0] == PERKS_CLASS else None

    perks, seg, bad = [], [], []
    for x in _instructions(code[("init", "()V")]):
        called = _member(cp, x, 0xb8)
        if called and called[0] == "zombie/characters/skills/PerkFactory" and called[1] == "AddPerk":
            # Los argumentos son las instrucciones desde la sentencia anterior: Perks.X, "nombre", [Perks.Padre],
            # diez enteros y [la pasiva]. Si hay otra cosa (una cuenta, una variable), no se adivina: se corta.
            args = called[2][1:called[2].index(")")]
            with_parent, passive_arg = args.count(PERK_TYPE) == 2, args.endswith("Z")
            want = 2 + with_parent + 10 + passive_arg
            fld = [perk_field(y) for y in seg]
            ints = [_push_int(cp, y) for y in seg[2 + with_parent:2 + with_parent + 10]]
            name = _ldc(cp, seg[1]) if len(seg) > 1 else None
            if len(seg) != want or not fld[0] or not isinstance(name, str) or (with_parent and not fld[2]) \
                    or None in ints:
                bad.append((fld[0] if seg else None) or "?")
            else:
                perks.append({
                    "perk": fld[0], "name": name, "parent": fld[2] if with_parent else None,
                    # (int)(n * 1.5f) en float de 32 bits, como la JVM: f2i trunca.
                    "xp": [int(_f32(_f32(n) * mult)) for n in ints],
                    "passive": bool(_push_int(cp, seg[-1])) if passive_arg else False,
                })
            seg = []
        elif x[1] in (0x57, 0xb5):  # pop (el resultado de AddPerk) o putfield: termina una sentencia
            seg = []
        else:
            seg.append(x)
    skills = [p for p in perks if p["parent"]]
    if bad or len(skills) < 20:
        raise SystemExit(
            f"Leí {len(skills)} habilidades de PerkFactory.init() y no entendí las llamadas de {bad}: el parche cambió "
            "cómo se definen. No se escribió nada: hay que adaptar perk_factory() (extract.py).")
    return perks


def xp_boost_rules():
    """
    Cuánto multiplica la XP cada nivel de bonificación (la suma de profesión y rasgos en una habilidad), de
    `IsoGameCharacter$XP.AddXP(Perk, float, boolean×4)`. El juego recorre el mapa de bonificaciones del personaje y encadena
    `if (nivel == 0 && !excluida(reducción)) ×0.25; else if (nivel == 1 && perk == Sprinting) ×1.25; else if (nivel == 1)
    ×1; else if (nivel == 2 && !excluida(aumento)) ×1.33; else if (nivel >= 3 && !excluida(aumento)) ×1.66`. Se lee esa
    cadena como reglas en orden: [{level, cmp ("eq" o "ge"), perk (o None), unless ("reduction", "increase" o None),
    mult}], la primera que se cumple gana y si ninguna, ×1. Las excluidas salen de `isSkillExcludedFromSpeedReduction` y
    `isSkillExcludedFromSpeedIncrease` (Carrera, Estado físico y Fuerza en la 42.21).

    Una habilidad sin bonificación no está en el mapa: el juego le aplica el ×0.25 del nivel 0 con la misma excepción, así
    que alcanza con el nivel 0. Los multiplicadores de rasgos (Aprendiz rápido ×1.3, lento ×0.7, Pacifista, Ingenioso) van
    después, en el mismo método, y se leen en `xp_trait_multipliers`.
    """
    try:
        cp, code = _jar_class(XP_CLASS + ".class")
    except (OSError, KeyError, zipfile.BadZipFile):
        cp, code = {}, {}
    fail = ("No pude leer los multiplicadores de bonificación de XP en IsoGameCharacter$XP.AddXP ({}): el parche cambió "
            "ese código. No se escribió nada: hay que adaptar xp_boost_rules() (extract.py).")
    excluded = {}
    for key, method in (("reduction", "isSkillExcludedFromSpeedReduction"), ("increase", "isSkillExcludedFromSpeedIncrease")):
        body = code.get((method, f"({PERK_TYPE})Z"))
        if body is None:
            raise SystemExit(fail.format(f"falta {method}"))
        excluded[key] = sorted({m[1] for m in (_member(cp, y, 0xb2) for y in _instructions(body)) if m and m[0] == PERKS_CLASS})
    body = code.get(("AddXP", f"({PERK_TYPE}FZZZZ)V"))
    ins = _instructions(body) if body else []
    start = next((j for j, y in enumerate(ins) if (_member(cp, y, 0xb6) or ("", ""))[1] == "getXPBoostMap"), None)
    if start is None:
        raise SystemExit(fail.format("no está el recorrido de getXPBoostMap"))
    rules, j = [], start
    while j < len(ins) - 2:
        y = ins[j]
        if _member(cp, y, 0xb6) == ("java/lang/Integer", "intValue", "()I"):
            nxt, cond = ins[j + 1], None
            if nxt[1] == 0x9a:  # ifne: el cuerpo corre si el nivel es 0
                cond, end, k = (0, "eq"), nxt[2], j + 2
            elif _push_int(cp, nxt) is not None and ins[j + 2][1] in (0xa0, 0xa1):  # if_icmpne (==) / if_icmplt (>=)
                cond, end, k = (_push_int(cp, nxt), "eq" if ins[j + 2][1] == 0xa0 else "ge"), ins[j + 2][2], j + 3
            if cond:
                rule = {"level": cond[0], "cmp": cond[1], "perk": None, "unless": None, "mult": None}
                mults = []
                while k + 1 < len(ins) and ins[k][0] < end:
                    a, b = ins[k], ins[k + 1]
                    field, call = _member(cp, a, 0xb2), _member(cp, a, 0xb6)
                    if field and field[0] == PERKS_CLASS and b[1] == 0xa6:  # getstatic Perks.X; if_acmpne
                        rule["perk"] = field[1]
                    elif call and call[0] == XP_CLASS and call[1].startswith("isSkillExcludedFromSpeed") and b[1] == 0x9a:
                        rule["unless"] = call[1][len("isSkillExcludedFromSpeed"):].lower()
                    elif _push_float(cp, a) is not None and b[1] == 0x6a:  # la constante que multiplica (fmul)
                        mults.append(_push_float(cp, a))
                    k += 1
                if len(mults) != 1 or (rule["unless"] and rule["unless"] not in excluded):
                    raise SystemExit(fail.format(f"la regla del nivel {cond[0]} tiene {mults}"))
                rule["mult"] = _tidy_float(mults[0])
                rules.append(rule)
                j = k
                continue
        if y[1] == 0xa7 and y[2] < y[0]:  # goto hacia atrás: se terminó el recorrido del mapa
            break
        j += 1
    if not rules:
        raise SystemExit(fail.format("no encontré ninguna regla"))
    return rules, excluded


PERK_CLASS = "zombie/characters/skills/PerkFactory$Perk"
TRAIT_CLASS = "zombie/scripting/objects/CharacterTrait"
# Lo que puede haber dentro del bloque de un rasgo (después del `ifeq`): cargar `this` o el perk (variable 7), llamar a
# getType/getParent/isSkillExcluded…, comparar contra un Perks.X o contra null, cargar/guardar el acumulador (variable 10)
# y multiplicarlo por una constante. Cualquier otra instrucción (un `ifeq` que invierta una condición, una cuenta, otra
# variable) es una forma que no se conoce: se corta en vez de adivinar.
_TRAIT_BLOCK_OPS = {0x2a, 0x19, 0xb2, 0xb6, 0xa5, 0xa6, 0x9a, 0xc6, 0xa7, 0x17, 0x38, 0x6a, 0x12, 0x13, 0x0b, 0x0c, 0x0d}


def xp_trait_multipliers(skills, trait_ids, excluded):
    """
    Los multiplicadores de XP de los rasgos (Aprendiz rápido, Aprendiz lento, Pacifista, Ingenioso), de
    `IsoGameCharacter$XP.AddXP(Perk, float, boolean×4)`: justo después de la cadena de las bonificaciones, el método
    multiplica el acumulador (la variable local 10, que ya trae el ×0.25…×1.66 de la bonificación) por cada rasgo del
    personaje, uno tras otro:

        this.this$0.characterTraits.get(CharacterTrait.X)  →  ifeq FIN
        [condición sobre el perk (variable 7)]  →  acumulador *= <constante>
        FIN:

    `skills` es {perk: id de su categoría} en el orden del juego (las habilidades de skills.json), `trait_ids` los ids de
    rasgo y `excluded` las excluidas de xp_boost_rules. Se lee cada bloque así:
      - el rasgo es el campo `CharacterTrait.X` de la instrucción anterior al `get` (FAST_LEARNER → `fastlearner`, el id de
        traits.json; si no existe, se corta);
      - `perks`: cada `getstatic Perks.X` (después de `Perk.getType`) seguido de `if_acmpeq` o `if_acmpne`. Pacifista los
        mezcla (los seis de cuerpo a cuerpo con `acmpeq`, el último con `acmpne`, y Puntería aparte), así que el opcode no
        dice nada: es el conjunto de perks con la constante que los rodea;
      - `unless`: `isSkillExcludedFromSpeedIncrease/Reduction` seguido de `ifne` (saltea el bloque si está excluida:
        Aprendiz rápido no sube Fuerza ni Estado físico; el lento no baja Carrera, Fuerza ni Estado físico);
      - `parent`: `getstatic Perks.Y` después de `Perk.getParent` (Ingenioso: la categoría Elaboración);
      - `mult`: la constante seguida de `fmul`. Puede haber varias (Pacifista tiene dos 0.75, una por rama) si todas valen
        lo mismo.
    Devuelve {id del rasgo: [{"mult": ×, "skills": [perk…]}]} con las habilidades en el orden de `skills`. Es una lista por
    si un parche le pone a un rasgo dos bloques con multiplicadores distintos; hoy cada rasgo tiene uno. Se multiplican
    con lo de la bonificación (no la reemplazan) y entre sí si un personaje tuviera más de un rasgo.
    """
    try:
        cp, code = _jar_class(XP_CLASS + ".class")
    except (OSError, KeyError, zipfile.BadZipFile):
        cp, code = {}, {}
    fail = ("No pude leer los multiplicadores de rasgos de XP en IsoGameCharacter$XP.AddXP ({}): el parche cambió ese "
            "código. No se escribió nada: hay que adaptar xp_trait_multipliers() (extract.py).")
    body = code.get(("AddXP", f"({PERK_TYPE}FZZZZ)V"))
    ins = _instructions(body) if body else []
    start = next((j for j, y in enumerate(ins) if (_member(cp, y, 0xb6) or ("", ""))[1] == "getXPBoostMap"), None)
    if start is None:
        raise SystemExit(fail.format("no está el recorrido de getXPBoostMap"))
    traits_get = ("zombie/characters/traits/CharacterTraits", "get", f"(L{TRAIT_CLASS};)Z")
    # Se leen los bloques desde el recorrido de la bonificación (en la 42.21 están los cuatro ahí). Un rasgo que un parche
    # consulte antes quedaría sin leer y sin aviso: mejor cortar.
    early = [j for j, y in enumerate(ins[:start]) if _member(cp, y, 0xb6) == traits_get]
    if early:
        raise SystemExit(fail.format(f"hay {len(early)} CharacterTraits.get antes del recorrido de getXPBoostMap"))
    out = {}
    for j in range(start, len(ins) - 2):
        if _member(cp, ins[j], 0xb6) != traits_get:
            continue
        field = _member(cp, ins[j - 1], 0xb2)
        if not field or field[0] != TRAIT_CLASS or field[2] != f"L{TRAIT_CLASS};":
            raise SystemExit(fail.format("un CharacterTraits.get no recibe un CharacterTrait.X fijo"))
        name = field[1]
        tid = name.lower().replace("_", "")
        if tid not in trait_ids:
            raise SystemExit(fail.format(f"el rasgo {name} ({tid}) no está en traits.json"))
        if ins[j + 1][1] != 0x99:  # ifeq: si el personaje no lo tiene, salta al final del bloque
            raise SystemExit(fail.format(f"después de {name} no viene un ifeq"))
        end, k = ins[j + 1][2], j + 2
        perks, unless, parents, mults = [], [], [], []
        while k + 1 < len(ins) and ins[k][0] < end:
            a, b = ins[k], ins[k + 1]
            if a[1] not in _TRAIT_BLOCK_OPS or (a[1] in (0x19, 0x17, 0x38) and a[2] not in (7, 10)):
                raise SystemExit(fail.format(f"el bloque de {name} tiene una instrucción desconocida en {a[0]}"))
            pf, call, before = _member(cp, a, 0xb2), _member(cp, a, 0xb6), _member(cp, ins[k - 1], 0xb6)
            if a[1] == 0xb2:  # getstatic Perks.X: tiene que ser parte de una comparación
                if not pf or pf[0] != PERKS_CLASS or b[1] not in (0xa5, 0xa6) or not before or before[0] != PERK_CLASS:
                    raise SystemExit(fail.format(f"el bloque de {name} usa un campo estático fuera de una comparación de perks"))
                if before[1] == "getType":
                    perks.append(pf[1])
                elif before[1] == "getParent":
                    parents.append(pf[1])
                else:
                    raise SystemExit(fail.format(f"el bloque de {name} compara Perks.{pf[1]} con {before[1]}"))
            elif a[1] == 0xb6:
                if call and call[0] == XP_CLASS and call[1].startswith("isSkillExcludedFromSpeed"):
                    key = call[1][len("isSkillExcludedFromSpeed"):].lower()
                    if b[1] != 0x9a or key not in excluded:  # ifne: si está excluida salta al final, el rasgo no cuenta
                        raise SystemExit(fail.format(f"el bloque de {name} usa {call[1]} sin un ifne después, o sin lista de excluidas"))
                    unless.append(key)
                elif not call or call[0] != PERK_CLASS or call[1] not in ("getType", "getParent"):
                    raise SystemExit(fail.format(f"el bloque de {name} llama a algo desconocido: {call}"))
            elif _push_float(cp, a) is not None and b[1] == 0x6a:  # la constante que multiplica (fmul)
                mults.append(_push_float(cp, a))
            k += 1
        conds = [c for c in (set(perks), set(unless), set(parents)) if c]
        if len(set(mults)) != 1 or len(conds) > 1 or len(set(unless)) > 1 or len(set(parents)) > 1:
            raise SystemExit(fail.format(f"el bloque de {name} tiene multiplicadores {mults}, perks {perks}, "
                                         f"excluidas {unless} y categorías {parents}"))
        if perks:
            if not set(perks) <= set(skills):
                raise SystemExit(fail.format(f"el bloque de {name} nombra {sorted(set(perks) - set(skills))}, que no son habilidades"))
            hit = [s for s in skills if s in set(perks)]
        elif parents:
            hit = [s for s, cat in skills.items() if cat == parents[0]]
        elif unless:
            hit = [s for s in skills if s not in excluded[unless[0]]]
        else:
            hit = list(skills)
        if not hit:
            raise SystemExit(fail.format(f"el bloque de {name} no alcanza ninguna habilidad"))
        taken = {s for e in out.get(tid, []) for s in e["skills"]}
        if taken & set(hit):  # dos bloques sobre la misma habilidad se multiplicarían entre sí: esta forma no lo dice
            raise SystemExit(fail.format(f"{name} multiplica dos veces {sorted(taken & set(hit))}"))
        out.setdefault(tid, []).append({"mult": _tidy_float(mults[0]), "skills": hit})
    if not out:
        raise SystemExit(fail.format("no encontré ningún rasgo"))
    return out


def _rule_applies(r, level, perk, excluded):
    if (level != r["level"]) if r["cmp"] == "eq" else (level < r["level"]):
        return False
    if r["perk"] and r["perk"] != perk:
        return False
    return not (r["unless"] and perk in excluded[r["unless"]])


def boost_multipliers(perk, rules, excluded, cap):
    """
    {"0": ×, …, str(cap): ×} de una habilidad (`perk=None`: la regla general, sin excepciones). La primera regla que se
    cumple gana; si ninguna, ×1 (así le queda a Fuerza y Estado físico, excluidas de las dos). La clave del tope ("3")
    vale para "3 o más": el juego nunca guarda una bonificación mayor (ver start_levels).
    """
    out = {}
    for level in range(cap + 1):
        out[str(level)] = next((r["mult"] for r in rules if _rule_applies(r, level, perk, excluded)), 1)
    return out


def start_levels():
    """
    ({habilidad: nivel inicial}, tope de bonificación), de `IsoGameCharacter.applyTraits(List)`. El método arranca un
    mapa con `Fitness → 5` y `Strength → 5` (el resto empieza en 0), le suma las bonificaciones de los rasgos y de la
    profesión, recorta a 0–10 y sube el personaje a ese nivel. Después guarda como bonificación `Math.min(3, nivel)`: ese
    3 es el tope (el mismo "3 o más" de los multiplicadores), y se lee del `Math.min` cuyo resultado va al mapa.
    """
    try:
        cp, code = _jar_class("zombie/characters/IsoGameCharacter.class")
    except (OSError, KeyError, zipfile.BadZipFile):
        cp, code = {}, {}
    body = code.get(("applyTraits", "(Ljava/util/List;)V"))
    ins = _instructions(body) if body else []
    starts, cap = {}, None
    # Antes del primer invokeinterface (el iterador de los rasgos): `getstatic Perks.X; <n>; Integer.valueOf; put`.
    for a, b, c, e in zip(ins, ins[1:], ins[2:], ins[3:]):
        if a[1] == 0xb9:
            break
        field = _member(cp, a, 0xb2)
        if (field and field[0] == PERKS_CLASS and _push_int(cp, b) is not None
                and (_member(cp, c, 0xb8) or ("", ""))[1] == "valueOf" and (_member(cp, e, 0xb6) or ("", ""))[1] == "put"):
            starts[field[1]] = _push_int(cp, b)
    # `iconst_3; iload; Math.min; Integer.valueOf; …put` (el otro Math.min, el del 10, va a una variable).
    for a, b, c, e in zip(ins, ins[1:], ins[2:], ins[3:]):
        if (_push_int(cp, a) is not None and (b[1] == 0x15 or 0x1a <= b[1] <= 0x1d)
                and _member(cp, c, 0xb8) == ("java/lang/Math", "min", "(II)I")
                and (_member(cp, e, 0xb8) or ("", ""))[1] == "valueOf"):
            cap = _push_int(cp, a)
    if not starts or cap is None:
        raise SystemExit(
            f"No pude leer el nivel inicial de las habilidades (leí {starts}) o el tope de bonificación ({cap}) en "
            "IsoGameCharacter.applyTraits: el parche cambió ese código. No se escribió nada: hay que adaptar "
            "start_levels() (extract.py).")
    return starts, cap


# ---------------------------------------------------------------------------
# Ítems
# ---------------------------------------------------------------------------

def is_debug(name, display=""):
    """
    Un ítem (o receta) de prueba del desarrollo, que no se encuentra en una partida. Se mira el nombre del script y,
    si hay, el nombre en inglés que le pone el juego: FISH_DEV_ITEM no tiene "debug" en ningún lado pero se llama "FISH
    DEV ITEM (NOT SPAWN)", y Animal_Item_Dummy sólo dice "DEBUG" en su nombre visible. "DEV" cuenta como palabra suelta
    (entre guiones bajos): "Halloween Mask - Devil" y "Device" no son de prueba.
    """
    low = name.lower()
    return (
        "debug" in low
        or re.match(r"Test[A-Z]", name) is not None
        or re.search(r"(?:^|_)dev(?:_|$)", low) is not None
        or re.search(r"\bdebug\b|\bnot spawn\b", display, re.I) is not None
    )


def skillbook_perks():
    """SkillBook["Carpentry"].perk = Perks.Woodwork → {"Carpentry": ("Woodwork", [3, 5, 8, 12, 16])}."""
    out = {}
    try:
        with open(SKILLBOOK_LUA, encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        return out  # sin el archivo es lo mismo que sin libros: build_items corta con el mensaje
    for name, perk in re.findall(r'SkillBook\["(\w+)"\]\.perk\s*=\s*Perks\.(\w+)', src):
        mults = [num(m) for m in re.findall(rf'SkillBook\["{name}"\]\.maxMultiplier\d\s*=\s*([\d.]+)', src)]
        out[name] = (perk, mults)
    return out


def build_items(scripts, T, icons):
    books = skillbook_perks()
    if not books:
        # Sin esta tabla ningún libro sabría qué habilidad entrena ni hasta qué nivel: saldrían
        # las fichas de los libros sin su dato central. Mejor cortar que publicarlas así.
        raise SystemExit(
            f"No encontré ningún libro de habilidad (SkillBook[\"…\"].perk = Perks.…) en {SKILLBOOK_LUA}: "
            "el archivo no está o el parche cambió su formato. No se escribió nada: hay que adaptar "
            "skillbook_perks() antes de volver a extraer.")
    raw = {}
    dups = Counter()
    for b in scripts["item"]:
        module = b.file.split("|")[0]
        iid = f"{module}.{b.name}"
        if iid in raw:
            dups[iid] += 1
        raw[iid] = b
    excluded = {"debug": [], "hidden": 0, "generic": []}
    items, unknown = {}, Counter()
    for iid, b in raw.items():
        p = b.props()
        name = b.name
        if is_debug(name, (T.get(iid) or {}).get("en", "")):
            excluded["debug"].append(iid)
            continue
        if p.get("hidden", "").lower() == "true" or p.get("DisplayCategory") == "Hidden":
            excluded["hidden"] += 1
            continue
        if p.get("ItemType") == "base:moveable" and not p.get("WorldObjectSprite"):
            excluded["generic"].append(iid)
            continue
        item = {
            "id": iid,
            "name": T.get(iid, fallback=name),
            "type": strip_ns(p.get("ItemType", "")),
            "displayCategory": p.get("DisplayCategory"),
            "icon": icons.item_icon(name, p),
            "weight": num(p["Weight"]) if "Weight" in p else None,
            "tags": sorted({t.lower() for t in lst(p.get("Tags", ""))}),
        }
        stats = {}
        for k, v in p.items():
            if k in STATS:
                stats[camel(k)] = STATS[k](v)
            elif k not in TOP_KEYS and k not in IGNORED and not is_audio(k):
                unknown[k] += 1
        # Libros de habilidad: el perk real y cuánto multiplica la XP (tabla de SkillBook en Lua).
        if "SkillTrained" in p:
            perk, mults = books.get(p["SkillTrained"], (p["SkillTrained"], []))
            stats["skillTrained"] = perk
            lvl = num(p.get("LvlSkillTrained", "1"))
            idx = (int(lvl) + 1) // 2 - 1 if isinstance(lvl, int) else -1
            if 0 <= idx < len(mults):
                stats["xpMultiplier"] = mults[idx]
        # Contenedor de líquido (botellas, baldes, latas de nafta…).
        fc = next((c for c in b.children if c.kind == "component" and c.name == "FluidContainer"), None)
        if fc:
            fp = fc.props()
            fluid = {"capacity": num(fp["Capacity"]) if "Capacity" in fp else None,
                     "container": fp.get("ContainerName")}
            if "RainFactor" in fp:
                fluid["rainFactor"] = num(fp["RainFactor"])
            if "InitialPercentMin" in fp or "InitialPercentMax" in fp:
                fluid["initialPercent"] = [num(fp.get("InitialPercentMin", "0")), num(fp.get("InitialPercentMax", "1"))]
            if flag(fp.get("PickRandomFluid", "false")):
                fluid["pickRandom"] = True
            fl = fc.child("Fluids")
            if fl:
                fluid["fluids"] = [[x.split(":")[0].strip(), num(x.split(":")[1]) if ":" in x else 1]
                                   for k, x in fl.pairs() if k == "fluid"]
            stats["fluid"] = fluid
        dur = next((c for c in b.children if c.kind == "component" and c.name == "Durability"), None)
        if dur:
            dp = dur.props()
            stats["durability"] = {"material": dp.get("Material"), "hitPoints": num(dp.get("MaxHitPoints", "0"))}
        # La bala que dispara un arma (o que carga un cargador): `AmmoType` es un registro del juego, no un ítem (ver
        # AMMO_ITEM). Se anota el ítem para que la ficha enlace a la bala.
        if stats.get("ammoType") in AMMO_ITEM:
            stats["ammoItem"] = AMMO_ITEM[stats["ammoType"]]
        # Dónde se lleva la ropa, con el nombre que le da el propio juego en la pantalla de ropa del personaje
        # (UI_ClothingType_<lugar>, en UI.json): "jacket" es "Chaqueta", "torsoextravestbullet" es "Chaleco protector".
        if isinstance(stats.get("bodyLocation"), str):
            where = T.get("UI_ClothingType_" + stats["bodyLocation"])
            if where:
                stats["bodyLocationName"] = where
        if stats:
            item["stats"] = stats
        if p.get("Tooltip"):
            tip = T.get(p["Tooltip"])
            if tip:
                item["tooltip"] = tip
        # Recetas: las que enseña al leerlo y las que se aprenden investigándolo (desarmar/estudiar, B42).
        teaches = lst(p.get("LearnedRecipes", "")) + lst(p.get("TeachedRecipes", ""))
        if teaches:
            item["teaches"] = teaches
        research = lst(p.get("Researchablerecipes", ""))
        if research:
            item["research"] = research
        opens = [x for x in (p.get("DoubleClickRecipe"), p.get("OpeningRecipe")) if x]
        if opens:
            item["opens"] = opens
        items[iid] = item
    # Un tipo de munición nuevo (o una bala que cambió de id) deja el arma sin enlace a su bala: mejor saberlo.
    for it in items.values():
        s = it.get("stats", {})
        if "ammoType" in s and s.get("ammoItem") not in items:
            print(f"AVISO: {it['id']} usa la munición {s['ammoType']}, que no está en AMMO_ITEM o apunta a un ítem que "
                  "no existe: su ficha sale sin el enlace a la bala.", file=sys.stderr)
    return items, excluded, dups, unknown


# ---------------------------------------------------------------------------
# Recetas
# ---------------------------------------------------------------------------

TOKEN = re.compile(r"\S*\[[^\]]*\]|\S+")


def parse_io(line):
    """
    Una línea de `inputs`/`outputs` de una craftRecipe:
        item 1 [Base.Log] flags[Prop2]
        item 1 tags[base:saw] mode:keep flags[MayDegradeLight;Prop1]
        item 6 [Base.BellPepper;5:Base.Broccoli] …   (5:… = otra cantidad para ese ítem)
        item variable[1:20] Base.CornSeed           (cantidad variable)
        item 2 mapper:StickMapper                    (la salida depende de la entrada)
        item 1 [*]                                   (cualquier ítem)
        -fluid 0.25 categories[Water] mode:mixture   (líquido: litros)
    """
    toks = TOKEN.findall(line)
    if not toks:
        return None
    kind = toks[0]
    out = {}
    rest = toks[1:]
    if rest:
        c = rest[0]
        if c.startswith("variable["):
            a, _, b = c[9:-1].partition(":")
            out["count"] = [num(a), num(b or a)]
            rest = rest[1:]
        elif re.match(r"^-?[\d.]+$", c):
            out["count"] = num(c)
            rest = rest[1:]
    if kind.endswith("fluid"):
        out = {"fluid": out.get("count", 1)}
        if kind.startswith("+"):
            out["produces"] = True
    elif kind != "item":
        out["kind"] = kind
    for t in rest:
        if t.startswith("tags["):
            out["tags"] = [x.lower() for x in lst(t[5:-1])]
        elif t.startswith("flags["):
            fl = [x for x in lst(t[6:-1]) if x not in ANIM_FLAGS]
            if fl:
                out["flags"] = fl
        elif t.startswith("mappers["):
            out["mappers"] = lst(t[8:-1])
        elif t.startswith("categories["):
            out["categories"] = lst(t[11:-1])
        elif t.startswith("["):
            ids, counts = [], {}
            for x in lst(t[1:-1]):
                m = re.match(r"^([\d.]+):(.+)$", x)
                if m:
                    ids.append(m.group(2) if kind.endswith("fluid") else item_ref(m.group(2)))
                    counts[ids[-1]] = num(m.group(1))
                else:
                    ids.append(x if x == "*" or kind.endswith("fluid") else item_ref(x))
            if kind.endswith("fluid"):
                out["fluids"] = ids
            elif ids == ["*"]:
                out["any"] = True
            else:
                out["items"] = ids
            if counts:
                out["counts"] = counts
        elif t.startswith("mode:"):
            out["mode"] = t[5:]
        elif t == "overlayMapper":
            out["overlayMapper"] = True  # la salida toma el color/dibujo del ingrediente
        elif t.startswith("mapper:"):
            out["mapper"] = t[7:]
        elif re.match(r"^[A-Za-z_][\w]*\.[\w.\-]+$", t):
            out["item"] = t
        else:
            out.setdefault("extra", []).append(t)
    return out


def recipe_core(b, p, T):
    """Lo que tienen en común una craftRecipe y la receta de construcción de una entity."""
    r = {}
    if p.get("category"):
        r["category"] = p["category"]
    if "time" in p:
        r["time"] = num(p["time"])
    tags = lst(p.get("Tags", ""))
    if tags:
        r["tags"] = tags
    if p.get("SkillRequired"):
        r["skills"] = skill_map(p["SkillRequired"])
    if p.get("xpAward"):
        r["xp"] = skill_map(p["xpAward"])
    ins = b.child("inputs")
    r["inputs"] = [x for x in (parse_io(v) for v in ins.values) if x] if ins else []
    outs = b.child("outputs")
    if outs:
        r["outputs"] = [x for x in (parse_io(v) for v in outs.values) if x]
    mappers = {}
    for c in b.children:
        if c.kind == "itemMapper":
            # `Resultado = Fuente;Fuente` se repite por resultado: Forge_Bar escribe IronBar seis veces
            # (trozo, cuarto y mitad de hierro), y en el juego cada línea suma fuentes a ese resultado. Quedarse con
            # la última línea (un dict que se pisa) borraba las demás: un trozo de acero parecía dar una barra de
            # hierro. Se juntan en orden, sin repetir. `default` no suma: es un solo ítem (si se repitiera, gana el último).
            m = {}
            for k, v in c.pairs():
                if k.lower() == "default":
                    m["default"] = item_ref(v)
                else:
                    srcs = m.setdefault(item_ref(k), [])
                    srcs += [x for x in item_list(v) if x not in srcs]
            mappers[c.name] = m
    if mappers:
        r["mappers"] = mappers
    learn = {}
    if flag(p.get("NeedToBeLearn", "false")):
        learn["needed"] = True
    for key, out_key in (("AutoLearnAll", "autoLearnAll"), ("AutoLearnAny", "autoLearnAny")):
        if p.get(key):
            learn[out_key] = skill_map(p[key])
    if p.get("MetaRecipe"):
        learn["meta"] = p["MetaRecipe"]
    if learn:
        r["learn"] = learn
    if p.get("Tooltip"):
        tip = T.get(p["Tooltip"])
        if tip:
            r["tooltip"] = tip
    if p.get("AllowBatchCraft"):
        r["batch"] = flag(p["AllowBatchCraft"])
    return r


def build_recipes(scripts, T, items, traits, professions, icons):
    # Estaciones: los componentes de entity con `Recipes = Tag;Tag` (CraftBench,
    # DryingCraftLogic…) dicen qué tags de receta se hacen ahí.
    benches = defaultdict(list)
    for e in scripts["entity"]:
        for c in e.children:
            if c.kind == "component":
                rp = c.props().get("Recipes")
                for tag in lst(rp or ""):
                    if e.name not in benches[tag]:
                        benches[tag].append(e.name)

    # Nombres de las construcciones: el xuiSkin de su entityStyle (DisplayName e Icon).
    styles = {}
    for sk in scripts["xuiSkin"]:
        for c in sk.children:
            if c.kind == "entity":
                styles[c.name] = c.props()

    recipes, dup_ids = [], Counter()
    seen = {}
    debug_recipes = []
    for b in scripts["craftRecipe"]:
        p = b.props()
        if p.get("category", "").lower() == "debug" or is_debug(b.name):
            debug_recipes.append(b.name)
            continue
        r = {"id": b.name, "kind": "craft", "name": T.get(b.name, fallback=b.name)}
        r.update(recipe_core(b, p, T))
        if b.name in seen:
            dup_ids[b.name] += 1
            recipes.remove(seen[b.name])
        seen[b.name] = r
        recipes.append(r)
    for e in scripts["entity"]:
        cr = next((c for c in e.children if c.kind == "component" and c.name == "CraftRecipe"), None)
        if not cr:
            continue
        p = cr.props()
        if p.get("category", "").lower() == "debug" or is_debug(e.name) or "debugItem" in e.props():
            debug_recipes.append(e.name)
            continue
        ui = next((c for c in e.children if c.kind == "component" and c.name == "UiConfig"), None)
        style = styles.get(ui.props().get("entityStyle"), {}) if ui else {}
        rid = e.name if e.name not in seen else "build:" + e.name
        # El nombre sale de Recipes.json con el DisplayName del estilo sin espacios
        # ("Wood Chair (Shoddy)" → "WoodChair(Shoddy)"); si el estilo no tiene nombre,
        # con el id de la entity, con o sin guiones bajos (Stone_Mill → StoneMill).
        dn = style.get("DisplayName") or ""
        r = {"id": rid, "kind": "build",
             "name": T.first([dn.replace(" ", ""), e.name, e.name.replace("_", "")], fallback=dn or e.name)}
        icon = style.get("Icon")
        if icon:
            r["icon"] = icons.sprite("build", icon)
        r.update(recipe_core(cr, p, T))
        r["outputs"] = [{"entity": e.name}]
        stations_here = [t for t, ents in benches.items() if e.name in ents]
        if stations_here:
            r["workstationFor"] = stations_here
        seen[rid] = r
        recipes.append(r)

    # Cualquier referencia a una receta (GrantedRecipes, LearnedRecipes, MetaRecipe…)
    # se resuelve sin mayúsculas ni el prefijo "base:"; lo que no es receta
    # (p. ej. "base:carrot growing season", saber de cultivo) queda sin enlazar.
    index = {}
    for r in recipes:
        index.setdefault(r["id"].lower(), r["id"])
        if r["id"].startswith("build:"):
            index.setdefault(r["id"][6:].lower(), r["id"])

    def norm(ref):
        return strip_ns(ref).lower()

    # MetaRecipe: varias recetas comparten un "saber" (base:kitchentools, base:makebonearmor):
    # lo que enseña ese saber (una revista, un rasgo) las enseña a todas. A veces el saber
    # es otra receta real (base:forge_fine_spoons): saber esa receta también las destraba.
    meta_members = defaultdict(list)
    for r in recipes:
        if r.get("learn", {}).get("meta"):
            meta_members[norm(r["learn"]["meta"])].append(r["id"])

    def targets(ref):
        """Las recetas que destraba una referencia (sin repetir); [] si no es una receta."""
        k = norm(ref)
        out = []
        rid = index.get(k) or index.get(k.replace(" ", "_"))
        if rid:
            out.append(rid)
        out += [m for m in meta_members.get(k, []) if m not in out]
        return out

    def resolve(ref):
        """Para mostrar: la receta si es una; si es un saber compartido, todas las que destraba."""
        return targets(ref) or [ref]

    unresolved = Counter()
    stations, categories = {}, {}
    sources = defaultdict(lambda: defaultdict(list))
    for iid, it in items.items():
        for key, out_key in (("teaches", "books"), ("research", "research")):
            for ref in it.get(key, []):
                found = targets(ref)
                for rid in found:
                    sources[rid][out_key].append(iid)
                if not found:
                    unresolved[ref] += 1
    for coll, key in ((traits, "traits"), (professions, "professions")):
        for t in coll:
            for ref in t.get("recipes", []):
                found = targets(ref)
                for rid in found:
                    sources[rid][key].append(t["id"])
                if not found:
                    unresolved[ref] += 1
    for r in recipes:
        learn = r.get("learn")
        if learn and "meta" in learn:
            # El saber compartido queda sin "base:"; si además es una receta real, con su id.
            learn["meta"] = index.get(norm(learn["meta"])) or norm(learn["meta"])
        src = sources.get(r["id"])
        if src:
            learn = r.setdefault("learn", {})
            for k, v in src.items():
                learn[k] = sorted(set(v))
        # Estación: los tags de la receta que son una mesa de trabajo. Lo son si la
        # ventana de fabricación les da nombre (IGUI_CraftingWindow_Forge), si alguna
        # entity los atiende, o si no son un filtro de categoría y Recipes.json los
        # nombra (StandingDrillPress: la máquina es un objeto del mapa, no una entity).
        if r["kind"] == "craft":
            st = []
            for t in r.get("tags", []):
                if t in RECIPE_FLAG_TAGS:
                    continue
                if t not in stations:
                    is_filter = T.has("IGUI_CraftCategory_" + t) or T.has("IGUI_CraftingCategories_" + t)
                    name = T.get("IGUI_CraftingWindow_" + t) or (None if is_filter else T.get(t))
                    stations[t] = None
                    if name or t in benches:
                        stations[t] = {"name": name or T.get(t, fallback=t)}
                        if t in benches:
                            stations[t]["entities"] = benches[t]
                if stations[t]:
                    st.append(t)
            if st:
                r["stations"] = st
        if r.get("category") and r["category"] not in categories:
            categories[r["category"]] = T.get("IGUI_CraftingCategories_" + r["category"], fallback=r["category"])

    # Nombres de líquidos y categorías de líquido que aparecen en las recetas.
    fluid_defs = {b.name: b.props() for b in scripts["fluid"]}
    fluids, fluid_cats = {}, {}
    for r in recipes:
        for i in r["inputs"]:
            for f in i.get("fluids", []):
                d = fluid_defs.get(f, {})
                fluids[f] = T.get(d.get("DisplayName") or "Fluid_Name_" + f, fallback=f)
            for c in i.get("categories", []):
                fluid_cats[c] = T.get("Fluid_Category_" + c, fallback=c)
    names = {
        "categories": dict(sorted(categories.items())),
        "stations": {k: v for k, v in sorted(stations.items()) if v},
        "fluids": dict(sorted(fluids.items())),
        "fluidCategories": dict(sorted(fluid_cats.items())),
    }
    return recipes, names, benches, sources, unresolved, dup_ids, debug_recipes, resolve


def build_evolved(scripts, T, items):
    recipes = []
    for b in scripts["evolvedrecipe"]:
        p = b.props()
        r = {
            "id": b.name,
            "name": T.first(["ContextMenu_EvolvedRecipe_" + b.name], fallback=p.get("Name") or b.name),
            "action": T.first([(p.get("Name") or "").replace(" ", "")], fallback=p.get("Name") or b.name),
            "template": p.get("Template"),
            "baseItem": item_ref(p["BaseItem"]) if p.get("BaseItem") else None,
            "resultItem": item_ref(p["ResultItem"]) if p.get("ResultItem") else None,
            "maxItems": num(p["MaxItems"]) if "MaxItems" in p else None,
            "cookable": flag(p.get("Cookable", "false")),
        }
        for k in ("MinimumWater",):
            if k in p:
                r[k[0].lower() + k[1:]] = num(p[k])
        for k in ("AddIngredientIfCooked", "CanAddSpicesEmpty", "HiddenAmount"):
            if k in p:
                r[k[0].lower() + k[1:]] = flag(p[k])
        recipes.append(r)
    # Los ingredientes: cada ítem dice en qué recetas entra (`EvolvedRecipe = Soup:10;Stew:10`)
    # y la clave es el Template de la receta o, a veces, su nombre de bloque (RicePot, "Stir fry Griddle Pan").
    ingredients = defaultdict(list)
    for iid, it in items.items():
        for key, amount in it.get("stats", {}).get("evolvedRecipe", {}).items():
            ingredients[key].append([iid] + (amount if isinstance(amount, list) else [amount]))
    lower = {k.lower(): k for k in ingredients}
    for r in recipes:
        keys = []
        for k in (r["template"], r["id"]):
            if k and k.lower() in lower and lower[k.lower()] not in keys:
                keys.append(lower[k.lower()])
        r["ingredientKeys"] = keys
    return {"recipes": recipes, "ingredients": {k: sorted(v) for k, v in sorted(ingredients.items())}}


def build_fixing(scripts):
    out = []
    for b in scripts["fixing"]:
        f = {"id": b.name, "require": [], "fixers": []}
        for k, v in b.pairs():
            if k == "Require":
                f["require"] += item_list(v)
            elif k == "GlobalItem":
                it, _, uses = v.partition("=")
                f["globalItem"] = {"item": item_ref(it), "uses": num(uses or "1")}
            elif k == "ConditionModifier":
                f["conditionModifier"] = num(v)
            elif k == "Fixer":
                head, _, skills = v.partition(";")
                it, _, uses = head.partition("=")
                fx = {"item": item_ref(it), "uses": num(uses or "1")}
                sk = skill_map(skills)
                if sk:
                    fx["skills"] = sk
                f["fixers"].append(fx)
        out.append(f)
    return out


# ---------------------------------------------------------------------------
# Rasgos, profesiones, habilidades, moodles
# ---------------------------------------------------------------------------

def build_traits(scripts, T, icons):
    traits = []
    for b in scripts["character_trait_definition"]:
        p = b.props()
        tid = strip_ns(p.get("CharacterTrait") or b.name)
        loose = os.path.join(MEDIA, "ui", "Traits", f"trait_{tid}.png")
        t = {
            "id": tid,
            "name": T.get(p.get("UIName", ""), fallback=tid),
            "desc": T.get(p["UIDescription"]) if p.get("UIDescription") else None,
            "cost": num(p.get("Cost", "0")),
            "professionOnly": flag(p.get("IsProfessionTrait", "false")),
            "disabledInMultiplayer": flag(p.get("DisabledInMultiplayer", "false")),
            "xpBoosts": skill_map(p.get("XPBoosts", "")),
            "recipes": lst(p.get("GrantedRecipes", "")),
            "grantedTraits": ns_list(p.get("GrantedTraits", "")),
            "exclusive": ns_list(p.get("MutuallyExclusiveTraits", "")),
            # CharacterTraitDefinition: media/ui/Traits/trait_<id>.png (los nuevos de B42 vienen sueltos, el resto en UI2.pack).
            "icon": icons.sprite("traits", f"trait_{tid}", loose),
        }
        traits.append(t)
    # Las exclusiones se declaran de un lado solo a veces; el juego las chequea en los dos sentidos.
    by_id = {t["id"]: t for t in traits}
    for t in traits:
        for other in t["exclusive"]:
            if other in by_id and t["id"] not in by_id[other]["exclusive"]:
                by_id[other]["exclusive"].append(t["id"])
    for t in traits:
        t["exclusive"] = sorted(t["exclusive"])
    # Gemelos (2026-09-30): seis rasgos están dos veces con el mismo nombre y la misma descripción, uno que se elige al
    # crear el personaje y otro de profesión (IsProfessionTrait, costo 0) que trae alguna profesión: Herrería
    # (blacksmith / blacksmith2), Cocinar (cook / cook2), Herborista (herbalist / herbalist_prof)… Cada uno anota el id
    # del otro en `twin`, así la ficha los enlaza y el <head> del de profesión dice de cuál viene (ver site_index).
    by_name = defaultdict(list)
    for t in traits:
        by_name[t["name"]["en"]].append(t)
    for pair in by_name.values():
        if len(pair) == 2 and pair[0]["professionOnly"] != pair[1]["professionOnly"]:
            pair[0]["twin"], pair[1]["twin"] = pair[1]["id"], pair[0]["id"]
    return traits


# TEXTO PROPIO (2026-09-30), sólo en español: la mecánica de autos que saben el Mecánico y Mecánico aficionado no
# tiene nombre en Recipes.json de ninguno de los dos idiomas, y el juego (`Translator.getRecipeName`) muestra la clave
# tal cual, en inglés. "Mecánica básica" es la de ES_MX (`Tooltip_Recipe_Basic_Mechanics`); las otras dos, las mismas
# palabras que usa Translate/AR del juego.
KNOWLEDGE_ES = {
    "Basic Mechanics": "Mecánica básica",
    "Intermediate Mechanics": "Mecánica intermedia",
    "Advanced Mechanics": "Mecánica avanzada",
}


def knowledge_name(ref, T):
    """
    {en, es} de algo que un rasgo o una profesión "sabe" y no es una receta (`GrantedRecipes`): el nombre que le da el
    juego con `Translator.getRecipeName` (Recipes.json: "base:carrot growing season" → "Carrot Growing Season" /
    "Temporada de cultivo de zanahoria", "Generator" → "Generator Maintenance" / "Generador"), y si no tiene, la clave.
    """
    name = T.get(ref)
    if name and name["es"]:
        return name
    en = name["en"] if name else ref
    return {"en": en, "es": KNOWLEDGE_ES.get(ref, en)}


def build_professions(scripts, T, icons, traits):
    profs = []
    for b in scripts["character_profession_definition"]:
        p = b.props()
        pid = strip_ns(p.get("CharacterProfession") or b.name)
        icon = p.get("IconPathName")
        pr = {
            "id": pid,
            "name": T.get(p.get("UIName", ""), fallback=pid),
            "desc": T.get(p["UIDescription"]) if p.get("UIDescription") else None,
            "cost": num(p.get("Cost", "0")),
            "xpBoosts": skill_map(p.get("XPBoosts", "")),
            "traits": ns_list(p.get("GrantedTraits", "")),
            "recipes": lst(p.get("GrantedRecipes", "")),
            "icon": icons.sprite("professions", icon) if icon else None,
        }
        profs.append(pr)
    by_id = {t["id"]: t for t in traits}
    for pr in profs:
        for tid in pr["traits"]:
            if tid in by_id:
                by_id[tid].setdefault("professions", []).append(pr["id"])
    return profs


def build_skills(T, perks, used, starts, rules, excluded, cap):
    """
    Las habilidades del juego (las de PerkFactory que tienen categoría), por su id (Perks.Woodwork), con:
      - `en`/`es`: IGUI_perks_<traducción>, la clave que usa el juego (Woodwork se traduce con "Carpentry");
      - `cat`: la categoría (el padre en PerkFactory) con su id y su nombre (IGUI_perks_CombatMelee = "Combat - Melee");
      - `xp`: la XP para pasar de cada nivel al siguiente (ver perk_factory);
      - `start`: el nivel inicial, sólo si no es 0 (Fuerza y Estado físico: 5);
      - `boost`: los multiplicadores por nivel de bonificación, sólo si no son los generales (los de `meta.json` →
        `boostMultipliers`): Carrera no tiene el ×0.25 y con 1 va ×1.25; Fuerza y Estado físico, ×1 siempre.
    Devuelve (habilidades, multiplicadores generales), en el orden de PerkFactory (el de la pantalla de habilidades del
    juego, que agrupa por categoría): es un orden fijo del .jar, así que el archivo sale igual cada vez. Una habilidad que
    nombra un script y no está en PerkFactory (no pasa en la 42.21) se avisa y queda afuera: sin tabla de XP no hay ficha
    que mostrar.
    """
    by_id = {p["perk"]: p for p in perks}
    general = boost_multipliers(None, rules, excluded, cap)
    for level in range(cap + 1):
        if not any(_rule_applies(r, level, None, excluded) for r in rules):
            raise SystemExit(
                f"No encontré el multiplicador general de XP para la bonificación {level} en IsoGameCharacter$XP.AddXP: "
                "el parche cambió ese código. No se escribió nada: hay que adaptar xp_boost_rules() (extract.py).")
    missing = sorted(set(starts) - set(by_id))
    if missing:
        raise SystemExit(f"applyTraits da nivel inicial a {missing}, que no están en PerkFactory. No se escribió nada: "
                         "hay que revisar start_levels() (extract.py).")
    out = {}
    for perk in (p["perk"] for p in perks if p["parent"]):
        p = by_id[perk]
        parent = by_id.get(p["parent"])
        cat = T.first(["IGUI_perks_" + parent["name"]] if parent else [], fallback=p["parent"])
        s = {**T.first(["IGUI_perks_" + p["name"], "IGUI_perks_" + perk], fallback=perk),
             "cat": {"id": p["parent"], **cat}, "xp": p["xp"]}
        if starts.get(perk):
            s["start"] = starts[perk]
        mine = boost_multipliers(perk, rules, excluded, cap)
        if mine != general:
            s["boost"] = mine
        out[perk] = s
    for perk in sorted(used - set(out)):
        print(f"AVISO: {perk} aparece en los scripts pero no es una habilidad de PerkFactory: queda sin ficha.",
              file=sys.stderr)
    return out, general


def radio_codes():
    """
    Los códigos de las líneas de radio, TV y medios grabados, de ISRadioInteractions.lua:
      - `Interactions.CRP = function(…) doSkill(_player, _amount, …, Perks.Woodwork)`: habilidades (código → perk). Son
        33 en la 42.21; uno de ellos, `CMB`, apunta a `Perks.Combat`, que es una categoría y no una habilidad: ningún
        medio lo usa, y si alguno lo usara queda en `sin_habilidad` (sin ficha) en vez de inventarle una;
      - `Interactions.BOR = function(…) doStat("Boredom", …)`: estados de ánimo (aburrimiento, estrés…).
    Y cuánta XP da cada punto: `doSkill` hace `addXp(…, 50*_amount)`. Devuelve ({código: perk}, {códigos de ánimo}, 50).
    """
    try:
        with open(RADIO_LUA, encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        src = ""
    skills = dict(re.findall(r"Interactions\.([A-Z]{3})\s*=\s*function\([^)]*\)\s*doSkill\([^;]*?Perks\.(\w+)\s*\)", src))
    stats = set(re.findall(r"Interactions\.([A-Z]{3})\s*=\s*function\([^)]*\)\s*doStat\(", src))
    factor = re.search(r"local\s+amount\s*=\s*([\d.]+)\s*\*\s*_amount", src)
    if not skills or not factor:
        raise SystemExit(
            f"No encontré en {RADIO_LUA} qué habilidad sube cada código de los VHS (Interactions.XXX = … doSkill(…, "
            "Perks.…)) o cuánta XP da cada punto (local amount = N*_amount): el archivo no está o el parche cambió su "
            "formato. No se escribió nada: hay que adaptar radio_codes() (extract.py).")
    return skills, stats, num(factor.group(1))


# Las categorías de medios grabados (`category` en recorded_media.lua) y lo que son para el sitio.
MEDIA_KIND = {"Retail-VHS": "vhs", "Home-VHS": "vhs", "CDs": "cd"}


def line_xp(codes_str, radio, skills, left):
    """
    La XP que da una línea de VHS, CD, radio o TV por sus códigos ("CRP+1,BOR-1"): {perk: XP base}. Es la misma cuenta
    para los medios grabados y para las emisiones, porque el juego pasa las dos por el mismo `checkPlayer` →
    `Interactions.XXX` → `doSkill` (ISRadioInteractions.lua). `radio` es lo que devuelve radio_codes(); lo que no se
    entiende se anota en `left` (como en build_media).

    Los códigos se leen como los lee el juego, sin tolerar nada de más: se parte por "," sin recortar espacios, y cada
    código son tres letras, el signo (`-`, `+` o `=`) y al menos un carácter de cantidad (`_v:len() > 4`, `string.sub`).
    Un espacio suelto no se perdona: con " CRP+1" el juego lee el código " CR" y no hace nada. Un código de habilidad con
    `-` no da nada (doSkill ignora lo que no es positivo); con `=` suma igual que con `+` (doSkill no mira la operación).
    """
    codes, stats, factor = radio
    xp = defaultdict(float)
    for code in (codes_str.split(",") if codes_str else []):
        c = re.fullmatch(r"([A-Z]{3})([-+=])(.+)", code)  # como el juego: sin espacios sueltos, y cantidad de 1 o más
        if not c or c.group(1) == "RCP" or c.group(1) in stats:
            continue
        if c.group(1) not in codes:
            left["desconocidos"].add(c.group(1))
            continue
        perk = codes[c.group(1)]
        if perk not in skills:
            left["sin_habilidad"][c.group(1)] = perk
            continue
        if not re.fullmatch(r"-?\d+(?:\.\d+)?", c.group(3)):  # un número de verdad (`tonumber` dice nil si no)
            left["desconocidos"].add(code)
            continue
        amount = float(c.group(3))
        if c.group(2) != "-" and amount > 0:
            xp[perk] += factor * amount
    return xp


def build_media(T, skills):
    """
    Los VHS y CD que dan XP, de media/lua/shared/RecordedMedia/recorded_media.lua: cada medio es una lista de líneas y
    cada línea trae sus códigos ("CRP+1" = un punto de Carpintería, "BOR-1" = menos aburrimiento, "RCP=…" = enseña una
    receta). La XP de un medio en una habilidad es 50 × la suma de sus puntos (ver radio_codes), contando cada línea una
    sola vez.

    "Una sola vez" es por jugador y por clave de texto, en TODOS los medios juntos, no por cinta: `checkPlayer` (en
    ISRadioInteractions.lua) anota la clave (`player:addKnownMediaLine(guid)`) y si ya la tenía no hace nada, ni los
    códigos de ánimo ni los de XP. Dentro de una cinta se cuenta una vez cada clave (acá, `seen`). Pero una clave que
    también está en OTRA cinta da su XP a la primera que se mire, y a la otra no. En la 42.21 hay dos claves así con
    código de habilidad: la de CRP+1 de Woodcraft E3 (está en las otras seis cintas de Woodcraft, donde sólo baja el
    aburrimiento) y la de MTL+1 de "Home VHS: no 9" (está en "Home VHS: nof vid", que a esa línea le pone una receta).
    Esas cintas llevan `"shared": true`: lo que dice su `xp` es un máximo ("hasta"). Se detecta mirando las claves de
    todos los medios, sin ids puestos a mano.

    Es la XP base, antes de los multiplicadores de bonificación, como la `xp` de las recetas; y el juego deja de darla
    desde el nivel `mediaXpCutoff` (ver media_xp_cutoff). Cómo se lee cada código: line_xp.

    Los programas de TV que dan XP no salen de acá sino de build_tv (RadioData.xml), con la misma line_xp. No van las
    recetas que enseñan (RCP=): la forma de media.json es la XP.

    Devuelve (medios, {"sin_habilidad": {código: perk}, "desconocidos": {código}}).
    """
    radio = radio_codes()
    try:
        with open(RECORDED_MEDIA_LUA, encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        src = ""
    blocks = re.findall(r'RecMedia\["([^"]+)"\]\s*=\s*\{(.*?)\n\};', src, re.S)
    if not blocks:
        raise SystemExit(
            f"No encontré ningún medio grabado (RecMedia[\"…\"] = {{ … }}) en {RECORDED_MEDIA_LUA}: el archivo no está o "
            "el parche cambió su formato. No se escribió nada: hay que adaptar build_media() (extract.py).")
    out, left = [], {"sin_habilidad": {}, "desconocidos": set(), "categorias": set()}
    # En qué cintas está cada clave de texto (de todas, den XP o no): el juego anota las líneas vistas por clave, no por cinta.
    owners = defaultdict(set)
    for mid, body in blocks:
        for text_key in re.findall(r'\{\s*text\s*=\s*"([^"]*)"', body):
            owners[text_key].add(mid)
    for mid, body in blocks:
        cat = re.search(r'\bcategory\s*=\s*"([^"]*)"', body)
        name = re.search(r'\bitemDisplayName\s*=\s*"([^"]*)"', body)
        xp, seen, shared = defaultdict(float), set(), False
        for text_key, rest in re.findall(r'\{\s*text\s*=\s*"([^"]*)"([^{}]*)\}', body):
            if text_key in seen:
                continue
            seen.add(text_key)
            m = re.search(r'\bcodes\s*=\s*"([^"]*)"', rest)
            gained = line_xp(m.group(1) if m else "", radio, skills, left)
            for perk, v in gained.items():
                xp[perk] += v
            if gained:
                shared = shared or len(owners[text_key]) > 1
        if not xp:
            continue
        kind = MEDIA_KIND.get(cat.group(1) if cat else "")
        if not kind:
            left["categorias"].add(cat.group(1) if cat else "?")
            continue
        key = name.group(1) if name else mid
        out.append({"id": mid, "name": T.get(key, fallback=key), "kind": kind,
                    "xp": {k: num(str(v)) for k, v in sorted(xp.items())}, **({"shared": True} if shared else {})})
    if not out:
        raise SystemExit(
            f"Leí {len(blocks)} medios grabados y ninguno da XP: el parche cambió los códigos de las líneas o "
            "ISRadioInteractions.lua. No se escribió nada: hay que revisar build_media() (extract.py).")
    out.sort(key=lambda m: (m["kind"], m["name"]["en"], m["id"]))
    return out, left


def media_xp_cutoff():
    """
    El nivel desde el que los VHS, CD y la TV ya no dan XP: `LevelForMediaXPCutoff` (ISRadioInteractions: si el nivel
    es >= a éste, doSkill no suma). Se lee del preset Apocalypse (media/lua/shared/Sandbox/Apocalypse.lua), el que el
    juego trae elegido al crear una partida; en la 42.21 los cuatro presets dicen 3. Es una opción del sandbox: si falta,
    se avisa y queda en null (no corta: la XP de cada medio sigue siendo la del juego).
    """
    try:
        with open(SANDBOX_PRESET, encoding="utf-8", errors="replace") as f:
            m = re.search(r"\bLevelForMediaXPCutoff\s*=\s*(\d+)", f.read())
    except OSError:
        m = None
    if not m:
        print(f"AVISO: no encontré LevelForMediaXPCutoff en {SANDBOX_PRESET}: mediaXpCutoff queda en null en meta.json.",
              file=sys.stderr)
        return None
    return int(m.group(1))


def game_start_minute():
    """
    A qué hora arranca una partida nueva, en minutos desde la medianoche: `StartTime` del preset Apocalypse (el que el
    juego trae elegido; en la 42.21 dice 2) es el número de opción, y la hora es la etiqueta de esa opción en inglés
    (`Sandbox_StartTime_option2` = "9 AM" en Translate/EN/Sandbox.json). Sirve para saber qué programa de TV del primer
    día termina antes de que empiece la partida (build_tv). Si falta algo, avisa y queda en null: los programas siguen,
    sin esa marca.
    """
    try:
        with open(SANDBOX_PRESET, encoding="utf-8", errors="replace") as f:
            opt = re.search(r"\bStartTime\s*=\s*(\d+)", f.read())
        with open(os.path.join(TRANSLATE, EN, "Sandbox.json"), encoding="utf-8-sig") as f:
            label = json.load(f).get(f"Sandbox_StartTime_option{opt.group(1)}", "") if opt else ""
    except (OSError, ValueError):
        label = ""
    m = re.fullmatch(r"(\d{1,2})\s*(AM|PM)", label.strip())
    if not m or not 1 <= int(m.group(1)) <= 12:
        print(f"AVISO: no entendí la hora de arranque de la partida (StartTime de {SANDBOX_PRESET} → {label!r}): "
              "gameStartMinute queda en null en meta.json y ningún programa de TV lleva beforeStart.", file=sys.stderr)
        return None
    return (int(m.group(1)) % 12 + (12 if m.group(2) == "PM" else 0)) * 60


def build_tv(skills, left, start_minute):
    """
    Los programas de TV que dan XP, de media/radio/RadioData.xml. En la 42.21 son los de "Life and Living TV": cocina,
    carpintería, pesca, recolección, trampas y agricultura. Cada línea trae sus códigos como las de los VHS ("COO+1") y
    el juego los pasa por el mismo checkPlayer → doSkill, así que la XP se cuenta con la misma line_xp: 50 por punto,
    base, antes de multiplicadores, y nada desde el nivel `mediaXpCutoff`.

    Una entrada por emisión (`BroadcastEntry`) con XP, no por canal: cada una sale un solo día y a una hora fija, y eso
    es lo que hay que saber para verla. El horario, leído en el .jar:
      - El reloj de la radio es `días desde el arranque × 1440 + hora × 60 + minuto` (RadioScriptManager.UpdateScripts) y
        arranca en el día 0 con la partida (ZomboidRadio.Init: `daysSinceStart` = (TimeSinceApo − 1) × 30,5, o sea 0 con
        "0 meses", la opción de siempre; con más meses los programas ya pasaron). Los `timestamp`/`endstamp` de cada
        emisión son minutos en ese reloj: `day` acá es el día de la partida (1 = el día en que arranca) y `start`/`end`,
        los minutos desde la medianoche de ese día (`end` puede ser 1440).
      - El canal arranca con su `startscript` ("main"), que corre una sola vez (loopmin = loopmax = 1) y sin otro guion
        después (ExitOptions vacío): pasado el último día, el canal queda mudo. Si un parche le pone repeticiones, demora
        u otro guion, los días dejan de ser fijos y esto corta en vez de inventarlos.
      - La emisión arranca desde su primera línea cuando alguien prende la tele en ese canal dentro de su horario, y una
        sola vez (RadioChannel.SetPlayerIsListening → RadioScript.getValidAirBroadcast, `currentHasAired`).
      - Sus líneas van sin guid (RadioChannel.update → SendTransmission(…, null, códigos…)): checkPlayer no las anota
        como vistas, pero como cada emisión sale una vez, cada línea da su XP una vez.
    `beforeStart`: termina el día 1 antes de la hora en que arranca la partida (game_start_minute; 9:00 por defecto), así
    que con esa hora de arranque nunca se ve.

    No van las emisiones de la radio (sólo traen FEA, que ISRadioInteractions no conoce) ni las del guion
    `init_infection`, que es del modo "Initial Infection". Un canal con XP que no sea de categoría Television se anota en
    `left["categorias"]` y queda afuera, como un VHS de una categoría nueva.
    """
    radio = radio_codes()
    try:
        root = ET.parse(RADIO_DATA).getroot()
    except (OSError, ET.ParseError) as e:
        raise SystemExit(f"No pude leer {RADIO_DATA} ({e}): el archivo no está o el parche cambió su formato. No se "
                         "escribió nada: hay que adaptar build_tv() (extract.py).")
    out = []
    for ch in root.iter("ChannelEntry"):
        name, cat = ch.get("name"), ch.get("cat")
        script = next((s for s in ch.iter("ScriptEntry") if s.get("name") == ch.get("startscript")), None)
        if script is None:
            continue
        rows = []
        for b in script.iter("BroadcastEntry"):
            xp = defaultdict(float)
            for line in b.iter("LineEntry"):
                for perk, v in line_xp(line.get("codes") or "", radio, skills, left).items():
                    xp[perk] += v
            if xp:
                rows.append((b, xp))
        if not rows:
            continue
        if cat != "Television":
            left["categorias"].add(f"{cat} ({name})")
            continue
        exits = script.find("ExitOptions")
        if (script.get("loopmin"), script.get("loopmax"), script.get("startdelay"), script.get("timestampmode")) != \
                ("1", "1", "0", "Static") or (exits is not None and len(exits)):
            raise SystemExit(
                f"El guion {script.get('name')!r} de {name!r} ({RADIO_DATA}) ya no corre una sola vez, sin demora y sin "
                "otro guion después: los días de sus programas dejan de ser fijos. No se escribió nada: hay que adaptar "
                "build_tv() (extract.py).")
        for b, xp in rows:
            start, end = int(b.get("timestamp")), int(b.get("endstamp"))
            day = start // 1440
            e = {"id": b.get("ID"), "name": {"en": name, "es": name}, "kind": "tv",
                 "xp": {k: num(str(v)) for k, v in sorted(xp.items())},
                 "day": day + 1, "start": start - day * 1440, "end": end - day * 1440}
            if start_minute is not None and day == 0 and end <= start_minute:
                e["beforeStart"] = True
            out.append(e)
    out.sort(key=lambda m: (m["name"]["en"], m["day"], m["start"], m["id"]))
    return out


def build_moodles(T, icons):
    """Los tipos de MoodleType con nombre y descripción por nivel (Moodles_<Tipo>_lvl1…4)."""
    tex = moodle_textures()
    if len(tex) < MIN_MOODLES:
        raise SystemExit(
            f"Leí {len(tex)} moodles de zombie/ui/MoodleTextureSet.class en projectzomboid.jar y la 42.21 trae 26 "
            f"(el piso es {MIN_MOODLES}): el parche cambió ese bytecode y moodle_textures() ya no lo entiende. "
            "No se escribió nada: hay que adaptar moodle_textures() antes de volver a extraer.")
    folder = os.path.join(MEDIA, "ui", "Moodles", MOODLE_SIZE)
    moodles = []
    for enum, png in tex.items():
        mid = "".join(w.capitalize() for w in enum.split("_"))  # HAS_A_COLD → HasACold (la clave de Moodles.json)
        levels = []
        for lvl in range(1, 5):
            name = T.get(f"Moodles_{mid}_lvl{lvl}")
            if not name:
                continue
            levels.append({"level": lvl, "name": name, "desc": T.get(f"Moodles_{mid}_desc_lvl{lvl}")})
        moodles.append({"id": mid, "icon": icons.file("moodles", png, os.path.join(folder, png + ".png")), "levels": levels})
    # Los fondos sobre los que se dibuja el ícono (el juego los tiñe según el nivel).
    for bg in ("_Moodles_BGsolid", "_Moodles_BGoutline"):
        icons.file("moodles", bg.lstrip("_"), os.path.join(folder, bg + ".png"))
    return moodles


# ---------------------------------------------------------------------------
# El índice de fichas del sitio
# ---------------------------------------------------------------------------

# Las pestañas con una ficha por cosa, en el orden en que van en index.json. Parches también tiene fichas (una por
# edición de la Crónica), pero no salen del juego instalado: no van acá.
INDEX_SECS = ("items", "recipes", "traits", "professions", "skills", "moodles", "server")

# TEXTO PROPIO (2026-10-01), no del juego: las dos subpáginas de la pestaña Servidor que tienen dirección propia (la
# tabla de presets y la explicación de los cortes de agua y luz). No salen de una cosa del juego: el nombre es el que se
# busca, y el slug en español sale solo de `es` (presets-de-sandbox, cortes-de-agua-y-luz). `ref` va vacío.
SERVER_PAGES = (
    ("Sandbox Presets", "Presets de sandbox"),
    ("Water and Power Shutoff", "Cortes de agua y luz"),
)


def slugify(name):
    """
    El mismo `slugify` de `site/src/route.ts`, paso por paso: NFD y afuera lo que no es ASCII (la tilde se va y la
    letra queda), minúsculas, sin `'` ni `.`, lo demás a `-` y sin guiones en las puntas. Tienen que dar lo mismo: el
    sitio le pide a cada ficha su dirección con el suyo (lo prueba `site/test/zomboidIndex.test.ts`), así que si se
    cambia uno se cambia el otro.
    """
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['.]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# TEXTO PROPIO (2026-09-30), no del juego: el nombre de cada moodle en inglés y en español. El juego sólo nombra cada
# nivel (Hungry: "Peckish", "Hungry", "Very Hungry", "Starving to Death"), no el moodle. En inglés va el tipo partido en
# palabras, que es como los llama la comunidad; salvo CantSprint, que tiene un solo nivel y en la partida se lee
# "Restricted Movement" (`Moodles_CantSprint_lvl1`): va ese, el que ve el jugador, igual que en español. En español, donde el juego tiene una
# palabra para lo que mide el moodle se usa esa, así se reconoce al jugar: los avisos que flotan sobre el personaje
# (`IGUI_HaloNote_*` de ES_MX: Ira, Hambre, Estrés, Embriaguez…) y `IGUI_StatsAndBody_Wetness` (Humedad). El resto es
# nuestro. El nombre en español es también su dirección (`/es/project-zomboid/moodles/sangrado`).
MOODLE_NAMES = {
    "Angry": ("Angry", "Ira"),
    "Bleeding": ("Bleeding", "Sangrado"),
    "Bored": ("Bored", "Aburrimiento"),
    "CantSprint": ("Restricted Movement", "Movimiento restringido"),
    "Dead": ("Dead", "Muerte"),
    "Drunk": ("Drunk", "Embriaguez"),
    "Endurance": ("Endurance", "Resistencia"),
    "FoodEaten": ("Food Eaten", "Saciedad"),
    "HasACold": ("Has a Cold", "Resfriado"),
    "HeavyLoad": ("Heavy Load", "Sobrecarga"),
    "Hungry": ("Hungry", "Hambre"),
    "Hyperthermia": ("Hyperthermia", "Hipertermia"),
    "Hypothermia": ("Hypothermia", "Hipotermia"),
    "Injured": ("Injured", "Lesiones"),
    "NoxiousSmell": ("Noxious Smell", "Olor nocivo"),
    "Pain": ("Pain", "Dolor"),
    "Panic": ("Panic", "Pánico"),
    "Sick": ("Sick", "Enfermedad"),
    "Stress": ("Stress", "Estrés"),
    "Thirst": ("Thirst", "Sed"),
    "Tired": ("Tired", "Cansancio"),
    "Uncomfortable": ("Uncomfortable", "Incomodidad"),
    "Unhappy": ("Unhappy", "Infelicidad"),
    "Wet": ("Wet", "Humedad"),
    "Windchill": ("Windchill", "Sensación térmica"),
    "Zombie": ("Zombie", "Zombificación"),
}


def moodle_name(mid):
    """
    (en, es) de un moodle, de `MOODLE_NAMES`. Uno que sume un parche y todavía no esté en la tabla va con el tipo
    partido en palabras (HasACold → "Has A Cold") y sin español, que el índice llena con el inglés; el test de la
    pestaña Moodles (`site/test/zomboidMoodles.test.ts`) pide los dos nombres y su consejo, así que no pasa inadvertido.
    """
    if mid in MOODLE_NAMES:
        return MOODLE_NAMES[mid]
    return re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", mid), ""


def site_index(items, recipes, traits, professions, skills, moodles):
    """
    Las fichas del sitio: `[{sec, id, en, es, ref}]`, de donde salen las direcciones, el sitemap y el `<head>` de cada
    una (y sus slugs en español, que arma `site/src/esSlugs.ts`). `id` es el slug del nombre en inglés; `ref`, los ids
    del juego que muestra la ficha.

    - Objetos: una ficha por nombre en inglés. En la 42.21 hay 4.880 objetos y 3.826 nombres (55 "Paperback", uno
      por género; 18 "Duffel Bag", vacíos o ya llenos; dos "Crowbar", la de fábrica y la forjada): quien busca
      "crowbar" llega a una página, y la ficha muestra las variantes. `ref` lleva todos, en orden, y `es` es el del
      primero.
    - Recetas (las de fabricar y las de construir), rasgos, profesiones, habilidades y moodles: una ficha por cada uno.
    - Servidor: las dos subpáginas de `SERVER_PAGES`, escritas a mano.
    - El rasgo de profesión que tiene un gemelo que se elige (Herrería, Cocinar…: mismo nombre, misma descripción)
      lleva además `via`, {en, es} con los nombres de las profesiones que lo traen: su <head> lo dice, y así no es
      igual al del otro.
    - Dos fichas de una sección con el mismo slug llevan las dos `-<slug del id>` ("Brew Coffee" en taza y en taza de
      té): ninguna se queda con la dirección corta, que no diría cuál es.
    - Sin español, va el inglés: el `<head>` en español lleva un nombre y no un hueco.

    Ordenado por sección (en el orden de INDEX_SECS) y después por id: el mismo juego da el mismo archivo.
    """
    names = {sec: [] for sec in INDEX_SECS}  # sección → [(en, es, ref)]
    by_en = defaultdict(list)
    for iid in sorted(items):
        by_en[items[iid]["name"]["en"]].append(iid)
    for en, ids in by_en.items():
        names["items"].append((en, items[ids[0]]["name"]["es"], ids))
    for r in recipes:
        names["recipes"].append((r["name"]["en"], r["name"]["es"], [r["id"]]))
    prof_names = {p["id"]: p["name"] for p in professions}
    via = {}
    for t in traits:
        names["traits"].append((t["name"]["en"], t["name"]["es"], [t["id"]]))
        # El gemelo de profesión (ver build_traits): de qué profesiones viene, para que su <head> no sea igual al del
        # que se elige.
        if t.get("twin") and t["professionOnly"] and t.get("professions"):
            ps = [prof_names[p] for p in t["professions"] if p in prof_names]
            via[t["id"]] = {"en": [p["en"] for p in ps], "es": [p["es"] or p["en"] for p in ps]}
    for p in professions:
        names["professions"].append((p["name"]["en"], p["name"]["es"], [p["id"]]))
    for perk, name in skills.items():
        names["skills"].append((name["en"], name["es"], [perk]))
    for m in moodles:
        names["moodles"].append((*moodle_name(m["id"]), [m["id"]]))
    for en, es in SERVER_PAGES:
        names["server"].append((en, es, []))

    out = []
    for sec in INDEX_SECS:
        for en, _, ref in names[sec]:
            if not slugify(en):
                raise SystemExit(
                    f"La ficha {sec}/{ref[0] if ref else en} se llama \"{en}\" en inglés, que no tiene ni letras ni números: no le "
                    "puedo armar una dirección. No se escribió nada: hay que darle un nombre a mano en site_index().")
        uses = Counter(slugify(en) for en, _, _ in names[sec])
        taken = {}
        for en, es, ref in names[sec]:
            base = slugify(en)
            slug = base if uses[base] == 1 else f"{base}-{slugify(ref[0] if ref else en)}"
            # Con el id sumado no debería repetirse nunca; si pasa, se corta antes que publicar dos fichas en una
            # dirección.
            if slug in taken:
                raise SystemExit(
                    f"Dos fichas de {sec} dan la misma dirección \"{slug}\": {taken[slug]} y {ref[0] if ref else en}. "
                    "No se escribió nada: hay que desempatarlas en site_index().")
            taken[slug] = ref[0] if ref else en
            entry = {"sec": sec, "id": slug, "en": en, "es": es or en, "ref": ref}
            if sec == "traits" and ref[0] in via:
                entry["via"] = via[ref[0]]
            out.append(entry)
    order = {sec: i for i, sec in enumerate(INDEX_SECS)}
    out.sort(key=lambda e: (order[e["sec"]], e["id"]))
    return out


# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------

def dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def main():
    # Los avisos y cortes llevan tildes: que lleguen bien aunque se redirijan. `backslashreplace` para que una ruta rara
    # (un nombre de archivo que no es UTF-8 válido) salga escapada en vez de tirar otro error encima del corte; y el
    # `hasattr`, porque quien corre esto puede haber cambiado sys.stderr por algo sin `reconfigure`.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    if not os.path.isdir(MEDIA):
        raise SystemExit(f"No encuentro el juego en {GAME_DIR} (definí PZ_DIR)")
    # La versión va antes que todo: si no se lee, no se extrae nada. Datos de la 42.22 rotulados
    # "42.21" (la versión que quedó en meta.json) son peores que no extraer: el sitio los mostraría
    # con la fecha y el número de un parche que ya no es.
    version = game_version()
    if version is None:
        raise SystemExit(
            f"No pude leer la versión del juego: no encuentro {os.path.join(GAME_DIR, 'projectzomboid.jar')}, "
            "o no trae zombie/core/Core.class, o el parche cambió cómo se arma GameVersion. "
            "No se extrajo nada y se dejó todo como estaba. Si el juego está en otra carpeta, "
            "pasala con la variable PZ_DIR (PZ_DIR=D:/ruta/ProjectZomboid python games/zomboid/tools/extract.py).")
    # La tabla de XP, los multiplicadores de bonificación y el nivel inicial salen del bytecode, como la versión: si un
    # parche cambia ese código, se corta acá, antes de leer nada más.
    perks = perk_factory()
    boost_rules, boost_excluded = xp_boost_rules()
    starts, boost_cap = start_levels()
    # El build de Steam, en cambio, no corta: una copia del juego fuera de Steam es válida.
    build = steam_build()
    if build is None:
        print(f"AVISO: no encontré steamapps/appmanifest_{APP_ID}.acf junto a {GAME_DIR} (¿el juego está fuera de Steam?): "
              "`build` queda en null en meta.json.", file=sys.stderr)
    scripts = load_scripts()
    T = Texts()
    icons = Icons()

    items, excluded, item_dups, unknown = build_items(scripts, T, icons)
    traits = build_traits(scripts, T, icons)
    professions = build_professions(scripts, T, icons, traits)
    recipes, recipe_names, benches, sources, unresolved, recipe_dups, debug_recipes, resolve = build_recipes(
        scripts, T, items, traits, professions, icons)
    evolved = build_evolved(scripts, T, items)
    # Resultados de recetas evolutivas sin nombre propio (HotDrinkCopper, FruitSaladClay):
    # el juego los nombra al cocinar. Llevan el del resultado de otra receta con el mismo
    # Template (HotDrink → "Hot Drink"), que es lo que se ve en el inventario.
    for r in evolved["recipes"]:
        res = r["resultItem"]
        if res in items and res in T.missing_en:
            donor = next((o["resultItem"] for o in evolved["recipes"] if o["template"] == r["template"]
                          and o["resultItem"] in items and o["resultItem"] not in T.missing_en), None)
            if donor:
                items[res]["name"] = dict(items[donor]["name"])
                T.missing_en.discard(res)
                T.missing_es.discard(res)
    fixing = build_fixing(scripts)
    moodles = build_moodles(T, icons)

    # Si una receta acepta un ítem de prueba (el balde de agua de debug), esa
    # alternativa se saca: el sitio no tiene ficha para mostrarla.
    left_out = {f"{b.file.split('|')[0]}.{b.name}" for b in scripts["item"]} - set(items)
    for r in recipes:
        for io_ in r["inputs"] + r.get("outputs", []):
            if "items" in io_:
                io_["items"] = [x for x in io_["items"] if x not in left_out]
                for x in list(io_.get("counts", {})):
                    if x in left_out:
                        del io_["counts"][x]

    # Tags: qué ítems cumple cada uno (sólo ítems publicados).
    tags = defaultdict(list)
    for iid, it in items.items():
        for t in it["tags"]:
            tags[t].append(iid)
    tags = {t: sorted(v) for t, v in sorted(tags.items())}

    # Habilidades nombradas en algún lado.
    used = set()
    for r in recipes:
        used |= set(r.get("skills", {})) | set(r.get("xp", {}))
        for k in ("autoLearnAll", "autoLearnAny"):
            used |= set(r.get("learn", {}).get(k, {}))
    for t in traits + professions:
        used |= set(t["xpBoosts"])
    for it in items.values():
        s = it.get("stats", {})
        if "skillTrained" in s:
            used.add(s["skillTrained"])
    for f in fixing:
        for fx in f["fixers"]:
            used |= set(fx.get("skills", {}))
    skills, boost_general = build_skills(T, perks, used, starts, boost_rules, boost_excluded, boost_cap)
    # Los multiplicadores de los rasgos (Aprendiz rápido, lento, Pacifista, Ingenioso) van en cada rasgo: a qué
    # habilidades se aplican (las de skills.json) y cuánto multiplican. Se leen del mismo AddXP que la bonificación.
    trait_mults = xp_trait_multipliers({k: s["cat"]["id"] for k, s in skills.items()}, {t["id"] for t in traits},
                                       boost_excluded)
    for t in traits:
        if t["id"] in trait_mults:
            t["xpMult"] = trait_mults[t["id"]]
    media, media_left = build_media(T, skills)
    media_cutoff = media_xp_cutoff()
    start_minute = game_start_minute()
    # La TV va en el mismo media.json que los VHS (kind "tv"): la XP sale de los mismos códigos y el sitio la lista en
    # la misma habilidad. Lo que no se entiende se anota en el mismo `media_left`.
    tv = build_tv(skills, media_left, start_minute)
    media += tv
    # Reglas del juego que van en meta.json y no en un archivo propio: son pocas y valen para todas las habilidades.
    # `boostCap` es el nivel de bonificación más alto que guarda el juego (`Math.min(3, nivel)` en applyTraits): "3" en
    # `boostMultipliers` vale para "3 o más", y el planificador recorta con este número en vez de tenerlo escrito.
    # `gameStartMinute` es la hora de arranque de una partida nueva (ver game_start_minute): la ficha la nombra al lado
    # del programa de TV del día 1 que termina antes.
    rules = {"boostMultipliers": boost_general, "boostCap": boost_cap, "mediaXpCutoff": media_cutoff,
             "gameStartMinute": start_minute}

    # Categorías de ítem con su nombre (IGUI_ItemCat_<DisplayCategory>).
    cats = {}
    for it in items.values():
        c = it["displayCategory"]
        if c and c not in cats:
            cats[c] = T.get("IGUI_ItemCat_" + c, fallback=c)

    # Qué recetas enseñan los ítems (libros, revistas), los rasgos y las profesiones, ya
    # resueltas: un saber compartido (base:kitchentools) se abre en sus recetas; lo que
    # no es receta (saber de cultivo, mecánica de autos) queda tal cual.
    def expand(refs):
        out = []
        for x in refs:
            out += [r for r in resolve(x) if r not in out]
        return out

    for it in items.values():
        for key in ("teaches", "research", "opens"):
            if key in it:
                it[key] = expand(it[key])
    recipe_ids = {r["id"] for r in recipes}
    for coll in (traits, professions):
        for t in coll:
            t["recipes"] = expand(t["recipes"])
            # Lo que sabe y no es una receta con ficha (las temporadas de cultivo, la mecánica de autos, los
            # generadores, los remedios herbales): con su nombre, para mostrarlo como texto en la ficha.
            knows = [knowledge_name(x, T) for x in t["recipes"] if x not in recipe_ids]
            if knows:
                t["knows"] = knows

    # Las fichas del sitio y el corte de íconos que se pisarían: los dos pueden cortar, así que van antes de escribir
    # nada (como la versión y los moodles).
    site = site_index(items, recipes, traits, professions, skills, moodles)
    icons.check_names()
    # La pestaña Servidor (server.py): también lee el bytecode y corta si un parche cambió la forma, así que va antes de
    # escribir nada. Se importa acá y no arriba porque server.py importa de este archivo. Corriendo `python extract.py`
    # este módulo es `__main__`: se lo registra como `extract` para que server.py no lo cargue una segunda vez (con su
    # propia caché del .jar). Depende de dos cosas: que `import server` vaya después de esta línea, y que este archivo
    # no importe `server` arriba (se importaría antes del registro, con un `extract` aparte).
    sys.modules.setdefault("extract", sys.modules[__name__])
    import server
    server_info = {}
    server_data = server.build(server_info)

    # --- Archivos ---
    os.makedirs(os.path.join(DATA, "items"), exist_ok=True)
    # El índice lleva lo justo para listas, buscador y recetas; los tags están en
    # tags.json y en la ficha de cada tipo.
    index_fields = ("id", "name", "type", "displayCategory", "icon", "weight")
    by_type = defaultdict(list)
    for iid in sorted(items):
        by_type[items[iid]["type"] or "other"].append(items[iid])
    files = {
        "items.json": {"categories": cats,
                       "items": [{k: items[i][k] for k in index_fields} for i in sorted(items)]},
        "recipes.json": {**recipe_names, "recipes": recipes},
        "evolved.json": evolved,
        "fixing.json": fixing,
        "traits.json": traits,
        "professions.json": professions,
        "skills.json": skills,
        "media.json": media,
        "moodles.json": moodles,
        "tags.json": tags,
        # Entra en el hash como los demás: una ficha nueva o renombrada es una dirección nueva, y mueve `extractedAt`.
        "index.json": site,
        # Entra en el hash: un parche que cambie una opción, un preset o un rango de corte mueve `extractedAt`.
        "server.json": server_data,
    }
    for t, lst_ in by_type.items():
        files[f"items/{t}.json"] = lst_
    # La foto de esta versión y el diff contra la anterior (patches.py), antes de escribir: si el cambio es
    # sospechosamente masivo corta acá, sin dejar los datos a medias.
    import patches
    # Sólo la rama estable de Steam: datos y foto de la beta quedarían publicados como un parche que nunca salió.
    patches.branch_guard(patches.steam_branch(), accept=os.environ.get("PZ_ACEPTO_RAMA_BETA") == "1")
    estado, sid = patches.record(files, version, build, datetime.date.today().isoformat(),
                                 accept=os.environ.get("PZ_ACEPTO_CAMBIOS_MASIVOS") == "1")
    for old in glob.glob(os.path.join(DATA, "items", "*.json")):
        if os.path.relpath(old, DATA).replace(os.sep, "/") not in files:
            os.remove(old)

    h = hashlib.sha256()
    sizes, gz = {}, {}
    for name in sorted(files):
        body = dumps(files[name])
        h.update(name.encode() + b"\0" + body.encode("utf-8"))
        path = os.path.join(DATA, *name.split("/"))
        if not os.path.exists(path) or open(path, encoding="utf-8").read() != body:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(body)
        sizes[name] = len(body.encode("utf-8"))
        gz[name] = len(gzip.compress(body.encode("utf-8"), 9))
    icon_hash, n_icons, removed = icons.write()
    h.update(icon_hash.encode())
    # Las reglas van en meta.json, que no entra en el hash de arriba: se suman acá para que un parche que cambie un
    # multiplicador también mueva `extractedAt`.
    h.update(b"rules\0" + dumps(rules).encode("utf-8"))
    digest = h.hexdigest()

    meta_path = os.path.join(DATA, "meta.json")
    old = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            old = json.load(f)
    changed = old.get("dataHash") != digest
    skill_books = sum(1 for it in items.values() if "skillTrained" in it.get("stats", {}))
    magazines = sum(1 for it in items.values() if it["type"] == "literature" and it.get("teaches")
                    and it.get("stats", {}).get("readType") != "photo")
    counts = {
        "items": len(items),
        "recipes": sum(1 for r in recipes if r["kind"] == "craft"),
        "evolvedRecipes": len(evolved["recipes"]),
        "fixing": len(fixing),
        "traits": len(traits),
        "professions": len(professions),
        "skillBooks": skill_books,
        "magazines": magazines,
        "moodles": len(moodles),
        "buildRecipes": sum(1 for r in recipes if r["kind"] == "build"),
        "tags": len(tags),
        "icons": n_icons,
    }
    meta = dict(old)  # se conservan claves que agreguen otras herramientas (p. ej. el mapa)
    meta.update({
        "game": "Project Zomboid",
        "version": version,
        "build": build,  # null si el juego no es de Steam; no se arrastra el de la extracción anterior (otro parche)
        "extractedAt": datetime.date.today().isoformat() if changed or "extractedAt" not in old else old["extractedAt"],
        "counts": counts,
        "excluded": {"debugItems": sorted(excluded["debug"]), "hiddenItems": excluded["hidden"],
                     "genericItems": sorted(excluded["generic"]), "debugRecipes": sorted(debug_recipes)},
        # Cuánto multiplica la XP cada nivel de bonificación de profesión y rasgos ("0" = sin bonificación, "3" = 3 o
        # más), para toda habilidad que no traiga su propia tabla en skills.json (`boost`); el nivel de bonificación
        # más alto que guarda el juego (`boostCap`); y desde qué nivel los medios grabados dejan de dar XP. Ver
        # xp_boost_rules, start_levels y media_xp_cutoff.
        **rules,
        "dataHash": digest,
    })
    with open(meta_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    # --- Informe ---
    steam = f"Steam build {meta['build']}" if meta["build"] is not None else "sin build de Steam"
    print(f"Project Zomboid {meta['version']} ({steam}) · datos {'cambiaron' if changed else 'sin cambios'} ({meta['extractedAt']})")
    print("Cantidades:", json.dumps(counts, ensure_ascii=False))
    print("Fichas del sitio (index.json):", json.dumps(Counter(e["sec"] for e in site), ensure_ascii=False))
    print(server.report(server_data, server_info))
    print(patches.report(estado, sid))
    xp_tables = Counter(tuple(s["xp"]) for s in skills.values())
    print(f"Habilidades: {len(skills)}, {len(xp_tables)} tablas de XP distintas "
          f"({', '.join(f'{n}× de {sum(t)} en total' for t, n in xp_tables.most_common())}); nivel inicial "
          f"{ {k: v for k, v in starts.items()} }; multiplicadores generales {boost_general}, propios "
          f"{ {k: s['boost'] for k, s in skills.items() if 'boost' in s} }")
    print(f"Multiplicadores de rasgos (tope de bonificación {boost_cap}): "
          f"{ {tid: [(e['mult'], len(e['skills'])) for e in es] for tid, es in trait_mults.items()} } (×, habilidades)")
    print(f"Medios grabados que dan XP: {len(media)} ({dict(Counter(m['kind'] for m in media))}, "
          f"{sum(1 for m in media if m.get('shared'))} con líneas compartidas: XP máxima), hasta el nivel "
          f"{media_cutoff}; afuera: códigos de habilidades sin ficha {media_left['sin_habilidad']}, códigos desconocidos "
          f"{sorted(media_left['desconocidos'])}, categorías desconocidas {sorted(media_left['categorias'])}")
    tv_xp = defaultdict(float)
    for m in tv:
        for k, v in m["xp"].items():
            tv_xp[k] += v
    print(f"Programas de TV que dan XP: {len(tv)} emisiones, días {min((m['day'] for m in tv), default='-')} a "
          f"{max((m['day'] for m in tv), default='-')}; XP por habilidad {dict(tv_xp)}; antes del arranque "
          f"({start_minute} min): {[(m['day'], m['start'], m['xp']) for m in tv if m.get('beforeStart')]}")
    print(f"Excluidos: {len(excluded['debug'])} ítems de prueba {excluded['debug']}, {excluded['hidden']} ocultos, "
          f"{len(excluded['generic'])} genéricos {excluded['generic']}, {len(debug_recipes)} recetas debug {debug_recipes}")
    if item_dups:
        print(f"Ítems definidos dos veces (queda la última): {sorted(item_dups)}")
    if recipe_dups:
        print(f"Recetas definidas dos veces (queda la última): {sorted(recipe_dups)}")
    no_icon = sorted(i for i, it in items.items() if not it["icon"])
    print(f"Íconos escritos: {n_icons} ({removed} viejos borrados) · ítems sin ícono: {len(no_icon)} {no_icon[:15]}")
    print(f"Sin inglés (quedó el id): {len(T.missing_en)} {sorted(T.missing_en)[:10]}")
    print(f"Claves ES faltantes: {len(T.missing_es)} {sorted(T.missing_es)[:10]}")
    if unknown:
        print(f"Claves de ítem sin clasificar (ni STATS ni IGNORED): {dict(unknown.most_common())}")
    if unresolved:
        print(f"Referencias a recetas que no son craftRecipe ({len(unresolved)}): {sorted(unresolved)[:12]}…")
    all_tags = Counter(t for r in recipes for t in r.get("tags", []))
    not_station = sorted(t for t in all_tags if t not in RECIPE_FLAG_TAGS and t not in recipe_names["stations"])
    print(f"Tags de receta que no son estación ni bandera conocida: {not_station}")
    missing_tag_refs = sorted({t for r in recipes for i in r["inputs"] for t in i.get("tags", []) if t not in tags})
    print(f"Tags pedidos por recetas sin ningún ítem: {missing_tag_refs}")
    missing_items = sorted({x for r in recipes for i in r["inputs"] + r.get("outputs", [])
                            for x in (i.get("items", []) + ([i["item"]] if "item" in i else [])) if x not in items})
    print(f"Ítems nombrados en recetas que no están publicados ({len(missing_items)}): {missing_items[:20]}")
    total = sum(sizes.values())
    print("Tamaños (crudo / gzip):", ", ".join(f"{k} {v / 1024:.0f}/{gz[k] / 1024:.0f} KB" for k, v in sorted(sizes.items())),
          f"· total {total / 1e6:.2f} MB")
    for folder in ICON_FOLDERS:
        files_ = glob.glob(os.path.join(PUBLIC, folder, "*.webp"))
        print(f"  site/public/zomboid/{folder}: {len(files_)} íconos, {sum(map(os.path.getsize, files_)) / 1024:.0f} KB")

    # Los datos del sitio (listas y fichas de Objetos y Recetas, en data/site) salen de lo que se acaba de escribir: van
    # al final, para que un parche no deje el sitio armado con los datos del anterior. Se carga site.py por su ruta y no
    # con `import site`: `site` es un módulo de la biblioteca estándar que Python ya importó al arrancar, y el import
    # devolvería ése (además `site` ya es una variable de este main, la del índice).
    spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "site.py"))
    site_data = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(site_data)
    site_data.main()
    # El grafo de fabricación (data/craft.json) sale de lo mismo que las fichas de receta, así que va después de
    # site.py. Si loot.py ya corrió, suma dónde se encuentra cada cosa; si no, se arma sin eso.
    spec = importlib.util.spec_from_file_location("zomboid_craft", os.path.join(os.path.dirname(__file__), "craft.py"))
    craft = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(craft)
    craft.main()


if __name__ == "__main__":
    main()
