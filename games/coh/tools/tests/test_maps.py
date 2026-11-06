"""El extractor de mapas de CoH1 y CoH2 (`maps.py`): lo que se lee del `.info` de cada escenario."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from maps import parse_info  # noqa: E402

COH2 = '''HeaderInfo =
{
	scenarioname = "$11106520",
	scenariodescription = "$11106521",
	maxplayers = 2,
	mapsize =
	{
		320,
		320,
	},
	point_positions =
	{
		{
			y = 1.13155,
			x = -110.59224,
			owner_id = 1000,
			ebp_name = "starting_position_shared_territory",
		},
		{
			y = -0.75627,
			x = -1.12819,
			owner_id = 0,
			ebp_name = "victory_point",
		},
	},
}
'''

COH1 = '''HeaderInfo =
{
	scenarioname = "$60971",
	maxplayers = 4,
	mapsize =
	{
		512,
		256,
	},
	scenariotype = 2,
}
'''


def test_info_coh2():
    i = parse_info(COH2)
    assert i["name"] == "$11106520"
    assert i["players"] == 2
    assert i["size"] == [320, 320]
    assert {"x": -1.13, "y": -0.76, "kind": "victory_point"} in i["points"]
    assert len(i["points"]) == 2


def test_info_coh1_sin_puntos():
    i = parse_info(COH1)
    assert i["players"] == 4 and i["size"] == [512, 256] and i["points"] == []


def test_nombre_sin_jugadores():
    from maps import limpio
    assert limpio("Angoville (2)") == "Angoville"
    assert limpio("(2-4) Langres") == "Langres"
    assert limpio("(2 - 4) Terek Lines") == "Terek Lines"
    assert limpio(None) == ""
