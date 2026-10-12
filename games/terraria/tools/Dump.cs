// Le pide los datos de Terraria al propio TerrariaServer.exe, por reflexión y sin descompilar nada.
// Uso: Dump.exe <TerrariaServer.exe> <carpeta con las DLL de XNA> <carpeta de salida>
// Lo compila y lo corre `dump.ps1`. Cada bloque va en su `Step`: si uno falla, lo dice y los demás salen igual.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;

static class Dump
{
    static Assembly game;
    static string xna, outDir;
    const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;

    /// XNA sale de la carpeta que se le pasa (no hace falta instalarlo); ReLogic, Json.NET y demás vienen embebidas.
    static Assembly Resolve(object sender, ResolveEventArgs e)
    {
        string name = new AssemblyName(e.Name).Name;
        foreach (string f in Directory.GetFiles(xna, name + ".dll", SearchOption.AllDirectories)) return Assembly.LoadFrom(f);
        if (game == null) return null;
        foreach (string r in game.GetManifestResourceNames())
            if (r.EndsWith("." + name + ".dll"))
                using (Stream s = game.GetManifestResourceStream(r))
                {
                    byte[] b = new byte[s.Length];
                    s.Read(b, 0, b.Length);
                    return Assembly.Load(b);
                }
        return null;
    }

    static Type T(string n) { Type t = game.GetType(n); if (t == null) throw new Exception("falta el tipo " + n); return t; }

    static object Get(Type t, string f, object o = null)
    {
        FieldInfo fi = t.GetField(f, All);
        if (fi != null) return fi.GetValue(o);
        PropertyInfo p = t.GetProperty(f, All);
        if (p != null) return p.GetValue(o, null);
        throw new Exception(t.Name + "." + f);
    }

    static object Call(Type t, string m, object o, params object[] args)
    {
        foreach (MethodInfo mi in t.GetMethods(All))
            if (mi.Name == m && mi.GetParameters().Length == args.Length) return mi.Invoke(o, args);
        throw new Exception(t.Name + "." + m + "/" + args.Length);
    }

    // --- JSON a mano: sin dependencias y con los números en formato invariante ---------------------------------

    static string Esc(string s)
    {
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s ?? "")
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c == '\n') b.Append("\\n");
            else if (c < 32) b.AppendFormat("\\u{0:x4}", (int)c);
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }

    static bool IsDefault(object v)
    {
        if (v is bool) return !(bool)v;
        if (v is string) return ((string)v).Length == 0;
        if (v is float) return (float)v == 0f;
        if (v is double) return (double)v == 0d;
        if (v is char) return (char)v == 0;
        return Convert.ToInt64(v) == 0;
    }

    static string Prim(object v)
    {
        if (v is bool) return (bool)v ? "true" : "false";
        if (v is string) return Esc((string)v);
        if (v is float) return ((float)v).ToString("R", CultureInfo.InvariantCulture);
        if (v is double) return ((double)v).ToString("R", CultureInfo.InvariantCulture);
        if (v is Enum) return Convert.ToInt64(v).ToString();
        if (v is char) return ((int)(char)v).ToString();
        return Convert.ToString(v, CultureInfo.InvariantCulture);
    }

    /// Los campos primitivos públicos que no están en su valor por defecto.
    static void Fields(StringBuilder b, object o)
    {
        foreach (FieldInfo f in o.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
        {
            Type ft = f.FieldType;
            if (!(ft.IsPrimitive || ft == typeof(string) || ft.IsEnum)) continue;
            object v = f.GetValue(o);
            if (v == null || IsDefault(ft.IsEnum ? Convert.ToInt64(v) : v)) continue;
            b.Append(',').Append(Esc(f.Name)).Append(':').Append(Prim(v));
        }
    }

    static void Value(StringBuilder b, object v, Type itemT)
    {
        if (v == null) { b.Append("null"); return; }
        Type t = v.GetType();
        if (t == itemT)
            b.Append("{\"type\":").Append(Get(itemT, "type", v)).Append(",\"stack\":").Append(Get(itemT, "stack", v)).Append('}');
        else if (t.IsPrimitive || t == typeof(string) || t.IsEnum) b.Append(Prim(v));
        else if (v is IEnumerable)
        {
            b.Append('[');
            bool first = true;
            foreach (object x in (IEnumerable)v)
            {
                // Los arreglos de ingredientes vienen rellenos con objetos vacíos (type 0).
                if (x != null && x.GetType() == itemT && Convert.ToInt32(Get(itemT, "type", x)) == 0) continue;
                if (!first) b.Append(',');
                first = false;
                Value(b, x, itemT);
            }
            b.Append(']');
        }
        else b.Append(Esc(t.Name));
    }

    static void Write(string file, StringBuilder b)
    {
        File.WriteAllText(Path.Combine(outDir, file), b.ToString(), new UTF8Encoding(false));
    }

    delegate void Work();
    static bool Step(string name, Work w)
    {
        try { w(); return true; }
        catch (Exception e)
        {
            Exception x = e;
            while (x.InnerException != null) x = x.InnerException;
            Console.WriteLine("!! " + name + ": " + x.GetType().Name + ": " + x.Message);
            string[] st = (x.StackTrace ?? "").Split('\n');
            for (int i = 0; i < st.Length && i < 4; i++) Console.WriteLine("   " + st[i].Trim());
            return false;
        }
    }

    static void SetLanguage(string code)
    {
        Type lm = T("Terraria.Localization.LanguageManager");
        lm.GetMethod("SetLanguage", new[] { typeof(string) }).Invoke(Get(lm, "Instance"), new object[] { code });
        T("Terraria.Lang").GetMethod("InitializeLegacyLocalization", All).Invoke(null, null);
    }

    /// La descripción ya resuelta por el juego. Las que nombran una tecla (`<right>`, atajos) piden el teclado del
    /// jugador, que en un servidor no existe: esas salen vacías y `site_data.py` usa el texto crudo.
    static string Tooltip(int id)
    {
        try
        {
            Type lang = T("Terraria.Lang");
            object tip = Call(lang, "GetTooltip", null, id);
            if (tip == null) return "";
            int lines = Convert.ToInt32(Get(tip.GetType(), "Lines", tip));
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < lines; i++) { if (i > 0) b.Append('\n'); b.Append((string)Call(tip.GetType(), "GetLine", tip, i)); }
            return b.ToString();
        }
        catch (Exception) { return ""; }
    }

    static int Main(string[] a)
    {
        // `--server <TerrariaServer.exe> <XNA> <argumentos del servidor…>`: arranca el servidor adentro de este proceso,
        // que sabe dónde está XNA. Lo usa `worlds.ps1` para generar mundos.
        if (a[0] == "--server")
        {
            xna = a[2];
            AppDomain.CurrentDomain.AssemblyResolve += Resolve;
            game = Assembly.LoadFrom(a[1]);
            Directory.SetCurrentDirectory(Path.GetDirectoryName(a[1]));
            string[] rest = new string[a.Length - 3];
            Array.Copy(a, 3, rest, 0, rest.Length);
            game.EntryPoint.Invoke(null, new object[] { rest });
            return 0;
        }
        xna = a[1];
        outDir = a[2];
        Directory.CreateDirectory(outDir);
        AppDomain.CurrentDomain.AssemblyResolve += Resolve;
        game = Assembly.LoadFrom(a[0]);
        Directory.SetCurrentDirectory(Path.GetDirectoryName(a[0]));

        // Los textos oficiales, tal cual vienen embebidos.
        foreach (string r in game.GetManifestResourceNames())
            if (r.Contains(".Localization.Content.en-US") || r.Contains(".Localization.Content.es-ES"))
                using (Stream s = game.GetManifestResourceStream(r))
                using (FileStream f = File.Create(Path.Combine(outDir, r.Replace("Terraria.Localization.Content.", "loc."))))
                    s.CopyTo(f);

        // Main arma sus rutas con Program.SavePath: va a una carpeta propia, lejos de las partidas del usuario.
        string save = Path.Combine(outDir, "save");
        Directory.CreateDirectory(save);
        Type program = T("Terraria.Program");
        FieldInfo sp = program.GetField("SavePath", All);
        if (sp != null) sp.SetValue(null, save); else program.GetProperty("SavePath", All).SetValue(null, save, null);

        Type main = T("Terraria.Main"), itemT = T("Terraria.Item"), itemId = T("Terraria.ID.ItemID"), lang = T("Terraria.Lang"), rec = T("Terraria.Recipe");
        main.GetField("dedServ", All).SetValue(null, true);
        Step("idioma", delegate { SetLanguage("en-US"); });
        Step("jugadores", delegate
        {
            // La ropa "familiar" copia los colores del jugador local.
            Array players = (Array)Get(main, "player");
            for (int i = 0; i < players.Length; i++) if (players.GetValue(i) == null) players.SetValue(Activator.CreateInstance(T("Terraria.Player")), i);
        });

        Console.WriteLine("version: " + Get(main, "versionNumber"));
        // Lo que Main arma al arrancar y acá hace falta: cuadros de los objetos animados y tablas de bloques.
        foreach (string init in new[] { "InitializeItemAnimations", "Initialize_TileAndNPCData1", "Initialize_TileAndNPCData2", "Initialize_Items" })
        {
            string m = init;
            Step(m, delegate { main.GetMethod(m, All).Invoke(null, null); });
        }
        int count = Convert.ToInt32(itemId.GetField("Count").GetValue(null));

        // El nombre interno de cada objeto (la constante de ItemID): es la clave de los textos.
        Dictionary<int, string> intern = new Dictionary<int, string>();
        foreach (FieldInfo f in itemId.GetFields(BindingFlags.Public | BindingFlags.Static))
            if (f.IsLiteral && f.Name != "Count") { int v = Convert.ToInt32(f.GetRawConstantValue()); if (!intern.ContainsKey(v)) intern[v] = f.Name; }

        MethodInfo setDefaults = null;
        foreach (MethodInfo m in itemT.GetMethods(BindingFlags.Public | BindingFlags.Instance))
            if (m.Name == "SetDefaults" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType == typeof(int) && (setDefaults == null || m.GetParameters().Length < setDefaults.GetParameters().Length)) setDefaults = m;
        MethodInfo nameOf = lang.GetMethod("GetItemNameValue", All);

        bool[] deprecated = null;
        Step("obsoletos", delegate { deprecated = (bool[])Get(T("Terraria.ID.ItemID+Sets"), "Deprecated"); });
        Array anims = null;
        Step("animaciones", delegate { anims = (Array)Get(main, "itemAnimations"); });

        Step("objetos", delegate
        {
            StringBuilder b = new StringBuilder("[");
            int ok = 0, bad = 0;
            for (int i = 1; i < count; i++)
            {
                try
                {
                    object it = Activator.CreateInstance(itemT);
                    object[] args = new object[setDefaults.GetParameters().Length];
                    args[0] = i;
                    for (int k = 1; k < args.Length; k++) { ParameterInfo p = setDefaults.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                    setDefaults.Invoke(it, args);
                    int frames = 1;
                    if (anims != null && i < anims.Length && anims.GetValue(i) != null) { object an = anims.GetValue(i); frames = Convert.ToInt32(Get(an.GetType(), "FrameCount", an)); }
                    if (ok > 0) b.Append(",\n");
                    b.Append("{\"id\":").Append(i)
                        .Append(",\"internal\":").Append(Esc(intern.ContainsKey(i) ? intern[i] : ""))
                        .Append(",\"name\":").Append(Esc((string)nameOf.Invoke(null, new object[] { i })))
                        .Append(",\"tip\":").Append(Esc(Tooltip(i)))
                        .Append(",\"frames\":").Append(frames)
                        .Append(",\"deprecated\":").Append(deprecated != null && i < deprecated.Length && deprecated[i] ? "true" : "false");
                    Fields(b, it);
                    b.Append('}');
                    ok++;
                }
                catch (Exception e) { bad++; if (bad < 4) Console.WriteLine("   objeto " + i + ": " + (e.InnerException ?? e).Message); }
            }
            b.Append("]");
            Write("items.json", b);
            Console.WriteLine("objetos: " + ok + " bien, " + bad + " con error");
        });

        Step("recetas", delegate
        {
            rec.GetMethod("SetupRecipeGroups", All).Invoke(null, null);
            // El armado termina ordenando para el Shimmer con datos que no están en un servidor sin mundo: para
            // entonces las recetas ya están todas cargadas.
            Step("armado de recetas (el orden final puede fallar sin consecuencias)", delegate { rec.GetMethod("SetupRecipes", All).Invoke(null, null); });
            int n = Convert.ToInt32(Get(rec, "numRecipes"));
            Array list = (Array)Get(main, "recipe");
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < n; i++)
            {
                object r = list.GetValue(i);
                if (i > 0) b.Append(",\n");
                b.Append("{\"i\":").Append(i);
                foreach (FieldInfo f in rec.GetFields(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (f.Name == "requiredItemQuickLookup") continue;
                    object v = f.GetValue(r);
                    if (v == null) continue;
                    if ((f.FieldType.IsPrimitive || f.FieldType.IsEnum) && IsDefault(f.FieldType.IsEnum ? Convert.ToInt64(v) : v)) continue;
                    b.Append(',').Append(Esc(f.Name)).Append(':');
                    Value(b, v, itemT);
                }
                b.Append('}');
            }
            b.Append("]");
            Write("recipes.json", b);
            Console.WriteLine("recetas: " + n);
        });

        // Los textos que dependen del idioma se piden dos veces, cambiando el idioma del juego.
        Dictionary<string, StringBuilder> byLang = new Dictionary<string, StringBuilder>();
        foreach (string code in new[] { "en-US", "es-ES" })
        {
            string c = code;
            Step("textos " + c, delegate
            {
                SetLanguage(c);
                StringBuilder b = new StringBuilder("{\"items\":{");
                bool first = true;
                for (int i = 1; i < count; i++)
                {
                    string nm = (string)nameOf.Invoke(null, new object[] { i });
                    if (!first) b.Append(",\n");
                    first = false;
                    b.Append('"').Append(i).Append("\":[").Append(Esc(nm)).Append(',').Append(Esc(Tooltip(i))).Append(']');
                }
                b.Append("},\"groups\":{");
                Type rg = T("Terraria.RecipeGroup");
                IDictionary groups = (IDictionary)Get(rg, "recipeGroups");
                first = true;
                foreach (DictionaryEntry g in groups)
                {
                    object grp = g.Value;
                    string text = "";
                    try { text = (string)((Delegate)Get(rg, "GetText", grp)).DynamicInvoke(); } catch (Exception) { }
                    if (!first) b.Append(",\n");
                    first = false;
                    b.Append('"').Append(g.Key).Append("\":{\"name\":").Append(Esc(text)).Append(",\"items\":");
                    Value(b, Get(rg, "ValidItems", grp), itemT);
                    b.Append(",\"order\":");
                    Value(b, Get(rg, "Items", grp), itemT);
                    b.Append('}');
                }
                b.Append("},\"tiles\":{");
                first = true;
                HashSet<int> seen = new HashSet<int>();
                int n = Convert.ToInt32(Get(rec, "numRecipes"));
                Array list = (Array)Get(main, "recipe");
                for (int i = 0; i < n; i++)
                {
                    int tile = Convert.ToInt32(Get(rec, "requiredTile", list.GetValue(i)));
                    if (tile < 0 || !seen.Add(tile)) continue;
                    string nm = "";
                    try { nm = (string)Call(rec, "GetRequiredTileName", null, tile); } catch (Exception) { }
                    if (!first) b.Append(',');
                    first = false;
                    b.Append('"').Append(tile).Append("\":").Append(Esc(nm));
                }
                b.Append("}}");
                Write("texts." + c + ".json", b);
            });
        }
        Step("idioma de vuelta", delegate { SetLanguage("en-US"); });

        // De dónde sale cada objeto: la base de botín del juego, aplanada a (enemigo, objeto, cantidad, chance).
        Step("botín", delegate
        {
            Type dbT = T("Terraria.GameContent.ItemDropRules.ItemDropDatabase");
            object db = Activator.CreateInstance(dbT);
            Call(dbT, "Populate", db);
            Type infoT = T("Terraria.GameContent.ItemDropRules.DropRateInfo");
            Type feedT = T("Terraria.GameContent.ItemDropRules.DropRateInfoChainFeed");
            Type listT = typeof(List<>).MakeGenericType(infoT);
            int npcCount = Convert.ToInt32(T("Terraria.ID.NPCID").GetField("Count").GetValue(null));
            MethodInfo npcName = lang.GetMethod("GetNPCNameValue", All);
            StringBuilder b = new StringBuilder("[");
            int rows = 0;
            for (int npc = -65; npc < npcCount; npc++)
            {
                if (npc == 0) continue;
                IEnumerable rules = (IEnumerable)Call(dbT, "GetRulesForNPCID", db, npc, false);
                IList infos = (IList)Activator.CreateInstance(listT);
                object feed = Activator.CreateInstance(feedT, 1f);
                foreach (object rule in rules) Call(rule.GetType(), "ReportDroprates", rule, infos, feed);
                foreach (object info in infos)
                {
                    if (rows++ > 0) b.Append(",\n");
                    b.Append("{\"npc\":").Append(npc)
                        .Append(",\"item\":").Append(Get(infoT, "itemId", info))
                        .Append(",\"min\":").Append(Get(infoT, "stackMin", info))
                        .Append(",\"max\":").Append(Get(infoT, "stackMax", info))
                        .Append(",\"rate\":").Append(Prim(Get(infoT, "dropRate", info)))
                        .Append(",\"if\":[");
                    IEnumerable conds = (IEnumerable)Get(infoT, "conditions", info);
                    bool first = true;
                    if (conds != null)
                        foreach (object cnd in conds)
                        {
                            string d = null;
                            try { d = (string)Call(cnd.GetType(), "GetConditionDescription", cnd); } catch (Exception) { }
                            if (!first) b.Append(',');
                            first = false;
                            b.Append("[").Append(Esc(cnd.GetType().Name)).Append(',').Append(Esc(d ?? "")).Append("]");
                        }
                    b.Append("]}");
                }
            }
            b.Append("]");
            Write("drops.json", b);
            StringBuilder nb = new StringBuilder("{");
            bool f1 = true;
            foreach (string c in new[] { "en-US", "es-ES" })
            {
                SetLanguage(c);
                if (!f1) nb.Append(",\n");
                f1 = false;
                nb.Append(Esc(c)).Append(":{");
                bool f2 = true;
                for (int npc = -65; npc < npcCount; npc++)
                {
                    if (npc == 0) continue;
                    string nm = "";
                    try { nm = (string)npcName.Invoke(null, new object[] { npc }); } catch (Exception) { }
                    if (!f2) nb.Append(',');
                    f2 = false;
                    nb.Append('"').Append(npc).Append("\":").Append(Esc(nm));
                }
                nb.Append('}');
            }
            nb.Append('}');
            Write("npcs.json", nb);
            Console.WriteLine("botín: " + rows + " filas");
        });

        // Las estadísticas de cada enemigo y NPC, y qué cara usa en el mapa.
        Step("npc", delegate
        {
            Type npcT = T("Terraria.NPC");
            int npcCount = Convert.ToInt32(T("Terraria.ID.NPCID").GetField("Count").GetValue(null));
            MethodInfo set = null;
            foreach (MethodInfo m in npcT.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                if (m.Name == "SetDefaults" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType == typeof(int)) set = m;
            StringBuilder b = new StringBuilder("[");
            int ok = 0, bad = 0;
            for (int i = 1; i < npcCount; i++)
            {
                try
                {
                    object n = Activator.CreateInstance(npcT);
                    object[] args = new object[set.GetParameters().Length];
                    args[0] = i;
                    for (int k = 1; k < args.Length; k++) { ParameterInfo p = set.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                    set.Invoke(n, args);
                    int head = -1, bossHead = -1;
                    try { head = Convert.ToInt32(Call(npcT, "TypeToDefaultHeadIndex", null, i)); } catch (Exception) { }
                    try { bossHead = Convert.ToInt32(Call(npcT, "GetBossHeadTextureIndex", n)); } catch (Exception) { }
                    StringBuilder one = new StringBuilder();
                    one.Append("{\"id\":").Append(i).Append(",\"head\":").Append(head).Append(",\"bossHead\":").Append(bossHead);
                    foreach (string f in new[] { "lifeMax", "damage", "defense", "boss", "townNPC", "friendly", "value", "knockBackResist", "aiStyle" })
                        one.Append(",\"").Append(f).Append("\":").Append(Prim(Get(npcT, f, n)));
                    one.Append('}');
                    if (ok++ > 0) b.Append(",\n");
                    b.Append(one);
                }
                catch (Exception e) { if (bad++ < 3) Console.WriteLine("   npc " + i + ": " + (e.InnerException ?? e).Message); }
            }
            b.Append("]");
            Write("npcstats.json", b);
            Console.WriteLine("npc: " + ok + " bien, " + bad + " con error");
        });

        // La felicidad de los NPC: a quién y qué bioma quiere cada uno, y las constantes de la tienda.
        Step("felicidad", delegate
        {
            Type dbT = T("Terraria.GameContent.Personalities.PersonalityDatabase");
            object db = Activator.CreateInstance(dbT);
            Type popT = T("Terraria.GameContent.Personalities.PersonalityDatabasePopulator");
            Call(popT, "Populate", Activator.CreateInstance(popT), db);
            IDictionary profiles = null;
            foreach (FieldInfo f in dbT.GetFields(All)) { object v = f.GetValue(db); if (v is IDictionary) profiles = (IDictionary)v; }
            StringBuilder b = new StringBuilder("{\"npcs\":{");
            bool first = true;
            HashSet<string> shapes = new HashSet<string>();
            foreach (DictionaryEntry e in profiles)
            {
                object profile = e.Value;
                IEnumerable traits = null;
                foreach (FieldInfo f in profile.GetType().GetFields(All)) { object v = f.GetValue(profile); if (v is IEnumerable && !(v is string)) traits = (IEnumerable)v; }
                foreach (PropertyInfo p in profile.GetType().GetProperties(All)) { if (traits != null) break; object v = p.GetValue(profile, null); if (v is IEnumerable && !(v is string)) traits = (IEnumerable)v; }
                if (!first) b.Append(",\n");
                first = false;
                b.Append('"').Append(e.Key).Append("\":[");
                bool f2 = true;
                if (traits != null)
                    foreach (object trait in traits)
                    {
                        Type tt = trait.GetType();
                        if (shapes.Add(tt.Name)) Console.WriteLine("   rasgo " + Shape(tt));
                        List<string[]> rows = new List<string[]>();
                        FieldInfo npcF = tt.GetField("NpcId", All), levelF = tt.GetField("Level", All);
                        if (npcF != null && levelF != null) rows.Add(new[] { "npc", Convert.ToString(npcF.GetValue(trait)), levelF.GetValue(trait).ToString() });
                        else
                        {
                            object prefs = null;
                            foreach (FieldInfo f in tt.GetFields(All)) { object v = f.GetValue(trait); if (v is IEnumerable && !(v is string)) prefs = v; }
                            if (prefs == null) foreach (PropertyInfo p in tt.GetProperties(All)) { if (p.GetIndexParameters().Length > 0) continue; object v = p.GetValue(trait, null); if (v is IEnumerable && !(v is string)) prefs = v; }
                            if (prefs != null)
                                foreach (object pref in (IEnumerable)prefs)
                                {
                                    Type pt = pref.GetType();
                                    if (shapes.Add(pt.Name)) Console.WriteLine("   preferencia " + Shape(pt));
                                    object biome = null, level = null;
                                    foreach (FieldInfo f in pt.GetFields(All)) { object v = f.GetValue(pref); if (v == null) continue; if (v is Enum) level = v; else if (!v.GetType().IsPrimitive) biome = v; }
                                    string key = biome == null ? "" : biome.GetType().Name;
                                    try { key = Convert.ToString(Get(biome.GetType(), "NameKey", biome)); } catch (Exception) { }
                                    rows.Add(new[] { "biome", key, Convert.ToString(level) });
                                }
                        }
                        foreach (string[] r in rows)
                        {
                            if (!f2) b.Append(',');
                            f2 = false;
                            b.Append('[').Append(Esc(r[0])).Append(',').Append(Esc(r[1])).Append(',').Append(Esc(r[2])).Append(']');
                        }
                    }
                b.Append(']');
            }
            b.Append("},\"consts\":{");
            first = true;
            foreach (FieldInfo f in T("Terraria.GameContent.ShopHelper").GetFields(All))
                if (f.IsLiteral && (f.FieldType == typeof(float) || f.FieldType == typeof(int) || f.FieldType == typeof(double)))
                {
                    if (!first) b.Append(',');
                    first = false;
                    b.Append(Esc(f.Name)).Append(':').Append(Prim(f.GetRawConstantValue()));
                }
            b.Append("}}");
            Write("happiness.json", b);
            Console.WriteLine("felicidad: " + profiles.Count + " NPC");
        });
        // A quién quiere cada NPC de vecino. En 1.4.5 eso no está en una tabla: lo decide el código de la tienda. Se le
        // pregunta a la tienda misma: el precio de A solo, y el de A con B viviendo al lado; el cociente dice el gusto.
        Step("vecinos", delegate
        {
            Type npcT = T("Terraria.NPC"), shT = T("Terraria.GameContent.ShopHelper");
            object shop = Activator.CreateInstance(shT);
            Array npcs = (Array)Get(main, "npc");
            for (int i = 0; i < npcs.Length; i++) if (npcs.GetValue(i) == null) npcs.SetValue(Activator.CreateInstance(npcT), i);
            Array players = (Array)Get(main, "player");
            object player = players.GetValue(0);
            main.GetField("myPlayer", All).SetValue(null, 0);
            MethodInfo set = null;
            foreach (MethodInfo m in npcT.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                if (m.Name == "SetDefaults" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType == typeof(int)) set = m;
            FieldInfo posF = T("Terraria.Entity").GetField("position", All);
            Type vec = posF.FieldType;

            // Un NPC con casa en la columna `tileX`, parado en su casa.
            Func<int, int, int, object> place = delegate (int slot, int type, int tileX)
            {
                object n = Activator.CreateInstance(npcT);
                object[] args = new object[set.GetParameters().Length];
                args[0] = type;
                for (int k = 1; k < args.Length; k++) { ParameterInfo p = set.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                set.Invoke(n, args);
                SetAny(n, "homeless", false);
                SetAny(n, "homeTileX", tileX);
                SetAny(n, "homeTileY", 300);
                SetAny(n, "active", true);
                SetAny(n, "whoAmI", slot);
                posF.SetValue(n, Activator.CreateInstance(vec, (float)(tileX * 16), (float)(300 * 16)));
                npcs.SetValue(n, slot);
                return n;
            };
            Func<object, double> price = delegate (object npc)
            {
                object settings = Call(shT, "GetShoppingSettings", shop, player, npc);
                return Convert.ToDouble(Get(settings.GetType(), "PriceAdjustment", settings));
            };

            Type dbT = T("Terraria.GameContent.Personalities.PersonalityDatabase");
            object db = Activator.CreateInstance(dbT);
            Type popT = T("Terraria.GameContent.Personalities.PersonalityDatabasePopulator");
            Call(popT, "Populate", Activator.CreateInstance(popT), db);
            List<int> town = new List<int>();
            foreach (object k in ((IDictionary)Get(dbT, "_personalityProfiles", db)).Keys) town.Add(Convert.ToInt32(k));
            town.Sort();

            StringBuilder b = new StringBuilder("{");
            bool first = true;
            int errors = 0;
            foreach (int who in town)
            {
                double alone = 0;
                try
                {
                    npcs.SetValue(Activator.CreateInstance(npcT), 1);
                    alone = price(place(0, who, 500));
                }
                catch (Exception e) { if (errors++ < 2) { Exception x = e; while (x.InnerException != null) x = x.InnerException; Console.WriteLine("   " + who + " solo: " + x.Message + "\n" + x.StackTrace.Split('\n')[0]); } continue; }
                if (!first) b.Append(",\n");
                first = false;
                b.Append((char)34).Append(who).Append("\":{\"alone\":").Append(alone.ToString("R", CultureInfo.InvariantCulture)).Append(",\"with\":{");
                bool f2 = true;
                foreach (int other in town)
                {
                    if (other == who) continue;
                    try
                    {
                        object na = place(0, who, 500);
                        place(1, other, 503);
                        double both = price(na);
                        if (!f2) b.Append(',');
                        f2 = false;
                        b.Append('"').Append(other).Append("\":").Append(both.ToString("R", CultureInfo.InvariantCulture));
                    }
                    catch (Exception) { errors++; }
                }
                b.Append("}}");
            }
            // Cuánto pesa la cantidad de vecinos: el precio del primer NPC con 0, 1, 2… vecinos que le dan igual.
            b.Append(",\n\"crowd\":[");
            {
                int who = town[0];
                List<int> neutral = new List<int>();
                npcs.SetValue(Activator.CreateInstance(npcT), 1);
                double alone = price(place(0, who, 500));
                foreach (int other in town)
                {
                    if (other == who) continue;
                    object na = place(0, who, 500);
                    place(1, other, 503);
                    if (Math.Abs(price(na) / alone - 1) < 0.005) neutral.Add(other);
                }
                for (int k = 0; k <= 8 && k <= neutral.Count; k++)
                {
                    for (int slot = 1; slot <= 9; slot++) npcs.SetValue(Activator.CreateInstance(npcT), slot);
                    object na = place(0, who, 500);
                    for (int j = 0; j < k; j++) place(1 + j, neutral[j], 501 + j);
                    if (k > 0) b.Append(',');
                    b.Append(price(na).ToString("R", CultureInfo.InvariantCulture));
                }
            }
            b.Append("]}");
            Write("neighbors.json", b);
            Console.WriteLine("vecinos: " + town.Count + " NPC, " + errors + " errores");
        });

        // Los peces que pide el Pescador en sus misiones.
        Step("pesca", delegate
        {
            Array quest = (Array)Get(main, "anglerQuestItemNetIDs");
            StringBuilder b = new StringBuilder("{\"quest\":");
            Value(b, quest, itemT);
            b.Append("}");
            Write("fishing.json", b);
            Console.WriteLine("pesca: " + (quest == null ? 0 : quest.Length) + " peces de misión");
        });
        Fishing(itemT);
        Containers(main, itemT);
        Shops(main, itemT);
        Chests(main, itemT);
        return 0;
    }

    static object NewRandom(int seed) { return Activator.CreateInstance(T("Terraria.Utilities.UnifiedRandom"), seed); }

    /// Qué se pesca y dónde: en 1.4.5 es una tabla de reglas (objetos, chance, condiciones y rareza), y sale tal cual.
    /// El orden importa: el juego prueba las reglas de arriba abajo y se queda con la primera que sale.
    static void Fishing(Type itemT)
    {
        Step("reglas de pesca", delegate
        {
            string ns = "Terraria.GameContent.FishDropRules.";
            Type listT = T(ns + "FishDropRuleList"), popT = T(ns + "GameContentFishDropPopulator"), baseT = T(ns + "AFishDropRulePopulator"), ruleT = T(ns + "FishDropRule");
            object list = Activator.CreateInstance(listT, true);
            object pop = null;
            foreach (ConstructorInfo c in popT.GetConstructors(All))
            {
                ParameterInfo[] ps = c.GetParameters();
                object[] args = new object[ps.Length];
                for (int k = 0; k < ps.Length; k++) args[k] = ps[k].ParameterType == listT ? list : null;
                pop = c.Invoke(args);
                break;
            }
            FieldInfo lf = baseT.GetField("_list", All);
            if (lf.GetValue(pop) == null) lf.SetValue(pop, list); else list = lf.GetValue(pop);
            Call(popT, "Populate", pop);

            // Las condiciones y las rarezas no llevan nombre: se reconocen por ser el mismo objeto que un campo del armador.
            Dictionary<object, string> names = new Dictionary<object, string>();
            foreach (Type t in new[] { baseT, T(ns + "AFishDropRulePopulator+Rarity"), T(ns + "FishingConditions") })
                foreach (FieldInfo f in t.GetFields(All))
                {
                    object v = f.IsStatic ? f.GetValue(null) : (t.IsInstanceOfType(pop) ? f.GetValue(pop) : null);
                    if (v != null && !v.GetType().IsValueType && !(v is string) && !names.ContainsKey(v)) names[v] = f.Name;
                }
            Func<object, string> nameOf = delegate (object c)
            {
                if (c == null) return "";
                if (names.ContainsKey(c)) return names[c];
                FieldInfo ct = c.GetType().GetField("CheckedType", All);
                return c.GetType().Name + (ct == null ? "" : ":" + ct.GetValue(c));
            };

            StringBuilder b = new StringBuilder("[");
            int n = 0;
            foreach (object rule in (IEnumerable)Get(listT, "_rules", list))
            {
                if (n++ > 0) b.Append(",\n");
                b.Append("{\"items\":");
                Value(b, Get(ruleT, "PossibleItems", rule) ?? new int[0], itemT);
                b.Append(",\"num\":").Append(Get(ruleT, "ChanceNumerator", rule)).Append(",\"den\":").Append(Get(ruleT, "ChanceDenominator", rule));
                b.Append(",\"rarity\":").Append(Esc(nameOf(Get(ruleT, "Rarity", rule)))).Append(",\"if\":[");
                bool first = true;
                IEnumerable conds = (IEnumerable)Get(ruleT, "Conditions", rule);
                if (conds != null)
                    foreach (object c in conds)
                    {
                        if (!first) b.Append(',');
                        first = false;
                        b.Append(Esc(nameOf(c)));
                    }
                b.Append("]}");
            }
            b.Append("]");
            Write("fishrules.json", b);
            Console.WriteLine("reglas de pesca: " + n);
        });
    }

    /// Lo que sale al abrir bolsas de jefe, cajas de pesca y demás: en 1.4.5 es código, no una tabla. Se abre cada una
    /// miles de veces con un jugador de mentira y se cuenta lo que cae. La semilla es fija: el volcado sale siempre igual.
    static void Containers(Type main, Type itemT)
    {
        Step("bolsas y cajas", delegate
        {
            const int Opens = 20000;
            Type playerT = T("Terraria.Player"), sets = T("Terraria.ID.ItemID+Sets");
            main.GetField("rand", All).SetValue(null, NewRandom(20261012));
            main.GetField("myPlayer", All).SetValue(null, 0);
            Array players = (Array)Get(main, "player");
            object player = players.GetValue(0);
            SetAny(player, "active", true);
            Step("mundo en modo difícil y experto", delegate
            {
                main.GetField("hardMode", All).SetValue(null, true);
                PropertyInfo wf = main.GetProperty("ActiveWorldFileData", All);
                FieldInfo wff = main.GetField("ActiveWorldFileData", All);
                object data = wf != null ? wf.GetValue(null, null) : wff.GetValue(null);
                if (data == null)
                {
                    data = Activator.CreateInstance(T("Terraria.IO.WorldFileData"), true);
                    if (wf != null) wf.SetValue(null, data, null); else wff.SetValue(null, data);
                }
                main.GetProperty("GameMode", All).SetValue(null, 1, null);
            });

            Array world = (Array)Get(main, "item");
            Type wT = world.GetType().GetElementType();
            for (int i = 0; i < world.Length; i++) if (world.GetValue(i) == null) world.SetValue(Activator.CreateInstance(wT), i);
            PropertyInfo activeP = wT.GetProperty("active", All), typeP = wT.GetProperty("type", All), stackP = wT.GetProperty("stack", All);
            MethodInfo toAir = wT.GetMethod("TurnToAir", All);

            int count = Convert.ToInt32(T("Terraria.ID.ItemID").GetField("Count").GetValue(null));
            bool[] bossBag = (bool[])Get(sets, "BossBag"), crate = (bool[])Get(sets, "IsFishingCrate");
            int[] extract = (int[])Get(sets, "ExtractinatorMode");
            MethodInfo grant = T("Terraria.UI.ItemSlot").GetMethod("TryOpenContainer_GrantItems", All);
            MethodInfo extractinate = null, setDefaults = null;
            foreach (MethodInfo m in playerT.GetMethods(All)) if (m.Name == "DropItemFromExtractinator" && m.GetParameters().Length == 2) extractinate = m;
            foreach (MethodInfo m in itemT.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                if (m.Name == "SetDefaults" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType == typeof(int) && (setDefaults == null || m.GetParameters().Length < setDefaults.GetParameters().Length)) setDefaults = m;

            // Lo que dejó abrir: va al inventario del jugador y, si no entra, al piso. Se cuenta y se vacía.
            main.GetField("showItemText", All).SetValue(null, false);
            Array inv = (Array)Get(playerT, "inventory", player);
            FieldInfo typeF = itemT.GetField("type", All), stackF = itemT.GetField("stack", All);
            MethodInfo airItem = itemT.GetMethod("TurnToAir", All);
            Func<Dictionary<int, int[]>, bool> collect = delegate (Dictionary<int, int[]> seen)
            {
                Dictionary<int, int> got = new Dictionary<int, int>();
                for (int s = 0; s < inv.Length; s++)
                {
                    object it = inv.GetValue(s);
                    int type = (int)typeF.GetValue(it);
                    if (type <= 0) continue;
                    int c; got.TryGetValue(type, out c); got[type] = c + (int)stackF.GetValue(it);
                    airItem.Invoke(it, airItem.GetParameters().Length == 0 ? null : new object[] { false });
                }
                for (int s = 0; s < world.Length; s++)
                {
                    object it = world.GetValue(s);
                    if (!(bool)activeP.GetValue(it, null)) break;
                    int type = (int)typeP.GetValue(it, null);
                    int c; got.TryGetValue(type, out c); got[type] = c + (int)stackP.GetValue(it, null);
                    toAir.Invoke(it, null);
                }
                if (seen != null)
                    foreach (KeyValuePair<int, int> kv in got)
                    {
                        int[] row;
                        if (!seen.TryGetValue(kv.Key, out row)) seen[kv.Key] = row = new[] { 0, kv.Value, kv.Value };
                        row[0]++;
                        if (kv.Value < row[1]) row[1] = kv.Value;
                        if (kv.Value > row[2]) row[2] = kv.Value;
                    }
                return got.Count > 0;
            };
            for (int i = 0; i < inv.Length; i++) if (inv.GetValue(i) == null) inv.SetValue(Activator.CreateInstance(itemT), i);
            collect(null);

            StringBuilder b = new StringBuilder("{");
            int done = 0;
            Action<string, string, int, MethodInfo, object, object[]> run = delegate (string key, string kind, int opens, MethodInfo open, object target, object[] args)
            {
                Dictionary<int, int[]> seen = new Dictionary<int, int[]>();
                int fails = 0;
                for (int k = 0; k < opens; k++)
                {
                    try { open.Invoke(target, args); }
                    catch (Exception e) { if (fails++ == 0) { Exception x = e; while (x.InnerException != null) x = x.InnerException; Console.WriteLine("   abrir " + key + ": " + x.Message + " " + (x.StackTrace ?? "").Split('\n')[0].Trim()); } if (fails > 20) break; }
                    collect(seen);
                }
                if (done++ > 0) b.Append(",\n");
                b.Append(Esc(key)).Append(":{\"kind\":").Append(Esc(kind)).Append(",\"opens\":").Append(opens).Append(",\"fails\":").Append(fails).Append(",\"items\":{");
                bool first = true;
                foreach (KeyValuePair<int, int[]> kv in seen)
                {
                    if (!first) b.Append(',');
                    first = false;
                    b.Append('"').Append(kv.Key).Append("\":[").Append(kv.Value[0]).Append(',').Append(kv.Value[1]).Append(',').Append(kv.Value[2]).Append(']');
                }
                b.Append("}}");
            };
            // Los cofres con candado piden la llave en el inventario: se abren con su método, sin pasar por ahí.
            MethodInfo lockBox = playerT.GetMethod("OpenLockBox", All), shadowBox = playerT.GetMethod("OpenShadowLockbox", All);
            FieldInfo crimsonF = T("Terraria.WorldGen").GetField("crimson", All);
            // Dos pasadas: mundo con Corrupción y mundo con Carmesí (cambia, por ejemplo, la bolsa del Ojo de Cthulhu).
            foreach (bool crimson in new[] { false, true })
            {
                crimsonF.SetValue(null, crimson);
                for (int id = 1; id < count; id++)
                {
                    object item = Activator.CreateInstance(itemT);
                    object[] sd = new object[setDefaults.GetParameters().Length];
                    sd[0] = id;
                    for (int k = 1; k < sd.Length; k++) { ParameterInfo p = setDefaults.GetParameters()[k]; sd[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                    setDefaults.Invoke(item, sd);
                    string key = id + (crimson ? ":crimson" : "");
                    if (id == 3085 || id == 4879) { run(key, "open", Opens, id == 3085 ? lockBox : shadowBox, player, new object[] { id }); continue; }
                    object[] args = new object[] { item, player };
                    // ¿Se abre? Se prueba unas veces: lo que no es un contenedor no devuelve nada.
                    bool opens = false;
                    try { for (int k = 0; k < 3 && !opens; k++) { object r = grant.Invoke(null, args); opens = collect(null) || (r is bool && (bool)r); } }
                    catch (Exception e) { collect(null); if (bossBag[id] || crate[id]) { Exception x = e; while (x.InnerException != null) x = x.InnerException; Console.WriteLine("   probar " + id + ": " + x.Message + " " + (x.StackTrace ?? "").Split('\n')[0].Trim()); } }
                    if (opens) run(key, bossBag[id] ? "bag" : crate[id] ? "crate" : "open", Opens, grant, null, args);
                }
            }
            crimsonF.SetValue(null, false);
            // El extractor (219) y el de clorofita (642), con cada tabla de materiales.
            MethodInfo use = null;
            foreach (MethodInfo m in playerT.GetMethods(All)) if (m.Name == "ExtractinatorUse" && m.GetParameters().Length == 2) use = m;
            HashSet<int> modes = new HashSet<int>();
            for (int id = 1; id < count; id++) if (extract[id] >= 0) modes.Add(extract[id]);
            foreach (int mode in modes)
                foreach (int block in new[] { 219, 642 })
                    run("x" + mode + "_" + block, "extract", 200000, use, player, new object[] { mode, block });
            // Qué objetos van al extractor y con qué tabla, y en qué se convierte cada objeto en el Shimmer.
            b.Append(",\n\"extractMode\":{");
            bool f1 = true;
            for (int id = 1; id < count; id++) if (extract[id] >= 0) { if (!f1) b.Append(','); f1 = false; b.Append('"').Append(id).Append("\":").Append(extract[id]); }
            b.Append("},\"shimmer\":{");
            f1 = true;
            int[] shimmer = (int[])Get(sets, "ShimmerTransformToItem");
            for (int id = 1; id < count; id++) if (shimmer[id] > 0) { if (!f1) b.Append(','); f1 = false; b.Append('"').Append(id).Append("\":").Append(shimmer[id]); }
            b.Append("}}");
            Write("containers.json", b);
            Console.WriteLine("bolsas y cajas: " + done);
        });
    }

    /// Qué trae cada cofre: lo decide la generación del mundo, así que se abren los mundos que generó `worlds.ps1`
    /// (cache/worlds/*.wld) con el lector del juego y se anota cada cofre con su tipo, su profundidad y su contenido.
    static void Chests(Type main, Type itemT)
    {
        string dir = Path.Combine(outDir, "worlds");
        if (!Directory.Exists(dir)) { Console.WriteLine("cofres: no hay mundos (correr worlds.ps1)"); return; }
        Step("cofres", delegate
        {
            Type wf = T("Terraria.IO.WorldFile"), tileT = T("Terraria.Tile"), chestT = T("Terraria.Chest");
            FieldInfo tileF = main.GetField("tile", All), typeF = tileT.GetField("type", All), frameF = tileT.GetField("frameX", All), wallF = tileT.GetField("wall", All);
            FieldInfo itemsF = chestT.GetField("item", All), cx = chestT.GetField("x", All), cy = chestT.GetField("y", All);
            FieldInfo itF = itemT.GetField("type", All), stF = itemT.GetField("stack", All);
            MethodInfo load = wf.GetMethod("LoadWorld_Version2", All), locked = chestT.GetMethod("IsLocked", All, null, new[] { typeof(int), typeof(int) }, null);
            // El lector limpia el mundo anterior antes de cargar, y eso pide el juego inicializado como lo deja el servidor.
            Step("inicialización del juego", delegate
            {
                object instance = Get(main, "instance");
                if (instance == null) instance = Activator.CreateInstance(main, true);
                main.GetMethod("Initialize", All, null, Type.EmptyTypes, null).Invoke(instance, null);
            });
            StringBuilder b = new StringBuilder("[");
            int total = 0;
            string[] files = Directory.GetFiles(dir, "*.wld");
            Array.Sort(files);
            foreach (string file in files)
            {
                Array tiles = (Array)tileF.GetValue(null);
                int w = tiles.GetLength(0), h = tiles.GetLength(1);
                for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) if (tiles.GetValue(x, y) == null) tiles.SetValue(Activator.CreateInstance(tileT), x, y);
                Array chests = (Array)Get(main, "chest");
                for (int i = 0; i < chests.Length; i++) chests.SetValue(null, i);
                // Lo que viene después de los cofres en el archivo (carteles, NPC, entidades) puede fallar sin mundo
                // armado: para entonces los cofres ya están leídos.
                using (BinaryReader reader = new BinaryReader(File.OpenRead(file)))
                    Step("lectura de " + Path.GetFileName(file) + " (lo que sigue a los cofres puede fallar sin consecuencias)", delegate { load.Invoke(null, new object[] { reader }); });
                double surface = Convert.ToDouble(Get(main, "worldSurface")), rock = Convert.ToDouble(Get(main, "rockLayer"));
                int hell = Convert.ToInt32(Get(main, "UnderworldLayer")), maxX = Convert.ToInt32(Get(main, "maxTilesX"));
                int n = 0;
                foreach (object chest in chests)
                {
                    if (chest == null) continue;
                    int x = (int)cx.GetValue(chest), y = (int)cy.GetValue(chest);
                    object tile = tiles.GetValue(x, y);
                    if (total++ > 0) b.Append(",\n");
                    n++;
                    b.Append("{\"world\":").Append(Esc(Path.GetFileNameWithoutExtension(file)))
                        .Append(",\"tile\":").Append(Convert.ToInt32(typeF.GetValue(tile)))
                        .Append(",\"style\":").Append(Convert.ToInt32(frameF.GetValue(tile)) / 36)
                        .Append(",\"wall\":").Append(Convert.ToInt32(wallF.GetValue(tile)))
                        .Append(",\"locked\":").Append((bool)locked.Invoke(null, new object[] { x, y }) ? "true" : "false")
                        // 0 cielo y superficie, 1 subsuelo, 2 cavernas, 3 inframundo
                        .Append(",\"layer\":").Append(y >= hell ? 3 : y >= rock ? 2 : y >= surface ? 1 : 0)
                        .Append(",\"edge\":").Append(x < 380 || x > maxX - 380 ? "true" : "false")
                        .Append(",\"items\":[");
                    bool first = true;
                    foreach (object it in (Array)itemsF.GetValue(chest))
                    {
                        if (it == null) continue;
                        int type = (int)itF.GetValue(it);
                        if (type <= 0) continue;
                        if (!first) b.Append(',');
                        first = false;
                        b.Append('[').Append(type).Append(',').Append(stF.GetValue(it)).Append(']');
                    }
                    b.Append("]}");
                }
                Console.WriteLine("   " + Path.GetFileName(file) + ": " + n + " cofres");
            }
            b.Append("]");
            Write("chests.json", b);
            // Qué objeto deja cada tipo de cofre al romperlo: de ahí sale su nombre.
            StringBuilder nb = new StringBuilder("{");
            MethodInfo drop = T("Terraria.WorldGen").GetMethod("GetItemDrop_Chests", All, null, new[] { typeof(int), typeof(bool) }, null);
            bool f1 = true;
            foreach (bool second in new[] { false, true })
                for (int style = 0; style < 60; style++)
                {
                    int item = 0;
                    try { item = (int)drop.Invoke(null, new object[] { style, second }); } catch (Exception) { }
                    if (item <= 0) continue;
                    if (!f1) nb.Append(',');
                    f1 = false;
                    nb.Append('"').Append(second ? 467 : 21).Append(':').Append(style).Append("\":").Append(item);
                }
            nb.Append("}");
            Write("chestnames.json", nb);
            Console.WriteLine("cofres: " + total + " en " + files.Length + " mundos");
        });
    }

    /// Qué vende cada NPC. La tienda es código (`Chest.SetupShop`), así que se le pregunta: primero con el mundo recién
    /// creado, después prendiendo de a una cada condición (jefe vencido, bioma, fase de la luna…). Lo que aparece o
    /// desaparece en cada caso dice de qué depende. `shops_data.py` lo traduce.
    static void Shops(Type main, Type itemT)
    {
        Step("tiendas", delegate
        {
            Type npcT = T("Terraria.NPC"), chestT = T("Terraria.Chest"), playerT = T("Terraria.Player");
            main.GetField("rand", All).SetValue(null, NewRandom(20261012));
            main.GetField("myPlayer", All).SetValue(null, 0);
            object player = ((Array)Get(main, "player")).GetValue(0);
            Array npcs = (Array)Get(main, "npc");
            for (int i = 0; i < npcs.Length; i++) npcs.SetValue(Activator.CreateInstance(npcT), i);
            // La Zoóloga mira cuánto del Bestiario está completo: sin mundo no hay Bestiario, se arma uno.
            FieldInfo dbF = main.GetField("BestiaryDB", All), trackF = main.GetField("BestiaryTracker", All);
            bool bestiary = Step("bestiario", delegate
            {
                Step("muestras de contenido", delegate { Call(T("Terraria.ID.ContentSamples"), "Initialize", null); });
                object db = Activator.CreateInstance(dbF.FieldType, true);
                Type popT = T("Terraria.GameContent.Bestiary.BestiaryDatabaseNPCsPopulator");
                Call(popT, "Populate", Activator.CreateInstance(popT, true), db);
                dbF.SetValue(null, db);
                trackF.SetValue(null, Activator.CreateInstance(trackF.FieldType, true));
            });
            if (!bestiary)
            {
                if (dbF.GetValue(null) == null) dbF.SetValue(null, Activator.CreateInstance(dbF.FieldType, true));
                if (trackF.GetValue(null) == null) trackF.SetValue(null, Activator.CreateInstance(trackF.FieldType, true));
            }

            // Las condiciones: nombre → cómo se prende y se apaga.
            List<string> names = new List<string>();
            Dictionary<string, Action<bool>> set = new Dictionary<string, Action<bool>>();
            Action<string, Action<bool>> add = delegate (string n, Action<bool> s) { names.Add(n); set[n] = s; };
            foreach (FieldInfo f0 in npcT.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            {
                FieldInfo f = f0;
                if (f.FieldType == typeof(bool) && !f.IsLiteral && !f.IsInitOnly) add("NPC." + f.Name, delegate (bool on) { f.SetValue(null, on); });
            }
            System.Text.RegularExpressions.Regex mainOk = new System.Text.RegularExpressions.Regex("^(hardMode|bloodMoon|eclipse|xMas|halloween|pumpkinMoon|snowMoon|raining|slimeRain|.*World)$");
            foreach (FieldInfo f0 in main.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            {
                FieldInfo f = f0;
                if (f.FieldType == typeof(bool) && !f.IsLiteral && !f.IsInitOnly && mainOk.IsMatch(f.Name)) add("Main." + f.Name, delegate (bool on) { f.SetValue(null, on); });
            }
            FieldInfo day = main.GetField("dayTime", All);
            add("night", delegate (bool on) { day.SetValue(null, !on); });
            FieldInfo crimson = T("Terraria.WorldGen").GetField("crimson", All);
            add("WorldGen.crimson", delegate (bool on) { crimson.SetValue(null, on); });
            foreach (FieldInfo f0 in T("Terraria.GameContent.Events.DD2Event").GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            {
                FieldInfo f = f0;
                if (f.FieldType == typeof(bool) && !f.IsLiteral && !f.IsInitOnly && f.Name.StartsWith("Downed")) add("DD2." + f.Name, delegate (bool on) { f.SetValue(null, on); });
            }
            foreach (FieldInfo f0 in T("Terraria.GameContent.Events.BirthdayParty").GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            {
                FieldInfo f = f0;
                if (f.FieldType == typeof(bool) && !f.IsLiteral && !f.IsInitOnly && f.Name.Contains("Party")) add("Party." + f.Name, delegate (bool on) { f.SetValue(null, on); });
            }
            foreach (PropertyInfo p0 in playerT.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                PropertyInfo p = p0;
                if (p.PropertyType == typeof(bool) && p.CanWrite && p.Name.StartsWith("Zone")) add("Player." + p.Name, delegate (bool on) { p.SetValue(player, on, null); });
            }
            FieldInfo golf = playerT.GetField("golferScoreAccumulated", All);
            if (golf != null) add("golf", delegate (bool on) { golf.SetValue(player, on ? 100000 : 0); });
            // Cada NPC del pueblo presente en el mundo: algunos venden cosas según quién más vive ahí.
            int npcCount = Convert.ToInt32(T("Terraria.ID.NPCID").GetField("Count").GetValue(null));
            MethodInfo npcSet = null;
            foreach (MethodInfo m in npcT.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                if (m.Name == "SetDefaults" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType == typeof(int)) npcSet = m;
            int slots = 5;
            for (int t0 = 1; t0 < npcCount; t0++)
            {
                int t = t0, slot = slots;
                object probe = Activator.CreateInstance(npcT);
                try
                {
                    object[] args = new object[npcSet.GetParameters().Length];
                    args[0] = t;
                    for (int k = 1; k < args.Length; k++) { ParameterInfo p = npcSet.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                    npcSet.Invoke(probe, args);
                    if (!(bool)Get(npcT, "townNPC", probe)) continue;
                }
                catch (Exception) { continue; }
                slots++;
                add("npc:" + t, delegate (bool on)
                {
                    object n = Activator.CreateInstance(npcT);
                    if (on)
                    {
                        object[] args = new object[npcSet.GetParameters().Length];
                        args[0] = t;
                        for (int k = 1; k < args.Length; k++) { ParameterInfo p = npcSet.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                        npcSet.Invoke(n, args);
                        SetAny(n, "active", true);
                    }
                    npcs.SetValue(n, slot);
                });
            }

            FieldInfo moon = main.GetField("moonPhase", All);
            FieldInfo itemsF = chestT.GetField("item", All), typeF = itemT.GetField("type", All), curF = itemT.GetField("shopSpecialCurrency", All);
            MethodInfo storeValue = itemT.GetMethod("GetStoreValue", All);
            Dictionary<int, Dictionary<int, long[]>> prices = new Dictionary<int, Dictionary<int, long[]>>();
            int errors = 0;
            Func<int, List<int>> stock = delegate (int shop)
            {
                object chest = Call(chestT, "CreateShop", null);
                List<int> got = new List<int>();
                try { Call(chestT, "SetupShop", chest, shop); }
                catch (Exception e) { if (errors++ < 6) { Exception x = e; while (x.InnerException != null) x = x.InnerException; Console.WriteLine("   tienda " + shop + ": " + x.Message + " " + (x.StackTrace ?? "").Split('\n')[0].Trim()); } }
                foreach (object it in (Array)itemsF.GetValue(chest))
                {
                    if (it == null) continue;
                    int type = (int)typeF.GetValue(it);
                    if (type <= 0) continue;
                    got.Add(type);
                    if (!prices.ContainsKey(shop)) prices[shop] = new Dictionary<int, long[]>();
                    if (!prices[shop].ContainsKey(type)) prices[shop][type] = new[] { Convert.ToInt64(storeValue.Invoke(it, null)), Convert.ToInt64(curF.GetValue(it)) };
                }
                return got;
            };

            const int MaxShop = 30;
            Action reset = delegate { foreach (string n in names) set[n](false); moon.SetValue(null, 0); };
            StringBuilder b = new StringBuilder("{\"states\":{");
            int states = 0;
            Action<string> snap = delegate (string state)
            {
                if (states++ > 0) b.Append(",\n");
                b.Append(Esc(state)).Append(":{");
                bool first = true;
                for (int shop = 1; shop <= MaxShop; shop++)
                {
                    List<int> got = stock(shop);
                    if (got.Count == 0) continue;
                    if (!first) b.Append(',');
                    first = false;
                    b.Append('"').Append(shop).Append("\":[");
                    for (int k = 0; k < got.Count; k++) { if (k > 0) b.Append(','); b.Append(got[k]); }
                    b.Append(']');
                }
                b.Append('}');
            };
            reset();
            snap("base");
            foreach (string n in names)
            {
                reset();
                try { set[n](true); } catch (Exception) { Console.WriteLine("   no se pudo prender " + n); continue; }
                snap(n);
            }
            for (int phase = 1; phase < 8; phase++) { reset(); moon.SetValue(null, phase); snap("moon:" + phase); }
            for (int phase0 = 1; phase0 < 8; phase0++) { int phase = phase0; add("moon:" + phase, delegate (bool on) { if (on) moon.SetValue(null, phase); }); }
            // Todo prendido a la vez (de día y de noche, en cada fase de la luna): lo que sólo aparece acá depende de más
            // de una condición.
            for (int phase = 0; phase < 8; phase++)
                foreach (bool night in new[] { false, true })
                    foreach (bool crim in new[] { false, true })
                    {
                        foreach (string n in names) if (!n.StartsWith("npc:") && !n.StartsWith("moon:") && !n.EndsWith("World")) try { set[n](true); } catch (Exception) { }
                        set["night"](night);
                        set["WorldGen.crimson"](crim);
                        moon.SetValue(null, phase);
                        snap("all:" + phase + (night ? ":night" : ":day") + (crim ? ":crimson" : ":corruption"));
                    }
            reset();
            // De a dos: sólo se anota lo que no aparece con el mundo recién creado ni con ninguna de las dos por separado.
            b.Append("},\n\"pairs\":[");
            {
                Dictionary<string, HashSet<int>[]> alone = new Dictionary<string, HashSet<int>[]>();
                Func<HashSet<int>[]> all = delegate
                {
                    HashSet<int>[] r = new HashSet<int>[MaxShop + 1];
                    for (int shop = 1; shop <= MaxShop; shop++) r[shop] = new HashSet<int>(stock(shop));
                    return r;
                };
                HashSet<int>[] zero = all();
                foreach (string n in names) { reset(); set[n](true); alone[n] = all(); }
                int found = 0;
                HashSet<long> pairFound = new HashSet<long>();
                StringBuilder minus = new StringBuilder();
                System.Text.RegularExpressions.Regex when = new System.Text.RegularExpressions.Regex("^(night|moon:.*|Main.bloodMoon|Main.eclipse)$");
                for (int i = 0; i < names.Count; i++)
                    for (int j = i + 1; j < names.Count; j++)
                    {
                        string x = names[i], y = names[j];
                        if (x.StartsWith("moon:") && y.StartsWith("moon:")) continue;
                        reset();
                        set[x](true);
                        set[y](true);
                        for (int shop = 1; shop <= MaxShop; shop++)
                        {
                            HashSet<int> cur = new HashSet<int>(stock(shop));
                            foreach (int type in cur)
                                if (!zero[shop].Contains(type) && !alone[x][shop].Contains(type) && !alone[y][shop].Contains(type))
                                {
                                    pairFound.Add(shop * 100000L + type);
                                    if (found++ > 0) b.Append(",\n");
                                    b.Append('[').Append(shop).Append(',').Append(type).Append(',').Append(Esc(x)).Append(',').Append(Esc(y)).Append(']');
                                }
                            // Y al revés: lo que una condición trae y la hora, la luna o un evento le sacan.
                            foreach (string[] xy in new[] { new[] { x, y }, new[] { y, x } })
                                if (when.IsMatch(xy[1]) && !when.IsMatch(xy[0]))
                                    foreach (int type in alone[xy[0]][shop])
                                        if (!zero[shop].Contains(type) && !cur.Contains(type))
                                            minus.Append(minus.Length > 0 ? ",\n" : "").Append('[').Append(shop).Append(',').Append(type).Append(',').Append(Esc(xy[0])).Append(',').Append(Esc(xy[1])).Append(']');
                        }
                    }
                b.Append("],\n\"minus\":[").Append(minus);
                reset();

                // Lo que pide tres o más: se parte de todo prendido y se apaga de a una; lo que no se puede apagar sin
                // que el objeto desaparezca es lo que hace falta.
                b.Append("],\n\"reduced\":[");
                HashSet<long> explained = new HashSet<long>();
                for (int shop = 1; shop <= MaxShop; shop++)
                {
                    foreach (int type in zero[shop]) explained.Add(shop * 100000L + type);
                    foreach (string n in names) foreach (int type in alone[n][shop]) explained.Add(shop * 100000L + type);
                }
                foreach (long key in pairFound) explained.Add(key);
                int reduced = 0;
                foreach (bool night in new[] { false, true })
                    foreach (bool crim in new[] { false, true })
                        for (int phase = 0; phase < 8; phase++)
                        {
                            Action everything = delegate
                            {
                                reset();
                                foreach (string n in names) if (!n.StartsWith("npc:") && !n.StartsWith("moon:") && !n.EndsWith("World")) set[n](true);
                                set["night"](night);
                                set["WorldGen.crimson"](crim);
                                moon.SetValue(null, phase);
                            };
                            everything();
                            for (int shop = 1; shop <= MaxShop; shop++)
                                foreach (int type in stock(shop))
                                {
                                    if (!explained.Add(shop * 100000L + type)) continue;
                                    List<string> on = new List<string>();
                                    foreach (string n in names) if (!n.StartsWith("npc:") && !n.StartsWith("moon:") && !n.EndsWith("World") && (n != "night" || night) && (n != "WorldGen.crimson" || crim)) on.Add(n);
                                    List<string> need = new List<string>();
                                    foreach (string n in new List<string>(on))
                                    {
                                        set[n](false);
                                        if (stock(shop).Contains(type)) on.Remove(n);
                                        else { set[n](true); need.Add(n); }
                                    }
                                    // ¿Importa la fase de la luna?
                                    List<int> phases = new List<int>();
                                    for (int ph = 0; ph < 8; ph++) { moon.SetValue(null, ph); if (stock(shop).Contains(type)) phases.Add(ph); }
                                    if (reduced++ > 0) b.Append(",\n");
                                    b.Append('[').Append(shop).Append(',').Append(type).Append(",[");
                                    for (int k = 0; k < need.Count; k++) { if (k > 0) b.Append(','); b.Append(Esc(need[k])); }
                                    b.Append("],[");
                                    for (int k = 0; k < phases.Count; k++) { if (k > 0) b.Append(','); b.Append(phases[k]); }
                                    b.Append("]]");
                                    everything();
                                }
                        }
                reset();
            }
            // La Zoóloga: se va completando el Bestiario de a un bicho y se anota con qué porcentaje aparece cada cosa.
            b.Append("],\n\"bestiary\":[");
            if (bestiary)
                Step("barrido del bestiario", delegate
                {
                    object tracker = trackF.GetValue(null);
                    Type tt = tracker.GetType();
                    object kills = Get(tt, "Kills", tracker), sights = Get(tt, "Sights", tracker), chats = Get(tt, "Chats", tracker);
                    HashSet<string> done = new HashSet<string>();
                    HashSet<int> have = new HashSet<int>();
                    int rows = 0;
                    reset();
                    for (int t = -66; t < npcCount; t++)
                    {
                        if (t != -66)
                        {
                            if (t == 0) continue;
                            string id;
                            try
                            {
                                object n = Activator.CreateInstance(npcT);
                                object[] args = new object[npcSet.GetParameters().Length];
                                args[0] = t;
                                for (int k = 1; k < args.Length; k++) { ParameterInfo p = npcSet.GetParameters()[k]; args[k] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null; }
                                npcSet.Invoke(n, args);
                                id = (string)Call(npcT, "GetBestiaryCreditId", n);
                            }
                            catch (Exception) { continue; }
                            if (id == null || !done.Add(id)) continue;
                            Call(kills.GetType(), "SetKillCountDirectly", kills, id, 9999);
                            Call(sights.GetType(), "SetWasSeenDirectly", sights, id);
                            Call(chats.GetType(), "SetWasChatWithDirectly", chats, id);
                        }
                        List<int> got = stock(23);
                        bool news = false;
                        foreach (int type in got) if (have.Add(type)) news = true;
                        if (!news) continue;
                        object report = Call(main, "GetBestiaryProgressReport", null);
                        if (rows++ > 0) b.Append(",\n");
                        b.Append('[').Append(Prim(Get(report.GetType(), "CompletionPercent", report))).Append(",[");
                        for (int k = 0; k < got.Count; k++) { if (k > 0) b.Append(','); b.Append(got[k]); }
                        b.Append("]]");
                    }
                    trackF.SetValue(null, Activator.CreateInstance(trackF.FieldType, true));
                });
            b.Append("],\n\"prices\":{");
            bool f1 = true;
            foreach (KeyValuePair<int, Dictionary<int, long[]>> s in prices)
            {
                if (!f1) b.Append(",\n");
                f1 = false;
                b.Append('"').Append(s.Key).Append("\":{");
                bool f2 = true;
                foreach (KeyValuePair<int, long[]> kv in s.Value)
                {
                    if (!f2) b.Append(',');
                    f2 = false;
                    b.Append('"').Append(kv.Key).Append("\":[").Append(kv.Value[0]).Append(',').Append(kv.Value[1]).Append(']');
                }
                b.Append('}');
            }
            b.Append("}");

            // El Mercader ambulante trae una selección al azar: se le arma la tienda miles de veces en cada estado.
            Step("mercader ambulante", delegate
            {
                const int Visits = 4000;
                FieldInfo travelF = main.GetField("travelShop", All);
                b.Append(",\n\"travel\":{\"visits\":").Append(Visits).Append(",\"states\":{");
                int tstates = 0;
                HashSet<int> everSeen = new HashSet<int>(), allSeen = new HashSet<int>();
                Action<string> visit = delegate (string state)
                {
                    Dictionary<int, int> seen = new Dictionary<int, int>();
                    for (int k = 0; k < Visits; k++)
                    {
                        Call(chestT, "SetupTravelShop", null);
                        foreach (int type in (int[])travelF.GetValue(null))
                            if (type > 0) { int c; seen.TryGetValue(type, out c); seen[type] = c + 1; }
                    }
                    if (tstates++ > 0) b.Append(",\n");
                    b.Append(Esc(state)).Append(":{");
                    bool first = true;
                    foreach (KeyValuePair<int, int> kv in seen) { if (!first) b.Append(','); first = false; b.Append('"').Append(kv.Key).Append("\":").Append(kv.Value); (state == "all" ? allSeen : everSeen).Add(kv.Key); }
                    b.Append('}');
                };
                reset();
                visit("base");
                foreach (string n in names)
                {
                    if (n.StartsWith("npc:") || n.StartsWith("Player.") || n.StartsWith("moon:")) continue;
                    reset();
                    set[n](true);
                    visit(n);
                }
                foreach (string n in names) if (!n.StartsWith("npc:") && !n.StartsWith("moon:") && !n.EndsWith("World")) set[n](true);
                visit("all");
                b.Append("},\"reduced\":{");
                {
                    HashSet<int> known = new HashSet<int>(everSeen);
                    Func<int, int, bool> shows = delegate (int type, int tries)
                    {
                        for (int k = 0; k < tries; k++)
                        {
                            Call(chestT, "SetupTravelShop", null);
                            if (Array.IndexOf((int[])travelF.GetValue(null), type) >= 0) return true;
                        }
                        return false;
                    };
                    int n2 = 0;
                    foreach (int type in new List<int>(allSeen))
                    {
                        if (known.Contains(type)) continue;
                        List<string> need = new List<string>();
                        foreach (string n in names)
                        {
                            if (n.StartsWith("npc:") || n.StartsWith("moon:") || n.StartsWith("Player.") || n.EndsWith("World")) continue;
                            set[n](false);
                            if (!shows(type, 3000)) { set[n](true); need.Add(n); }
                        }
                        if (n2++ > 0) b.Append(',');
                        b.Append('"').Append(type).Append("\":[");
                        for (int k = 0; k < need.Count; k++) { if (k > 0) b.Append(','); b.Append(Esc(need[k])); }
                        b.Append(']');
                        foreach (string n in names) if (!n.StartsWith("npc:") && !n.StartsWith("moon:") && !n.EndsWith("World")) set[n](true);
                    }
                }
                reset();
                b.Append("}}");
            });
            b.Append("}");
            Write("shops.json", b);
            Console.WriteLine("tiendas: " + prices.Count + " con mercadería, " + names.Count + " condiciones, " + errors + " errores");
        });
    }

    /// Pone un campo o una propiedad, se llame como se llame en esta versión del juego, buscando por la jerarquía.
    static void SetAny(object o, string name, object value)
    {
        for (Type t = o.GetType(); t != null; t = t.BaseType)
        {
            FieldInfo f = t.GetField(name, All | BindingFlags.DeclaredOnly);
            if (f != null) { f.SetValue(o, Convert.ChangeType(value, f.FieldType)); return; }
            PropertyInfo p = t.GetProperty(name, All | BindingFlags.DeclaredOnly);
            if (p != null && p.CanWrite) { p.SetValue(o, Convert.ChangeType(value, p.PropertyType), null); return; }
        }
        throw new Exception("no hay " + o.GetType().Name + "." + name);
    }

    /// Los campos y propiedades de un tipo, para ver por consola cómo viene un dato que no se conoce.
    static string Shape(Type t)
    {
        StringBuilder sh = new StringBuilder(t.Name + ":");
        foreach (FieldInfo f in t.GetFields(All)) sh.Append(" " + f.FieldType.Name + " " + f.Name);
        foreach (PropertyInfo p in t.GetProperties(All)) sh.Append(" [" + p.PropertyType.Name + " " + p.Name + "]");
        return sh.ToString();
    }
}

