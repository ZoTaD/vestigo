"""
Los parches de Age of Empires II: DE (2026-11-20): nombre → momento en que salió (UTC), de las noticias de Steam
(`ISteamNews/GetNewsForApp?appid=813780`, "Age of Empires II: Definitive Edition – Update <número>").

**Parche nuevo → sumar su línea acá y en `NOTAS`** (el número de la noticia, la hora y el id de la noticia). Las estadísticas "desde el
parche" empiezan el día siguiente (UTC), así ningún día mezcla los dos.
"""
#: nombre → (momento UTC, menor, id de la noticia en Steam). Desde agosto de 2025.
NOTAS = {
    "153015": ("2025-08-12T17:15:25Z", False, "1807332909738413"),
    "153638": ("2025-08-20T17:16:19Z", False, "1808601382416754"),
    "155976": ("2025-09-16T21:18:13Z", True, "1810503566591313"),
    "158041": ("2025-10-14T17:09:36Z", False, "1813041031377852"),
    "160062": ("2025-11-06T18:17:13Z", True, "1815580768269058"),
    "162286": ("2025-12-02T18:12:05Z", False, "1817483467049172"),
    "169123": ("2026-02-17T17:23:02Z", False, "1824644522848240"),
    "170934": ("2026-03-12T17:07:53Z", False, "1826992588593208"),
    "174992": ("2026-04-23T21:08:42Z", True, "1830797770234278"),
    "177723": ("2026-06-02T17:13:21Z", False, "1833968530901123"),
    "185872": ("2026-09-22T17:17:40Z", False, "1844115010504975"),
    "188329": ("2026-10-27T17:09:41Z", False, "1847286114049735"),
}
NOTICIA = "https://store.steampowered.com/news/app/813780/view/{gid}"

PARCHES = {
    "153015": "2025-08-12T17:00:00Z",
    "153638": "2025-08-20T17:00:00Z",
    "155976": "2025-09-16T21:00:00Z",
    "158041": "2025-10-14T17:00:00Z",
    "160062": "2025-11-06T18:00:00Z",
    "162286": "2025-12-02T18:00:00Z",
    "169123": "2026-02-17T17:00:00Z",
    "170934": "2026-03-12T17:00:00Z",
    "174992": "2026-04-23T21:00:00Z",
    "177723": "2026-06-02T17:00:00Z",
    "185872": "2026-09-22T17:00:00Z",
    "188329": "2026-10-27T17:00:00Z",
}
