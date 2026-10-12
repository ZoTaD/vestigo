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
        return 0;
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

