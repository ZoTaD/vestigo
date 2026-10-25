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

// El juego pide texturas al cargar; el oráculo no dibuja nada, así que se las
// damos sin inicializar y el resto de los datos se lee normal.
class ContenidoSinTexturas : LocalizedContentManager
{
    public ContenidoSinTexturas(IServiceProvider s, string raiz) : base(s, raiz) { }

    public override T LoadImpl<T>(string asset, string lang, LanguageCode code)
    {
        if (typeof(T) == typeof(Texture2D))
            return (T)RuntimeHelpers.GetUninitializedObject(typeof(T));
        return base.LoadImpl<T>(asset, lang, code);
    }
}

static class Oracle
{
    static string Juego;

    // Un comando por entrada: nombre -> método que escribe el JSON de salida.
    static readonly Dictionary<string, Action<Utf8JsonWriter>> Comandos = new()
    {
        ["rng"] = CmdRng,
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
        using var w = new Utf8JsonWriter(fs);
        w.WriteStartObject();
        Comandos[comando](w);
        w.WriteEndObject();
        w.Flush();
        Console.WriteLine(comando + " -> " + salida);
        return 0;
    }

    // Deja a `Game1` en un estado en el que las funciones de datos y de azar
    // andan sin abrir una ventana: hash, contenido, datos cargados y un granjero.
    static void ArmarJuego()
    {
        Game1.hash = new HashUtility();
        Game1.content = new ContenidoSinTexturas(new GameServiceContainer(), Path.Combine(Juego, "Content"));
        Game1.game1 = (Game1)RuntimeHelpers.GetUninitializedObject(typeof(Game1));
        Game1.game1._locations = new List<GameLocation>();
        // La carga normal termina en un paso que necesita gráficos y tira: para
        // entonces `objectData` y compañía ya están cargados (paso ~57).
        var carga = (IEnumerator<int>)typeof(Game1)
            .GetMethod("GetLoadContentEnumerator", BindingFlags.Instance | BindingFlags.NonPublic)
            .Invoke(Game1.game1, null);
        try { while (carga.MoveNext()) { } } catch (Exception) { }
        typeof(Game1).GetField("_player", BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, new Farmer());
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
}
