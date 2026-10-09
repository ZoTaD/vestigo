"""
Tests de `convars.py` (2026-10-09): el parseo de los atributos de convars del código decompilado, con datos sintéticos,
y la forma del `server.json` versionado. No piden nada a la red.

    python -m unittest games/rust/tools/tests/test_convars.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import convars  # noqa: E402

CS = '''
namespace ConVar;

[Factory("server")]
public class Server : ConsoleSystem
{
	[ServerVar]
	public static int port = 28015;

	[ServerVar(Help = "Server name, with a comma, see?", ShowInAdminUI = true)]
	public static string hostname = "My Untitled Rust Server";

	[ServerVar(Saved = true, Name = "planttickscale")]
	public static float plantTickScale = 1f;

	[ReplicatedVar(Saved = true)]
	public static bool pve = false;

	[ServerVar]
	public static void stop(Arg args)
	{
	}

	private static int _limit = 240;

	[ClientVar(Saved = true)]
	[ServerVar(Saved = true)]
	public static int limit
	{
		get { return _limit; }
	}

	[ServerUserVar]
	public static void pair(Arg arg)
	{
	}

	[ServerVar]
	public static List<string> odd = new List<string>();
}
'''


class TestParse(unittest.TestCase):
    def setUp(self):
        self.rows = {(r["name"], r["side"]): r for r in convars.parse_file(CS, "Server")}

    def test_variables_con_su_valor(self):
        self.assertEqual(self.rows[("server.port", "server")], {"name": "server.port", "side": "server", "kind": "var", "type": "int", "default": 28015})
        h = self.rows[("server.hostname", "server")]
        self.assertEqual(h["help"], "Server name, with a comma, see?")
        self.assertEqual(h["default"], "My Untitled Rust Server")
        self.assertEqual(self.rows[("server.planttickscale", "server")]["default"], 1)
        self.assertTrue(self.rows[("server.planttickscale", "server")]["saved"])
        self.assertIs(self.rows[("server.pve", "server")]["default"], False)

    def test_comandos_y_dos_lados(self):
        self.assertEqual(self.rows[("server.stop", "server")]["kind"], "command")
        self.assertEqual(self.rows[("server.limit", "client")]["default"], 240)
        self.assertEqual(self.rows[("server.limit", "server")]["default"], 240)
        self.assertTrue(self.rows[("server.pair", "server")]["anyone"])
        self.assertNotIn("default", self.rows[("server.odd", "server")])

    def test_sin_factory_va_el_nombre_de_la_clase(self):
        rows = convars.parse_file("public class AutoTurret : BaseCombatEntity\n{\n[ServerVar(Help = \"x\")]\npublic static float auto_turret_budget_ms = 0.5f;\n}", "AutoTurret")
        self.assertEqual(rows[0]["name"], "autoturret.auto_turret_budget_ms")
        self.assertEqual(rows[0]["default"], 0.5)


@unittest.skipUnless((convars.DATA / "server.json").exists(), "falta server.json")
class TestServerJson(unittest.TestCase):
    def test_forma(self):
        with open(convars.DATA / "server.json", encoding="utf-8") as f:
            doc = json.load(f)
        self.assertTrue(doc["source"]["commit"])
        by = {v["name"]: v for v in doc["vars"]}
        self.assertGreater(len(by), 1000)
        self.assertEqual(len(by), len(doc["vars"]))
        self.assertEqual(by["server.worldsize"]["default"], 4500)
        self.assertEqual(by["server.port"]["default"], 28015)
        self.assertEqual(by["fps.limit"]["sides"], ["server", "client"])
        self.assertEqual(by["global.quit"]["kind"], "command")


if __name__ == "__main__":
    unittest.main()
