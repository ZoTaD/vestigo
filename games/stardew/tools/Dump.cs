// Sonda de Stardew Valley: le pide al propio juego que lea sus XNB de datos y
// los escribe como JSON, sin descompilar nada ni tocar la carpeta del juego.
//
// Stardew 1.6 es .NET 6: los datos (`Content/Data`, `Content/Strings`) son
// clases de `StardewValley.GameData.dll` serializadas con el ReflectiveReader
// de MonoGame. Leerlos a mano obligaría a copiar la forma de cada clase; el
// ContentManager de MonoGame ya sabe hacerlo, así que se le pide a él.
//
// Uso (ver dump.sh): dotnet Dump.dll <carpeta del juego> <salida>
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Content;

static class Dump
{
    // Los idiomas que usa el sitio: el base (inglés) y el español.
    static readonly string[] OtrosIdiomas = { "de-DE", "fr-FR", "hu-HU", "it-IT", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "tr-TR", "zh-CN" };

    static int Main(string[] args)
    {
        string juego = args[0], salida = args[1];
        AppDomain.CurrentDomain.AssemblyResolve += (_, e) =>
        {
            string dll = Path.Combine(juego, new AssemblyName(e.Name).Name + ".dll");
            return File.Exists(dll) ? Assembly.LoadFrom(dll) : null;
        };
        return Run(juego, salida);
    }

    static int Run(string juego, string salida)
    {
        string content = Path.Combine(juego, "Content");
        var cm = new ContentManager(new GameServiceContainer(), content);
        var opts = new JsonSerializerOptions { IncludeFields = true, WriteIndented = true, MaxDepth = 256 };
        int ok = 0, fallos = 0;
        foreach (string dir in new[] { "Data", "Strings" })
        {
            foreach (string f in Directory.GetFiles(Path.Combine(content, dir), "*.xnb", SearchOption.AllDirectories))
            {
                string rel = Path.GetRelativePath(content, f).Replace('\\', '/');
                rel = rel.Substring(0, rel.Length - 4);
                if (Array.Exists(OtrosIdiomas, l => rel.EndsWith("." + l))) continue;
                try
                {
                    object asset = cm.Load<object>(rel);
                    string dest = Path.Combine(salida, rel + ".json");
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    File.WriteAllText(dest, JsonSerializer.Serialize(asset, asset.GetType(), opts));
                    ok++;
                }
                catch (Exception ex)
                {
                    fallos++;
                    Console.Error.WriteLine($"{rel}: {ex.GetType().Name}: {ex.Message}");
                }
            }
        }
        Console.WriteLine($"{ok} archivos de datos escritos, {fallos} fallaron → {salida}");
        return fallos == 0 ? 0 : 1;
    }
}
