// Vuelca los mapas de las granjas (capas, tiles y propiedades) a games/stardew/raw/maps/<mapa>.json para el
// planificador. Lo compila y corre `dump.sh MapDump`. Usa `dynamic` para no referenciar xTile al compilar: el
// ContentManager del juego lo carga solo.
using System;
using System.IO;
using System.Reflection;
using System.Text;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Content;

static class MapDump {
  // Un mapa por tipo de granja, en el orden de `Game1.whichFarm` (0 estándar ... 6 playa) y la de 1.6 (Meadowlands).
  static readonly string[] Mapas = { "Farm", "Farm_Fishing", "Farm_Foraging", "Farm_Mining", "Farm_Combat",
                                     "Farm_FourCorners", "Farm_Island", "Farm_Ranching" };

  static int Main(string[] a) {
    string juego = a[0], salida = Path.Combine(a[1], "maps");
    AppDomain.CurrentDomain.AssemblyResolve += (_, e) => {
      string d = Path.Combine(juego, new AssemblyName(e.Name).Name + ".dll");
      return File.Exists(d) ? Assembly.LoadFrom(d) : null;
    };
    Directory.CreateDirectory(salida);
    return Run(juego, salida);
  }

  static string Esc(object v) => v.ToString().Replace("\\", "\\\\").Replace("\"", "\\\"");

  static void Props(StringBuilder sb, dynamic props) {
    sb.Append('{');
    bool primero = true;
    foreach (var kv in props) {
      if (!primero) sb.Append(',');
      primero = false;
      sb.Append($"\"{Esc(kv.Key)}\":\"{Esc(kv.Value)}\"");
    }
    sb.Append('}');
  }

  static int Run(string juego, string salida) {
    var cm = new ContentManager(new GameServiceContainer(), Path.Combine(juego, "Content"));
    foreach (var nombre in Mapas) {
      dynamic map = cm.Load<object>("Maps/" + nombre);
      var sb = new StringBuilder("{\"props\":");
      Props(sb, map.Properties);
      sb.Append(",\"sheets\":[");
      bool primero = true;
      foreach (dynamic ts in map.TileSheets) {
        if (!primero) sb.Append(',');
        primero = false;
        sb.Append($"{{\"id\":\"{Esc(ts.Id)}\",\"src\":\"{Esc(((string)ts.ImageSource).Replace("\\", "/"))}\",");
        sb.Append($"\"w\":{ts.SheetSize.Width},\"h\":{ts.SheetSize.Height}}}");
      }
      sb.Append("],\"layers\":{");
      primero = true;
      foreach (dynamic layer in map.Layers) {
        if (!primero) sb.Append(',');
        primero = false;
        int W = layer.LayerWidth, H = layer.LayerHeight;
        sb.Append($"\"{Esc(layer.Id)}\":{{\"w\":{W},\"h\":{H},\"t\":[");
        for (int y = 0; y < H; y++)
          for (int x = 0; x < W; x++) {
            if (x + y > 0) sb.Append(',');
            dynamic t = layer.Tiles[x, y];
            if (t == null) { sb.Append("null"); continue; }
            // Un tile animado guarda sus cuadros; se toma el primero.
            dynamic cuadro = t.GetType().Name == "AnimatedTile" ? t.TileFrames[0] : t;
            sb.Append($"[\"{Esc(cuadro.TileSheet.Id)}\",{cuadro.TileIndex},");
            // Las propiedades del tile pisan las de su índice en la hoja, como en `doesTileHaveProperty`.
            var todas = new System.Collections.Generic.Dictionary<string, string>();
            try { foreach (var kv in cuadro.TileIndexProperties) todas[kv.Key] = kv.Value.ToString(); } catch { }
            foreach (var kv in t.Properties) todas[kv.Key] = kv.Value.ToString();
            Props(sb, todas);
            sb.Append(']');
          }
        sb.Append("]}");
      }
      sb.Append("}}");
      File.WriteAllText(Path.Combine(salida, nombre + ".json"), sb.ToString());
      Console.WriteLine(nombre + " ok");
    }
    return 0;
  }
}
