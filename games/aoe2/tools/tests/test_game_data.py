"""Los datos base de AoE2 (`game_data.py`): civs con nombre en inglés y español, sin tocar la instalación del juego."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import game_data as gd  # noqa: E402

LISTA = [
    {"internal_name": "Gaia", "name_string_id": 10102, "era": "base"},
    {"internal_name": "Britons", "tech_tree_image_path": "/resources/civ_techtree/menu_techtree_britons.png", "name_string_id": 10271, "era": "base"},
    {"internal_name": "Sin escudo", "name_string_id": 99999, "era": "base"},
    {"internal_name": "Indians", "tech_tree_image_path": "/resources/civ_techtree/menu_techtree_indians.png", "name_string_id": 10290, "era": "base"},
    {"internal_name": "Achaemenids", "tech_tree_image_path": "/resources/civ_techtree/menu_techtree_achaemenids.png", "name_string_id": 10316, "era": "antiquity"},
]
EN = {10271: "Britons", 10290: "Hindustanis", 10316: "Achaemenids"}
ES = {10271: "Britanos", 10290: "Indostanos"}


def test_parse_strings_lee_id_y_texto_e_ignora_comentarios():
    assert gd.parse_strings('10271 "Britons"\n// comentario\n\n10272 "Franks"  // x\n') == {10271: "Britons", 10272: "Franks"}


def test_civ_table_usa_el_indice_como_id_y_deja_afuera_gaia_y_las_sin_escudo():
    civs = gd.civ_table(LISTA, EN, ES)
    assert civs[0] == {"id": 1, "internal": 1, "slug": "britons", "file": "britons", "name": {"en": "Britons", "es": "Britanos"}, "era": "base"}
    assert [c["id"] for c in civs] == [1, 3, 4]


def test_slug_sale_del_nombre_en_ingles_y_el_archivo_del_escudo():
    hind = gd.civ_table(LISTA, EN, ES)[1]
    assert hind["slug"] == "hindustanis" and hind["file"] == "indians"


def test_sin_texto_en_espanol_usa_el_ingles():
    assert gd.civ_table(LISTA, EN, ES)[2]["name"]["es"] == "Achaemenids"


def test_civ_nueva_sin_nombre_no_rompe():
    civs = gd.civ_table(LISTA + [{"internal_name": "Nueva", "tech_tree_image_path": "/x/menu_techtree_nueva.png", "name_string_id": 1}], EN, ES)
    assert civs[-1]["slug"] == "nueva" and civs[-1]["name"]["en"] == "Nueva"


MAPAS = [
    {"const_name": "arabia", "name_string_id": 10875, "map_icon_filename": "rm_arabia", "script_filename": "Arabia.rms", "random_map": True},
    {"const_name": "coastal_forest", "name_string_id": 10999, "map_icon_filename": "rm_coastal_forest", "script_filename": "CoastalForest.rms", "random_map": True},
    {"const_name": "sin_script", "name_string_id": 1, "map_icon_filename": "rm_x"},
]


def test_maps_table_slug_del_script_como_el_de_la_api():
    m = gd.maps_table(MAPAS, {10875: "Arabia", 10999: "Coastal Forest"}, {10875: "Arabia", 10999: "Bosque costero"})
    assert m[0] == {"slug": "arabia", "icon": "rm_arabia", "name": {"en": "Arabia", "es": "Arabia"}}
    assert m[1]["slug"] == "coastalforest" and m[1]["name"]["es"] == "Bosque costero"
    assert len(m) == 2


def test_el_id_es_el_de_la_api_segun_la_tabla():
    """La API numera las civs distinto que el juego (1 = Aztecs): `api_civs.json` = {id API: índice interno}."""
    lista = [{"internal_name": "Gaia", "name_string_id": 1}] + [
        {"internal_name": f"C{i}", "tech_tree_image_path": f"/x/menu_techtree_c{i}.png", "name_string_id": 100 + i} for i in range(1, 16)
    ]
    en = {100 + i: f"Civ{i}" for i in range(1, 16)}
    civs = gd.civ_table(lista, en, {}, api={1: 15, 11: 6})
    por_slug = {c["slug"]: c for c in civs}
    assert por_slug["civ15"]["id"] == 1 and por_slug["civ15"]["internal"] == 15
    assert por_slug["civ6"]["id"] == 11
    # Sin id de la API (no se juega en ranking o la tabla no lo cubre): un id que no choca con ninguno de la API.
    assert por_slug["civ2"]["id"] == 1002


def test_sin_tabla_usa_el_indice():
    assert gd.civ_table(LISTA, EN, ES)[0]["id"] == 1


def civs_mal_numeradas(civs: list[dict], api: dict[str, int]) -> list[str]:
    """Las civs cuyo `id` no es el de la API según `api_civs.json` (o que siendo de ranking no tienen id de la API)."""
    return [c["slug"] for c in civs if (c["era"] == "base" and c["id"] >= 1000) or (c["id"] < 1000 and api.get(str(c["id"])) != c.get("internal"))]


def test_toda_civ_de_ranking_tiene_su_id_de_la_api():
    """Con los datos reales: cada civ lleva el `civilization_id` de la API (no el índice del juego: 1 = Aztecs)."""
    import json
    raiz = Path(__file__).resolve().parents[2] / "data"
    civs = json.loads((raiz / "civs.json").read_text(encoding="utf-8"))
    api = json.loads((raiz / "api_civs.json").read_text(encoding="utf-8"))
    assert civs_mal_numeradas(civs, api) == []
    assert len({c["id"] for c in civs}) == len(civs)
