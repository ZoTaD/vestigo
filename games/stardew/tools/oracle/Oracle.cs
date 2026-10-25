// Oráculo del predictor de Stardew Valley.
//
// Qué hace: carga las DLL del juego instalado (1.6.15, .NET 6), arma el mínimo
// de estado que necesitan sus funciones aleatorias y llama a las funciones
// reales (`Utility.CreateRandomSeed`, `Utility.CreateDaySaveRandom`,
// `Utility.TryCreateIntervalRandom`, `System.Random`, el hash del juego, etc.).
// Los resultados se escriben como JSON y son los valores esperados de los tests
// del predictor (site/test/fixtures/stardew-predict/*.json).
//
// No va al sitio y no copia código del juego: sólo lo invoca desde afuera.
//
// Uso (ver oracle.sh): dotnet Oracle.dll <carpeta del juego> <comando> <salida.json>
//
// Para sumar un comando: escribir un método `static void CmdXxx(Utf8JsonWriter w)`
// y registrarlo en `Comandos`.
//
// Estado del juego que arma `ArmarJuego` para todos: hash, contenido sin
// texturas, datos, un `Farmer` en `Game1._player`, los tipos de `ItemRegistry`
// (`RegisterItemTypes`, que la carga cortada no llega a llamar),
// `Game1.otherFarmers` vacío (lo recorre `FarmerTeam.AverageDailyLuck`) y un
// `Game1.log` que corta con excepción ante cualquier error: `getTreasureFromGeode`
// traga sus excepciones y devuelve una piedra, y eso escribiría un fixture
// equivocado sin avisar.
//
// Además, por comando:
// - `geodes`: un `Farmer` nuevo por caso (stats, correo, `uniqueMultiplayerID`,
//   `fishingLevel`, `deepestMineLevel` y, cuando hace falta, un `SpecialOrder` en
//   curso con la regla `DROP_QI_BEANS` en `player.team.specialOrders`),
//   `Game1.uniqueIDForThisGame`, `Game1.UseLegacyRandom`, `Game1.season`,
//   `Game1.dayOfMonth` y `Game1.random` con semilla fija (sólo lo usa la cosecha
//   de baja calidad de las cajas, que el predictor no puede saber).
// - `cart`: por caso, `Game1.uniqueIDForThisGame`, `UseLegacyRandom`,
//   `stats.DaysPlayed`, `Game1.season`/`dayOfMonth`/`year`, un `Farmer` nuevo con
//   el correo de los cuartos del Centro Comunitario o de Joja (y `JojaMember`),
//   `friendshipData` con 3.500 puntos (14 corazones) para los que se piden,
//   `Game1.otherFarmers` con un granjero de más para el multijugador y
//   `netWorldState.VisitsUntilY1Guarantee` (con un `NetWorldState` nuevo si la
//   carga no lo armó). `ShopBuilder.GetShopStock("Traveler")` no pide una
//   `GameLocation`: arma su `ItemQueryContext` con `Game1.currentLocation`, que
//   queda en `null` (ninguna consulta del carro la lee). El contenido sin
//   texturas da texturas de 4096 x 4096 sin datos, porque el constructor de
//   `Furniture` divide por el ancho de la suya.
//   El calendario (`calendar`) usa `Forest.ShouldTravelingMerchantVisitToday`
//   (sobre un `Forest` sin construir: sólo lee `Game1.dayOfMonth`) y
//   `Utility.TryGetPassiveFestivalDataForDay` sin condiciones; la del Festival
//   del desierto (`LOCATION_ACCESSIBLE Desert`) se evalúa con
//   `Game1.isLocationAccessible`, porque la consulta busca la ubicación `Desert`,
//   que acá no existe.
// - `weather`, `mines` y `night` (`ArmarUbicaciones`): un `NetWorldState` (la
//   fecha se pone en `Game1` y se copia con su `UpdateFromGame1`, de donde sale
//   `Game1.Date`), `Game1.game1.xTileContent`, un `mapDisplayDevice` de xTile que
//   no dibuja (`DibujoNulo`), `Game1._onlineFarmers` y las ubicaciones Town, Beach,
//   Forest, Mountain, Desert y Farm armadas con el constructor vacío y su `mapPath`:
//   el contexto de cada una lo lee el juego de su mapa real (`GetLocationContextId`).
//   - `weather`: `LocationWeather.UpdateDailyWeather` real con un `Random` guionado
//     (`AzarGuionado`) que recorre las 256 respuestas posibles de las 8 primeras
//     tiradas (hacen falta 2 o 3): no hay que adivinar con semillas al azar.
//   - `mines`: `MineShaft.loadLevel` real (el mapa carga con las texturas vacías);
//     el Aceite de ajo se pone en `buffs.AppliedBuffIds`, que es lo que lee
//     `hasBuff` (`applyBuff` pide el HUD).
//   - `night`: `Utility.pickFarmEvent` real. Replicado a mano: lo que hacen los
//     eventos al correr (el mapache marca `raccoonTreeFallen`; el avión,
//     `sawQiPlane`) y el avión mismo, cuyo constructor mide la pantalla y tira sin
//     gráficos: si la excepción sale de `QiPlaneEvent..ctor`, ya fue elegido.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using StardewValley;
using StardewValley.Hashing;
using StardewValley.Constants;
using StardewValley.Extensions;
using StardewValley.Logging;
using StardewValley.SpecialOrders;

// El juego pide texturas al cargar; el oráculo no dibuja nada, así que se las
// damos sin inicializar y el resto de los datos se lee normal.
class ContenidoSinTexturas : LocalizedContentManager
{
    public ContenidoSinTexturas(IServiceProvider s, string raiz) : base(s, raiz) { }

    public override T LoadImpl<T>(string asset, string lang, LanguageCode code)
    {
        if (typeof(T) == typeof(Texture2D))
        {
            // Sin datos, pero con tamaño: `Furniture.InitializeAtTile` divide por el ancho.
            object t = RuntimeHelpers.GetUninitializedObject(typeof(T));
            for (var tipo = typeof(T); tipo != null; tipo = tipo.BaseType)
                foreach (var f in tipo.GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.DeclaredOnly))
                    if (f.FieldType == typeof(int) && (f.Name.Equals("width", StringComparison.OrdinalIgnoreCase) || f.Name.Equals("height", StringComparison.OrdinalIgnoreCase)))
                        f.SetValue(t, 4096);
            return (T)t;
        }
        return base.LoadImpl<T>(asset, lang, code);
    }
}

// Un dispositivo de dibujo de xTile que no hace nada (los mapas lo piden al cargar).
public class DibujoNulo : DispatchProxy
{
    protected override object Invoke(MethodInfo m, object[] args) =>
        m.ReturnType.IsValueType && m.ReturnType != typeof(void) ? Activator.CreateInstance(m.ReturnType) : null;
}

// Registro del juego que no tolera errores (ver la cabecera).
class RegistroEstricto : IGameLogger
{
    public void Verbose(string m) { }
    public void Debug(string m) { }
    public void Info(string m) { }
    public void Warn(string m) => Console.Error.WriteLine("aviso del juego: " + m);
    public void Error(string m, Exception ex = null) => throw new Exception("error del juego: " + m, ex);
}

static class Oracle
{
    static string Juego;

    // Un comando por entrada: nombre -> método que escribe el JSON de salida.
    static readonly Dictionary<string, Action<Utf8JsonWriter>> Comandos = new()
    {
        ["rng"] = CmdRng,
        ["geodes"] = CmdGeodes,
        ["cart"] = CmdCart,
        ["weather"] = CmdWeather,
        ["mines"] = CmdMines,
        ["night"] = CmdNight,
    };

    static int Main(string[] args)
    {
        if (args.Length < 3 || !Comandos.ContainsKey(args[1]))
        {
            Console.Error.WriteLine("uso: Oracle.dll <carpeta del juego> <comando> <salida.json>");
            Console.Error.WriteLine("comandos: " + string.Join(", ", Comandos.Keys));
            return 2;
        }
        Juego = args[0];
        AppDomain.CurrentDomain.AssemblyResolve += (_, e) =>
        {
            string dll = Path.Combine(Juego, new AssemblyName(e.Name).Name + ".dll");
            return File.Exists(dll) ? Assembly.LoadFrom(dll) : null;
        };
        return Correr(args[1], args[2]);
    }

    // Va aparte de Main para que el JIT no cargue las DLL del juego antes de
    // enganchar AssemblyResolve.
    [MethodImpl(MethodImplOptions.NoInlining)]
    static int Correr(string comando, string salida)
    {
        ArmarJuego();
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(salida)));
        using var fs = File.Create(salida);
        using var w = new Utf8JsonWriter(fs, new JsonWriterOptions { Indented = true });
        w.WriteStartObject();
        Comandos[comando](w);
        w.WriteEndObject();
        w.Flush();
        fs.WriteByte(10); // salto de línea final
        Console.WriteLine(comando + " -> " + salida);
        return 0;
    }

    // Deja a `Game1` en un estado en el que las funciones de datos y de azar
    // andan sin abrir una ventana: hash, contenido, datos cargados y un granjero.
    static void ArmarJuego()
    {
        // El juego corre con la cultura invariante (`Game1` la fija en cada hilo): sin
        // esto, en una máquina en español `float.TryParse(".05")` falla y las
        // consultas `RANDOM .05` del carro dan error.
        System.Threading.Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
        Game1.hash = new HashUtility();
        Game1.content = new ContenidoSinTexturas(new GameServiceContainer(), Path.Combine(Juego, "Content"));
        Game1.game1 = (Game1)RuntimeHelpers.GetUninitializedObject(typeof(Game1));
        Game1.game1._locations = new List<GameLocation>();
        // La carga normal termina en un paso que necesita gráficos y tira: para
        // entonces `objectData` y compañía ya están cargados (paso ~57).
        var carga = (IEnumerator<int>)typeof(Game1)
            .GetMethod("GetLoadContentEnumerator", BindingFlags.Instance | BindingFlags.NonPublic)
            .Invoke(Game1.game1, null);
        int pasos = 0;
        try { while (carga.MoveNext()) pasos++; }
        catch (Exception ex)
        {
            Console.Error.WriteLine("la carga se cortó en el paso " + pasos + ": " + ex.GetType().Name + ": " + ex.Message);
        }
        // Si la carga se cortó antes de tiempo (otra versión, otra carpeta), los
        // comandos que leen datos escribirían fixtures incompletos: se aborta.
        var faltan = new List<string>();
        if (Game1.objectData == null) faltan.Add("objectData");
        if (Game1.bigCraftableData == null) faltan.Add("bigCraftableData");
        if (Game1.cropData == null) faltan.Add("cropData");
        if (Game1.locationContextData == null) faltan.Add("locationContextData");
        if (faltan.Count > 0)
        {
            Console.Error.WriteLine("faltan datos del juego tras " + pasos + " pasos: " + string.Join(", ", faltan));
            Environment.Exit(3);
        }
        typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, new Farmer());
        typeof(Game1).GetField("log", BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, new RegistroEstricto());
        // `FarmerTeam.AverageDailyLuck` recorre a los demás granjeros (la semilla del mapache).
        Game1.otherFarmers ??= new Netcode.NetRootDictionary<long, Farmer>();
        // Los tipos de objeto de `ItemRegistry` los registra un paso posterior de la carga.
        if (ItemRegistry.ItemTypes.Count == 0)
            typeof(ItemRegistry).GetMethod("RegisterItemTypes", BindingFlags.Static | BindingFlags.NonPublic).Invoke(null, null);
    }

    // ---------------------------------------------------------------- ayudas

    static string R(double d) => d.ToString("R", CultureInfo.InvariantCulture);

    static void Ints(Utf8JsonWriter w, string nombre, IEnumerable<int> xs)
    {
        w.WriteStartArray(nombre);
        foreach (var x in xs) w.WriteNumberValue(x);
        w.WriteEndArray();
    }

    static void Dobles(Utf8JsonWriter w, string nombre, IEnumerable<double> xs)
    {
        w.WriteStartArray(nombre);
        foreach (var x in xs) w.WriteStringValue(R(x));
        w.WriteEndArray();
    }

    // Una muestra corta de un Random ya sembrado: sirve para comparar la semilla
    // entera sin guardar la semilla en sí.
    static void Muestra(Utf8JsonWriter w, Random r)
    {
        w.WriteNumber("next", r.Next());
        w.WriteNumber("nextMax", r.Next(100));
        w.WriteString("nextDouble", R(r.NextDouble()));
    }

    static void PonerPartida(ulong gameId, uint diasJugados, bool legacy)
    {
        Game1.uniqueIDForThisGame = gameId;
        Game1.stats.DaysPlayed = diasJugados;
        Game1.UseLegacyRandom = legacy;
    }

    // -------------------------------------------------------------- comandos

    // Núcleo aleatorio: System.Random sembrado, hash del juego y semillas.
    static void CmdRng(Utf8JsonWriter w)
    {
        // new Random(semilla)
        int[] semillas = { 0, 1, -1, 2, 42, 12345, -12345, 987654321, 452435081, int.MaxValue, int.MinValue + 1, int.MinValue };
        var rangos = new (int min, int max)[] { (-100, 101), (1, 10), (0, int.MaxValue), (int.MinValue, int.MaxValue) };
        w.WriteStartArray("random");
        foreach (int s in semillas)
        {
            w.WriteStartObject();
            w.WriteNumber("seed", s);
            var r = new Random(s);
            var nexts = new List<int>(); for (int i = 0; i < 20; i++) nexts.Add(r.Next());
            Ints(w, "next", nexts);
            r = new Random(s);
            var dobles = new List<double>(); for (int i = 0; i < 20; i++) dobles.Add(r.NextDouble());
            Dobles(w, "doubles", dobles);
            // Next(max) con tope chico y con tope grande.
            r = new Random(s);
            var maxs = new List<int>(); for (int i = 0; i < 10; i++) maxs.Add(r.Next(i % 2 == 0 ? 6 : 1000000));
            Ints(w, "nextMax", maxs);
            w.WriteStartArray("ranges");
            foreach (var (min, max) in rangos)
            {
                r = new Random(s);
                var vs = new List<int>(); for (int i = 0; i < 10; i++) vs.Add(r.Next(min, max));
                w.WriteStartObject();
                w.WriteNumber("min", min);
                w.WriteNumber("max", max);
                Ints(w, "values", vs);
                w.WriteEndObject();
            }
            w.WriteEndArray();
            w.WriteEndObject();
        }
        w.WriteEndArray();

        // HashUtility.GetDeterministicHashCode(string)
        string[] textos =
        {
            "", "location_weather", "summer_rain_chance", "ñandú", "spring1", "year2", "a",
            "abcdefghijklmnop", "The quick brown fox jumps over the lazy dog", "日本語😀",
        };
        w.WriteStartArray("hashStrings");
        foreach (var t in textos)
        {
            w.WriteStartObject();
            w.WriteString("text", t);
            w.WriteNumber("hash", Game1.hash.GetDeterministicHashCode(t));
            w.WriteEndObject();
        }
        w.WriteEndArray();

        // HashUtility.GetDeterministicHashCode(params int[])
        int[][] listas =
        {
            new int[0], new[] { 0 }, new[] { -1 }, new[] { 1, 2, 3 },
            new[] { int.MaxValue, int.MinValue }, new[] { 452435081, 226217540, 0, 0, 0 }, new[] { 1, 2, 3, 4, 5, 6, 7 },
        };
        w.WriteStartArray("hashInts");
        foreach (var l in listas)
        {
            w.WriteStartObject();
            Ints(w, "values", l);
            w.WriteNumber("hash", Game1.hash.GetDeterministicHashCode(l));
            w.WriteEndObject();
        }
        w.WriteEndArray();

        // Utility.CreateRandomSeed, con y sin aleatoriedad "legacy".
        double[][] quintuplas =
        {
            new double[] { 0, 0, 0, 0, 0 }, new double[] { 1, 2, 3, 4, 5 }, new double[] { 452435081, 2, 0, 0, 0 },
            new double[] { 226217540.5, 100, 0, 0, 0 }, new double[] { 1, 226217540, 400, 0, 0 },
            new double[] { -1, -2, -3, -4, -5 }, new double[] { -7.9, 3.99, 0, 0, 0 },
            new double[] { 2147483646, 2147483647, 2147483648, 0, 0 }, new double[] { 2147483648, 1, 0, 0, 0 },
            new double[] { 4294967295, 4294967296, 0, 0, 0 }, new double[] { 6000000000, 3000000000.5, 1, 0, 0 },
            new double[] { -3000000000, 5, 0, 0, 0 }, new double[] { 112, 12345, 777, 0, 0 },
            new double[] { 1000000, 2000000, 3000000, 4000000, 5000000 }, new double[] { 0.5, 0.25, 0.125, 0, 0 },
            new double[] { 2147483647, 0, 0, 0, 0 }, new double[] { 99999999999, 88888888888, 0, 0, 0 },
            new double[] { 31, 1234567, 3000, 77, 9 }, new double[] { 1234567890, 1234567890, 1234567890, 1234567890, 1234567890 },
            new double[] { -2147483648, -2147483649, 0, 0, 0 },
        };
        w.WriteStartArray("seeds");
        foreach (var q in quintuplas)
        {
            w.WriteStartObject();
            w.WriteStartArray("args"); foreach (var x in q) w.WriteNumberValue(x); w.WriteEndArray();
            Game1.UseLegacyRandom = false;
            w.WriteNumber("modern", Utility.CreateRandomSeed(q[0], q[1], q[2], q[3], q[4]));
            Game1.UseLegacyRandom = true;
            w.WriteNumber("legacy", Utility.CreateRandomSeed(q[0], q[1], q[2], q[3], q[4]));
            w.WriteEndObject();
        }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;

        // Utility.CreateDaySaveRandom (id de partida, día jugado y extras).
        var dias = new (ulong id, uint dias, double a, double b, double c)[]
        {
            (452435081, 1, 0, 0, 0), (452435081, 57, 100, 0, 0), (452435081, 340, 4000, 12, 777),
            (1, 1, 0, 0, 0), (0, 5, 3, 2, 1), (4294967295, 112, 119 * 100, 0, 0), (123456789012, 28, 55, 66, 77),
        };
        w.WriteStartArray("daySave");
        foreach (var d in dias)
            foreach (bool legacy in new[] { false, true })
            {
                PonerPartida(d.id, d.dias, legacy);
                w.WriteStartObject();
                w.WriteNumber("gameId", d.id);
                w.WriteBoolean("legacy", legacy);
                w.WriteNumber("daysPlayed", d.dias);
                w.WriteNumber("a", d.a); w.WriteNumber("b", d.b); w.WriteNumber("c", d.c);
                Muestra(w, Utility.CreateDaySaveRandom(d.a, d.b, d.c));
                w.WriteEndObject();
            }
        w.WriteEndArray();

        // Utility.TryCreateIntervalRandom ("day" / "season" / "year").
        var intervalos = new (string intervalo, string clave, ulong id, uint dias, string estacion, int anio)[]
        {
            ("day", "location_weather", 452435081, 57, "summer", 1),
            ("day", "summer_rain_chance", 452435081, 58, "summer", 1),
            ("season", "location_weather", 452435081, 57, "summer", 1),
            ("season", "location_weather", 452435081, 85, "fall", 1),
            ("season", "other", 4294967295, 200, "winter", 2),
            ("year", "location_weather", 452435081, 57, "summer", 1),
            ("year", "x", 7, 400, "spring", 4),
            ("day", "", 123456789012, 1, "spring", 1),
        };
        w.WriteStartArray("interval");
        foreach (var i in intervalos)
            foreach (bool legacy in new[] { false, true })
            {
                PonerPartida(i.id, i.dias, legacy);
                Game1.currentSeason = i.estacion;
                Game1.year = i.anio;
                if (!Utility.TryCreateIntervalRandom(i.intervalo, i.clave, out var r, out var error))
                    throw new Exception(error);
                w.WriteStartObject();
                w.WriteString("interval", i.intervalo);
                w.WriteString("key", i.clave);
                w.WriteNumber("gameId", i.id);
                w.WriteBoolean("legacy", legacy);
                w.WriteNumber("daysPlayed", i.dias);
                w.WriteString("season", i.estacion);
                w.WriteNumber("year", i.anio);
                Muestra(w, r);
                w.WriteEndObject();
            }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;
    }

    // Un caso de `geodes`: el estado de entrada y cuántas aperturas seguidas.
    class CasoGeoda
    {
        public string Kind;
        public uint Geodas, Cajas, Maestria;
        public bool Artefacto, Sombrero, Libro, Qi, Coco = true;
        public int Hondo, Pesca, Estacion, Dia = 1, Veces = 20;
        public CasoGeoda Con(Action<CasoGeoda> f) { var c = (CasoGeoda)MemberwiseClone(); f(c); return c; }
    }

    static List<CasoGeoda> CasosGeodas(bool largos)
    {
        var casos = new List<CasoGeoda>();
        uint[] geodas = { 0, 15, 16, 200 };
        uint[] cajas = { 0, 10, 11, 60 };
        foreach (var kind in new[] { "535", "536", "537", "749" })
        {
            foreach (var g in geodas)
                foreach (var art in new[] { false, true })
                    foreach (var hondo in new[] { 0, 80 })
                        casos.Add(new CasoGeoda { Kind = kind, Geodas = g, Artefacto = art, Hondo = hondo });
            casos.Add(new CasoGeoda { Kind = kind, Geodas = 0, Artefacto = true, Hondo = 80, Qi = true });
            casos.Add(new CasoGeoda { Kind = kind, Geodas = 16, Artefacto = false, Qi = true });
        }
        foreach (var g in geodas)
            foreach (var art in new[] { false, true })
                casos.Add(new CasoGeoda { Kind = "275", Geodas = g, Artefacto = art });
        foreach (var g in geodas)
            foreach (var art in new[] { false, true })
                foreach (var hat in new[] { false, true })
                    casos.Add(new CasoGeoda { Kind = "791", Geodas = g, Artefacto = art, Sombrero = hat });
        casos.Add(new CasoGeoda { Kind = "791", Geodas = 0, Coco = false });
        casos.Add(new CasoGeoda { Kind = "791", Geodas = 15, Coco = false, Sombrero = true, Artefacto = true });
        foreach (var kind in new[] { "MysteryBox", "GoldenMysteryBox" })
        {
            foreach (var b in cajas)
                foreach (var est in new[] { 0, 3 })
                    foreach (var pesca in new[] { 0, 6 })
                        foreach (var art in new[] { false, true })
                            casos.Add(new CasoGeoda { Kind = kind, Geodas = 15, Cajas = b, Estacion = est, Pesca = pesca, Artefacto = art });
            var b0 = new CasoGeoda { Kind = kind, Geodas = 15, Artefacto = true };
            casos.Add(b0.Con(c => { c.Cajas = 11; c.Libro = true; }));
            casos.Add(b0.Con(c => { c.Cajas = 60; c.Libro = true; c.Estacion = 2; }));
            casos.Add(b0.Con(c => { c.Cajas = 0; c.Maestria = 1; }));
            casos.Add(b0.Con(c => { c.Cajas = 60; c.Maestria = 3; c.Estacion = 1; }));
            casos.Add(b0.Con(c => { c.Cajas = 11; c.Dia = 25; }));
            casos.Add(b0.Con(c => { c.Cajas = 11; c.Dia = 25; c.Estacion = 3; }));
            casos.Add(b0.Con(c => { c.Cajas = 60; c.Dia = 21; c.Estacion = 1; c.Qi = true; }));
        }
        if (largos)
        {
            // Tiradas largas para pasar por las ramas raras (prisma 0,008, sombrero 0,05,
            // galleta de oro 0,005 con maestría, libro, anillos...).
            casos.Add(new CasoGeoda { Kind = "749", Geodas = 0, Veces = 400 });
            casos.Add(new CasoGeoda { Kind = "791", Geodas = 0, Veces = 200 });
            casos.Add(new CasoGeoda { Kind = "275", Geodas = 0, Veces = 100 });
            casos.Add(new CasoGeoda { Kind = "MysteryBox", Cajas = 0, Pesca = 6, Veces = 400 });
            casos.Add(new CasoGeoda { Kind = "GoldenMysteryBox", Cajas = 0, Pesca = 6, Maestria = 1, Veces = 600 });
            casos.Add(new CasoGeoda { Kind = "GoldenMysteryBox", Cajas = 0, Estacion = 3, Dia = 22, Veces = 300 });
        }
        return casos;
    }

    // Geodas y cajas misteriosas en el yunque de Clint. Por cada caso arma un
    // granjero con el estado de entrada y repite el flujo de `GeodeMenu`:
    //   1. `GeodeMenu.update`: `GeodesCracked++` (y `MysteryBoxesOpened` en las cajas)
    //      antes de tirar;
    //   2. el primer coco dorado de la partida da una nuez (`geodeTreasureOverride`
    //      de `GeodeMenu.receiveLeftClick`, con `netWorldState.GoldenCoconutCracked`:
    //      acá es una variable local);
    //   3. si no, el `Utility.getTreasureFromGeode` real;
    //   4. el cambio por 5 piedras (`Arch` sin el correo `artifactFound`, salvo el
    //      cofre de artefactos), copiado de `GeodeMenu.update`;
    //   5. lo que hace `Farmer.OnItemReceived` al recibirlo y cambia las tiradas
    //      siguientes: `SetFlagOnPickup` (con el `Game1.addMail` real), minerales con
    //      el `foundMineral` real y artefactos como `foundArtifact` (sólo su correo
    //      `artifactFound`: el método real muestra el objeto en pantalla y no anda sin
    //      gráficos).
    static void CmdGeodes(Utf8JsonWriter w)
    {
        var partidas = new (ulong id, long uid, bool legacy)[]
        {
            (452435081, -6368268736843601728, false), // Zotafarm
            (390176213, 6932267015257027425, false), // TestSave
            (177904899, 4294967293, true), // legacy; los 32 bits bajos del uid son -3
        };
        var campoJugador = typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic);
        // `Game1.objectData` en su orden: el predictor asume el mismo que predict.json.
        w.WriteStartArray("objectOrder");
        foreach (var k in Game1.objectData.Keys) w.WriteStringValue(k);
        w.WriteEndArray();
        w.WriteStartArray("cases");
        for (int pi = 0; pi < partidas.Length; pi++)
        {
            var p = partidas[pi];
            foreach (var c in CasosGeodas(pi == 0))
            {
                var f = new Farmer();
                campoJugador.SetValue(null, f);
                Game1.uniqueIDForThisGame = p.id;
                Game1.UseLegacyRandom = p.legacy;
                Game1.season = (Season)c.Estacion;
                Game1.dayOfMonth = c.Dia;
                Game1.random = new Random(7);
                f.uniqueMultiplayerID.Value = p.uid;
                f.stats.GeodesCracked = c.Geodas;
                f.stats.Set("MysteryBoxesOpened", c.Cajas);
                if (c.Maestria > 0) f.stats.Set(StatKeys.Mastery(0), c.Maestria);
                f.deepestMineLevel = c.Hondo;
                f.fishingLevel.Value = c.Pesca;
                var correo = new List<string>();
                if (c.Artefacto) correo.Add("artifactFound");
                if (c.Sombrero) correo.Add("goldenCoconutHat");
                if (c.Libro) correo.Add("GotMysteryBook");
                foreach (var m in correo) f.mailReceived.Add(m);
                if (c.Qi)
                {
                    var encargo = new SpecialOrder();
                    encargo.questState.Value = SpecialOrderStatus.InProgress;
                    encargo.specialRule.Value = "QI_BEANS, DROP_QI_BEANS";
                    f.team.specialOrders.Add(encargo);
                }
                bool cocoAbierto = c.Coco;

                w.WriteStartObject();
                w.WriteString("kind", c.Kind);
                w.WriteNumber("gameId", p.id);
                w.WriteBoolean("legacy", p.legacy);
                w.WriteString("uid", p.uid.ToString(CultureInfo.InvariantCulture));
                w.WriteNumber("uidHalf", (int)f.uniqueMultiplayerID.Value / 2);
                w.WriteNumber("geodesCracked", c.Geodas);
                w.WriteNumber("mysteryBoxesOpened", c.Cajas);
                w.WriteNumber("deepestMineLevel", c.Hondo);
                w.WriteNumber("fishingLevel", c.Pesca);
                w.WriteNumber("season", c.Estacion);
                w.WriteNumber("day", c.Dia);
                w.WriteStartArray("mail"); foreach (var m in correo) w.WriteStringValue(m); w.WriteEndArray();
                w.WriteNumber("mastery0", c.Maestria);
                w.WriteBoolean("qiBeans", c.Qi);
                w.WriteBoolean("goldenCoconutCracked", c.Coco);
                w.WriteNumber("count", c.Veces);
                w.WriteStartArray("drops");
                var geoda = ItemRegistry.Create("(O)" + c.Kind);
                bool caja = geoda.QualifiedItemId == "(O)MysteryBox" || geoda.QualifiedItemId == "(O)GoldenMysteryBox";
                for (int i = 0; i < c.Veces; i++)
                {
                    Game1.stats.GeodesCracked++;
                    if (caja) Game1.stats.Increment("MysteryBoxesOpened");
                    Item premio;
                    if (geoda.QualifiedItemId == "(O)791" && !cocoAbierto)
                        premio = ItemRegistry.Create("(O)73");
                    else
                        premio = Utility.getTreasureFromGeode(geoda);
                    if (geoda.QualifiedItemId != "(O)275" && !(premio is StardewValley.Object { Type: "Minerals" })
                        && premio is StardewValley.Object { Type: "Arch" } && !f.hasOrWillReceiveMail("artifactFound"))
                        premio = ItemRegistry.Create("(O)390", 5);
                    w.WriteStringValue(premio.QualifiedItemId + " " + premio.Stack.ToString(CultureInfo.InvariantCulture));
                    // Al recibirlo (Farmer.OnItemReceived).
                    if (premio.QualifiedItemId == "(O)73") cocoAbierto = true;
                    if (premio.SetFlagOnPickup != null) Game1.addMail(premio.SetFlagOnPickup, noLetter: true);
                    if (premio.HasTypeObject() && premio is StardewValley.Object o)
                    {
                        if (o.Category == -2 || o.Type == "Minerals") f.foundMineral(o.ItemId);
                        else if (o.Type == "Arch" && f.archaeologyFound.Length == 0) f.mailReceived.Add("artifactFound");
                    }
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;
        campoJugador.SetValue(null, new Farmer());
    }
    // Un estado del carro: lo que leen sus condiciones.
    class EstadoCarro
    {
        public int Y1 = -1;
        public bool Cc, Joja, Multi;
        public string[] Corazones = new string[0];
    }

    // Las variantes que se cruzan con algunas fechas (la base va en todas).
    static readonly EstadoCarro[] VariantesCarro =
    {
        new EstadoCarro { Y1 = 0, Cc = true, Multi = true, Corazones = new[] { "Abigail", "Krobus" } },
        new EstadoCarro { Y1 = 0, Joja = true, Corazones = new[] { "Sebastian", "Haley" } },
        new EstadoCarro { Y1 = 3, Cc = true, Corazones = new[] { "Penny", "Shane", "Maru", "Elliott", "Leah" } },
    };

    static readonly string[] CuartosCc = { "ccBoilerRoom", "ccCraftsRoom", "ccPantry", "ccFishTank", "ccVault", "ccBulletin" };
    static readonly string[] CuartosJoja = { "JojaMember", "jojaBoilerRoom", "jojaCraftsRoom", "jojaPantry", "jojaFishTank", "jojaVault" };

    // Los días de carro de un año: viernes y domingos en el bosque, el Mercado
    // nocturno y el Festival del desierto (si el desierto está abierto).
    static List<(Season s, int d, string kind)> DiasCarro(bool desierto)
    {
        var bosque = (StardewValley.Locations.Forest)RuntimeHelpers.GetUninitializedObject(typeof(StardewValley.Locations.Forest));
        var dias = new List<(Season, int, string)>();
        int diaGuardado = Game1.dayOfMonth;
        Season estacionGuardada = Game1.season;
        for (int s = 0; s < 4; s++)
            for (int d = 1; d <= 28; d++)
            {
                Game1.season = (Season)s;
                Game1.dayOfMonth = d;
                string kind = null;
                if (bosque.ShouldTravelingMerchantVisitToday()) kind = "cart";
                // Con otro día en `Game1`, mira los datos y no `ActivePassiveFestivals`.
                Game1.dayOfMonth = 0;
                if (Utility.TryGetPassiveFestivalDataForDay(d, (Season)s, null, out var id, out _, ignoreConditionsCheck: true))
                {
                    string otro = id == "NightMarket" ? "nightMarket" : id == "DesertFestival" && desierto ? "desertFestival" : null;
                    if (otro != null)
                    {
                        if (kind != null) throw new Exception("dos carros el mismo día");
                        kind = otro;
                    }
                }
                if (kind != null) dias.Add(((Season)s, d, kind));
            }
        Game1.dayOfMonth = diaGuardado;
        Game1.season = estacionGuardada;
        return dias;
    }

    // Carro ambulante: `ShopBuilder.GetShopStock("Traveler")` (lo que arma el
    // `ShopMenu` antes de esconder las recetas que el granjero ya sabe) para
    // varias partidas, fechas y estados. Cada objeto sale como
    // `[id calificado, precio, cantidad]` (y un 1 al final si es receta); va
    // compacto, un caso por línea, para que el fixture no pese de más.
    static void CmdCart(Utf8JsonWriter w)
    {
        var partidas = new (ulong id, bool legacy)[] { (452435081, false), (390176213, false), (177904899, true) };
        var campoJugador = typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic);
        Game1.netWorldState ??= new Netcode.NetRoot<StardewValley.Network.NetWorldState>(new StardewValley.Network.NetWorldState());

        // Calendario: qué días hay carro, con y sin el desierto abierto (el
        // `LOCATION_ACCESSIBLE Desert` del festival es `Game1.isLocationAccessible`,
        // que mira el correo `ccVault` del anfitrión).
        var f0 = new Farmer();
        campoJugador.SetValue(null, f0);
        w.WriteStartObject("calendar");
        foreach (bool vault in new[] { false, true })
        {
            if (vault) f0.mailReceived.Add("ccVault");
            bool desierto = Game1.isLocationAccessible("Desert");
            if (desierto != vault) throw new Exception("isLocationAccessible no mira ccVault");
            w.WriteStartArray(vault ? "desertOpen" : "desertClosed");
            foreach (var (s, d, kind) in DiasCarro(desierto))
                w.WriteStringValue(((int)s).ToString(CultureInfo.InvariantCulture) + " " + d.ToString(CultureInfo.InvariantCulture) + " " + kind);
            w.WriteEndArray();
        }
        w.WriteEndObject();

        var todos = DiasCarro(true);
        w.WriteStartArray("cases");
        for (int pi = 0; pi < partidas.Length; pi++)
        {
            var p = partidas[pi];
            var fechas = new List<(int year, Season s, int d)>();
            int k = 0;
            foreach (int year in new[] { 1, 2 })
                foreach (var (s, d, _) in todos)
                {
                    // La primera partida en todos los días; las otras, día por medio.
                    if (pi == 0 || k % 2 == pi - 1) fechas.Add((year, s, d));
                    k++;
                }
            if (pi == 0)
                foreach (var (s, d) in new[] { (Season.Spring, 5), (Season.Summer, 14), (Season.Fall, 26), (Season.Winter, 16) })
                    fechas.Add((25, s, d));
            for (int fi = 0; fi < fechas.Count; fi++)
            {
                var (year, s, d) = fechas[fi];
                var estados = new List<EstadoCarro> { new EstadoCarro() };
                if (fi % 4 == 0) estados.Add(VariantesCarro[(fi / 4) % VariantesCarro.Length]);
                foreach (var e in estados)
                    UnCasoCarro(w, campoJugador, p.id, p.legacy, year, s, d, e);
            }
        }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;
        Game1.otherFarmers.Clear();
        Game1.netWorldState.Value.VisitsUntilY1Guarantee = -1;
        campoJugador.SetValue(null, new Farmer());
    }

    static void UnCasoCarro(Utf8JsonWriter w, FieldInfo campoJugador, ulong gameId, bool legacy, int year, Season s, int d, EstadoCarro e)
    {
        var f = new Farmer();
        campoJugador.SetValue(null, f);
        Game1.uniqueIDForThisGame = gameId;
        Game1.UseLegacyRandom = legacy;
        Game1.year = year;
        Game1.season = s;
        Game1.dayOfMonth = d;
        uint dias = (uint)((year - 1) * 112 + (int)s * 28 + d);
        Game1.stats.DaysPlayed = dias;
        Game1.random = new Random(7);
        if (e.Cc) foreach (var m in CuartosCc) f.mailReceived.Add(m);
        if (e.Joja) foreach (var m in CuartosJoja) f.mailReceived.Add(m);
        foreach (var npc in e.Corazones) f.friendshipData[npc] = new Friendship(3500);
        Game1.otherFarmers.Clear();
        if (e.Multi) Game1.otherFarmers.Add(12345, new Farmer());
        Game1.netWorldState.Value.VisitsUntilY1Guarantee = e.Y1;

        // Lo que miran `IS_COMMUNITY_CENTER_COMPLETE` e `IS_JOJA_MART_COMPLETE`, del juego.
        bool cc = Game1.MasterPlayer.hasCompletedCommunityCenter() && !Game1.MasterPlayer.mailReceived.Contains("JojaMember");
        bool joja = Utility.hasFinishedJojaRoute();
        if (cc != e.Cc || joja != e.Joja) throw new Exception("el correo armado no da el estado pedido");

        var stock = StardewValley.Internal.ShopBuilder.GetShopStock("Traveler");
        var o = new Dictionary<string, object>
        {
            ["gameId"] = gameId, ["legacy"] = legacy, ["year"] = year, ["season"] = (int)s, ["day"] = d,
            ["daysPlayed"] = dias, ["cc"] = cc, ["joja"] = joja, ["multi"] = Game1.IsMultiplayer,
            ["hearts"] = e.Corazones, ["y1"] = Game1.netWorldState.Value.VisitsUntilY1Guarantee,
        };
        var items = new List<object[]>();
        foreach (var kv in stock)
        {
            var x = new List<object> { kv.Key.QualifiedItemId, kv.Value.Price, kv.Value.Stock };
            if (kv.Key.IsRecipe) x.Add(1);
            items.Add(x.ToArray());
        }
        o["items"] = items;
        // Un caso por línea: el valor crudo no lleva la sangría del escritor.
        w.WriteRawValue("\n    " + JsonSerializer.Serialize(o), skipInputValidation: true);
    }

    // ------------------------------------------------- clima, Minas y noches

    static readonly (ulong id, bool legacy)[] PartidasDia = { (452435081, false), (390176213, false), (177904899, true) };

    // Pone la fecha en `Game1` y en `netWorldState` (de donde sale `Game1.Date`).
    static void PonerFecha(ulong gameId, bool legacy, int year, Season s, int d)
    {
        Game1.uniqueIDForThisGame = gameId;
        Game1.UseLegacyRandom = legacy;
        Game1.year = year;
        Game1.season = s;
        Game1.dayOfMonth = d;
        Game1.stats.DaysPlayed = (uint)((year - 1) * 112 + (int)s * 28 + d);
        Game1.weatherForTomorrow ??= "Sun";
        Game1.netWorldState.Value.UpdateFromGame1();
        if (Game1.Date.TotalDays != (int)Game1.stats.DaysPlayed - 1) throw new Exception("Game1.Date no siguió a la fecha");
    }

    // Las ubicaciones que miran los festivales y el clima, con su mapa real (el
    // contexto de cada una sale de la propiedad `LocationContext` del mapa).
    static void ArmarUbicaciones()
    {
        Game1.netWorldState ??= new Netcode.NetRoot<StardewValley.Network.NetWorldState>(new StardewValley.Network.NetWorldState());
        Game1.game1.xTileContent ??= new ContenidoSinTexturas(Game1.content.ServiceProvider, Game1.content.RootDirectory);
        // Los mapas cargan y descargan sus hojas de tiles en el dispositivo de dibujo: uno que no hace nada.
        Game1.mapDisplayDevice ??= DispatchProxy.Create<xTile.Display.IDisplayDevice, DibujoNulo>();
        var campo = typeof(Game1).GetField("_onlineFarmers", BindingFlags.Static | BindingFlags.NonPublic);
        if (campo.GetValue(null) == null) campo.SetValue(null, new StardewValley.Network.FarmerCollection());
        // Con el constructor vacío (el de la carga de partidas): el que recibe el mapa
        // también siembra objetos, y eso pide medio juego. El contexto lo lee
        // `GetLocationContextId`, que carga el mapa (`reloadMap`) la primera vez.
        foreach (var n in new[] { "Town", "Beach", "Forest", "Mountain", "Desert", "Farm" })
            if (Game1.getLocationFromName(n) == null)
            {
                GameLocation l = n == "Farm" ? new StardewValley.Farm() : new GameLocation();
                l.name.Value = n;
                l.mapPath.Value = "Maps\\" + n;
                Game1.locations.Add(l);
            }
    }

    // Un `Random` que contesta `NextDouble` según una máscara: el bit k en 1 da 0
    // (el k-ésimo `RANDOM` se cumple) y en 0 da casi 1 (no se cumple). Así se
    // recorren todas las combinaciones de `Game1.random`, que el predictor no sabe.
    class AzarGuionado : Random
    {
        readonly int mascara;
        public int Usados;
        public AzarGuionado(int m) { mascara = m; }
        public override double NextDouble()
        {
            int k = Usados++;
            if (k >= 8) throw new Exception("más de 8 tiradas de RANDOM");
            return ((mascara >> k) & 1) != 0 ? 0.0 : 0.99999999;
        }
        protected override double Sample() => throw new Exception("tirada inesperada (Sample)");
        public override int Next() => throw new Exception("tirada inesperada (Next)");
        public override int Next(int max) => throw new Exception("tirada inesperada (Next)");
        public override int Next(int min, int max) => throw new Exception("tirada inesperada (Next)");
    }

    static readonly string[] Guardados = { "Sun", "Rain", "Storm", "Snow", "Wind", "GreenRain", "Festival" };

    // Clima: por partida y fecha D (la mañana en que corre `UpdateWeatherForNewDay`),
    // `LocationWeather.UpdateDailyWeather("Default", ...)` real con las 256
    // combinaciones de `AzarGuionado`: `saved` es el conjunto de lo que puede quedar
    // guardado como clima de mañana (más de uno = depende de `RANDOM`). Después, con
    // la fecha de mañana, `Game1.getWeatherModificationsForDate` real sobre cada
    // valor posible de lo guardado (`mods`, en el orden de `Guardados`).
    // `passiveInValley`: si algún `MapReplacements` del festival pasivo está en el
    // contexto del valle (`InValleyContext` sobre el mapa real).
    static void CmdWeather(Utf8JsonWriter w)
    {
        ArmarUbicaciones();
        var datos = Game1.locationContextData["Default"];
        w.WriteStartObject("passiveInValley");
        foreach (var kv in DataLoader.PassiveFestivals(Game1.content))
        {
            if (kv.Value.MapReplacements == null) continue;
            bool valle = false;
            foreach (var n in kv.Value.MapReplacements.Keys)
            {
                var l = Game1.getLocationFromName(n) ?? throw new Exception("falta la ubicación " + n);
                if (l.InValleyContext()) valle = true;
            }
            w.WriteBoolean(kv.Key, valle);
        }
        w.WriteEndObject();
        w.WriteStartArray("saved");
        foreach (var g in Guardados) w.WriteStringValue(g);
        w.WriteEndArray();

        var fechas = new List<(int year, Season s, int d)>();
        for (int s = 0; s < 4; s++)
            for (int d = 1; d <= 28; d++) fechas.Add((1, (Season)s, d));
        for (int s = 0; s < 4; s++)
            foreach (int d in new[] { 1, 2, 3, 12, 13, 27, 28 }) fechas.Add((2, (Season)s, d));
        w.WriteStartArray("cases");
        foreach (var p in PartidasDia)
            foreach (var (year, s, d) in fechas)
            {
                PonerFecha(p.id, p.legacy, year, s, d);
                uint dias = Game1.stats.DaysPlayed;
                var posibles = new SortedSet<string>(StringComparer.Ordinal);
                for (int m = 0; m < 256; m++)
                {
                    var lw = new StardewValley.Network.LocationWeather();
                    lw.WeatherForTomorrow = "Sun";
                    lw.UpdateDailyWeather("Default", datos, new AzarGuionado(m));
                    posibles.Add(lw.WeatherForTomorrow);
                }
                // La mañana siguiente: la fecha ya avanzó cuando se aplican las modificaciones.
                var manana = new WorldDate(Game1.Date);
                manana.TotalDays++;
                PonerFecha(p.id, p.legacy, manana.Year, manana.Season, manana.DayOfMonth);
                var mods = new List<string>();
                foreach (var g in Guardados) mods.Add(Game1.getWeatherModificationsForDate(Game1.Date, g));
                var o = new Dictionary<string, object>
                {
                    ["gameId"] = p.id, ["legacy"] = p.legacy, ["year"] = year, ["season"] = (int)s, ["day"] = d,
                    ["daysPlayed"] = dias, ["saved"] = posibles, ["mods"] = string.Join(" ", mods),
                };
                w.WriteRawValue("\n    " + JsonSerializer.Serialize(o), skipInputValidation: true);
            }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;
    }

    // Minas: `MineShaft.loadLevel` real, piso por piso (1 a 119), con
    // `netWorldState.LowestMineLevel` (lo que lee `lowestLevelReached`; `loadLevel`
    // lo sube, así que se repone antes de cada piso), el correo de la cantera
    // (`ccCraftsRoom` y `VisitedQuarryMine`) y, en algunos casos, el Aceite de ajo
    // (buff "23") en el granjero. Se leen `isMonsterArea`, `isSlimeArea`,
    // `isQuarryArea` y `loadedMapNumber` (hongos: mapas 40, 47, 50 y 51).
    static void CmdMines(Utf8JsonWriter w)
    {
        ArmarUbicaciones();
        var campoJugador = typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic);
        var pisos = new Dictionary<int, StardewValley.Locations.MineShaft>();
        w.WriteStartArray("cases");
        for (int pi = 0; pi < PartidasDia.Length; pi++)
        {
            var p = PartidasDia[pi];
            int desde = new[] { 5, 100, 250 }[pi];
            for (int k = 0; k < 30; k++)
            {
                int dp = desde + k;
                var fecha = new WorldDate { TotalDays = dp - 1 };
                foreach (int hondo in new[] { 0, 120 })
                    foreach (bool cantera in new[] { false, true })
                        foreach (bool ajo in new[] { false, true })
                        {
                            // El ajo sólo en un día de cada cinco (alcanza para ver que cambia la cantera).
                            if (ajo && k % 5 != 0) continue;
                            var f = new Farmer();
                            campoJugador.SetValue(null, f);
                            if (cantera) { f.mailReceived.Add("ccCraftsRoom"); f.mailReceived.Add("VisitedQuarryMine"); }
                            if (ajo) f.buffs.AppliedBuffIds.Add("23"); // lo que lee `hasBuff` (`applyBuff` pide el HUD)
                            if (f.hasBuff("23") != ajo) throw new Exception("el buff del ajo no quedó");
                            PonerFecha(p.id, p.legacy, fecha.Year, fecha.Season, fecha.DayOfMonth);
                            var inf = new List<int>(); var baba = new List<int>(); var cant = new List<int>(); var hongo = new List<int>();
                            for (int nivel = 1; nivel <= 119; nivel++)
                            {
                                if (!pisos.TryGetValue(nivel, out var mina)) pisos[nivel] = mina = new StardewValley.Locations.MineShaft(nivel);
                                Game1.netWorldState.Value.LowestMineLevel = hondo;
                                mina.loadLevel(nivel);
                                if (mina.isMonsterArea) inf.Add(nivel);
                                if (mina.isSlimeArea) baba.Add(nivel);
                                if (mina.isQuarryArea) cant.Add(nivel);
                                if (mina.loadedMapNumber is 40 or 47 or 50 or 51) hongo.Add(nivel);
                            }
                            var o = new Dictionary<string, object>
                            {
                                ["gameId"] = p.id, ["legacy"] = p.legacy, ["daysPlayed"] = dp, ["lowest"] = hondo,
                                ["quarry"] = cantera, ["garlic"] = ajo, ["infested"] = inf, ["slime"] = baba,
                                ["quarryLevels"] = cant, ["mushroom"] = hongo,
                            };
                            w.WriteRawValue("\n    " + JsonSerializer.Serialize(o), skipInputValidation: true);
                        }
            }
        }
        w.WriteEndArray();
        Game1.netWorldState.Value.LowestMineLevel = 0;
        Game1.UseLegacyRandom = false;
        campoJugador.SetValue(null, new Farmer());
    }

    // Noches: `Utility.pickFarmEvent()` real, noche tras noche desde la que lleva al
    // día 2 (con la fecha y `DaysPlayed` del día nuevo, como `_newDayAfterFade`), con
    // `Farm.hasMatureFairyRoseTonight` apagado o prendido. Lo que los eventos hacen
    // al correr y cambia las noches siguientes se repite acá: el mapache marca
    // `raccoonTreeFallen` (`SoundInTheNightEvent.setUp`) y el avión de Qi
    // `sawQiPlane` (`QiPlaneEvent`); la cápsula la marca el propio `pickFarmEvent`.
    class EstadoNoche
    {
        public bool CcPantry, Mapache, Capsula, AvionVisto, Boleto;
    }

    static readonly EstadoNoche[] EstadosNoche =
    {
        new EstadoNoche(),
        new EstadoNoche { CcPantry = true },
        new EstadoNoche { CcPantry = true, Mapache = true, Capsula = true, AvionVisto = true },
        new EstadoNoche { Boleto = true },
    };

    static void CmdNight(Utf8JsonWriter w)
    {
        ArmarUbicaciones();
        var campoJugador = typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic);
        var conducta = typeof(StardewValley.Events.SoundInTheNightEvent).GetField("behavior", BindingFlags.Instance | BindingFlags.NonPublic);
        var granja = Game1.getFarm();
        Game1.weddingToday = false;
        w.WriteStartArray("cases");
        for (int pi = 0; pi < PartidasDia.Length; pi++)
        {
            var p = PartidasDia[pi];
            foreach (var e in EstadosNoche)
                foreach (bool rosa in new[] { false, true })
                {
                    var f = new Farmer();
                    campoJugador.SetValue(null, f);
                    if (e.CcPantry) f.mailReceived.Add("ccPantry");
                    if (e.Mapache) f.mailReceived.Add("raccoonTreeFallen");
                    if (e.Capsula) f.mailReceived.Add("Got_Capsule");
                    if (e.AvionVisto) f.mailReceived.Add("sawQiPlane");
                    if (e.Boleto) f.mailReceived.Add("gotFirstBillboardPrizeTicket");
                    var eventos = new List<string>();
                    for (int dp = 2; dp < 402; dp++)
                    {
                        var fecha = new WorldDate { TotalDays = dp - 1 };
                        PonerFecha(p.id, p.legacy, fecha.Year, fecha.Season, fecha.DayOfMonth);
                        granja.hasMatureFairyRoseTonight = rosa;
                        bool capsulaAntes = f.mailReceived.Contains("Got_Capsule");
                        StardewValley.Events.FarmEvent ev;
                        bool avion = false;
                        try { ev = Utility.pickFarmEvent(); }
                        catch (NullReferenceException ex) when (ex.TargetSite?.DeclaringType == typeof(StardewValley.Events.QiPlaneEvent))
                        {
                            // El constructor de `QiPlaneEvent` mide la pantalla y no anda sin
                            // gráficos: si tira ahí, `pickFarmEvent` ya eligió el avión.
                            ev = null;
                            avion = true;
                        }
                        string x = avion ? "qiPlane" : ev switch
                        {
                            null => "-",
                            StardewValley.Events.FairyEvent => "fairy",
                            StardewValley.Events.WitchEvent => "witch",
                            StardewValley.Events.QiPlaneEvent => "qiPlane",
                            StardewValley.Events.SoundInTheNightEvent s => ((Netcode.NetInt)conducta.GetValue(s)).Value switch
                            {
                                0 => "capsule", 1 => "meteorite", 3 => "owl", 4 => "earthquake", 5 => "raccoon",
                                var n => throw new Exception("SoundInTheNightEvent " + n),
                            },
                            _ => throw new Exception("evento inesperado: " + ev.GetType().Name),
                        };
                        if (x == "raccoon") f.mailReceived.Add("raccoonTreeFallen");
                        if (x == "qiPlane") f.mailReceived.Add("sawQiPlane");
                        if (x == "capsule" && (capsulaAntes || !f.mailReceived.Contains("Got_Capsule")))
                            throw new Exception("la cápsula no marcó Got_Capsule");
                        eventos.Add(x);
                    }
                    var o = new Dictionary<string, object>
                    {
                        ["gameId"] = p.id, ["legacy"] = p.legacy, ["rose"] = rosa, ["ccPantry"] = e.CcPantry,
                        ["raccoonTreeFallen"] = e.Mapache, ["gotCapsule"] = e.Capsula, ["sawQiPlane"] = e.AvionVisto, ["billboardTicket"] = e.Boleto,
                        ["from"] = 2, ["events"] = string.Join(" ", eventos),
                    };
                    w.WriteRawValue("\n    " + JsonSerializer.Serialize(o), skipInputValidation: true);
                }
        }
        w.WriteEndArray();
        Game1.UseLegacyRandom = false;
        campoJugador.SetValue(null, new Farmer());
    }
}
