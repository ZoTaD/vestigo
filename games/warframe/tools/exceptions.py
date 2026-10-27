"""Nombres de la tabla de drops que ninguna parte del Arsenal usa, revisados a mano (uno por uno, con su motivo)."""


def _grupo(motivo: str, *nombres: str) -> dict[str, str]:
    return {n: motivo for n in nombres}


# nombre en la tabla de drops -> por qué no cruza (a propósito)
UNRESOLVED: dict[str, str] = {
    **_grupo("Es la cantidad (dos) de un Forma Blueprint como recompensa, no un objeto aparte.",
             "2X Forma Blueprint"),
    **_grupo("Forma: recurso/plano de uso general, no es parte de nada del Arsenal.",
             "Forma Blueprint", "Omni Forma Blueprint"),
    **_grupo("Adaptador Exilus: accesorio de equipo, no es un objeto del Arsenal.",
             "Exilus Warframe Adapter Blueprint", "Exilus Weapon Adapter Blueprint"),
    **_grupo("Specter de Tenno: plano para fabricar un aliado de Clan/Dojo, no está en el Arsenal.",
             "Ancient Protector Specter Blueprint", "Charger Specter Blueprint", "Cosmic Specter Blueprint",
             "Force Specter Blueprint", "Phase Specter Blueprint", "Vapor Specter Blueprint", "Clem Clone Blueprint"),
    **_grupo("Lente de Eidolon/Lua: se fabrica en el Foco, no es del Arsenal.",
             "Eidolon Lens Blueprint", "Lua Lens Blueprint"),
    **_grupo("Nave del Liset (Mantis, Parallax, Scimitar, Xiphos): piezas de una nave, no del Arsenal "
             "(los exports las traen como recursos de /Items/Ships).",
             "Mantis Avionics Blueprint", "Mantis Engines Blueprint", "Mantis Fuselage Blueprint",
             "Parallax Avionics Blueprint", "Parallax Engines Blueprint", "Parallax Fuselage Blueprint",
             "Scimitar Avionics Blueprint", "Scimitar Engines Blueprint", "Scimitar Fuselage Blueprint",
             "Xiphos Avionics Blueprint", "Xiphos Engines Blueprint", "Xiphos Fuselage Blueprint"),
    **_grupo("Collar Kavasa Prime: accesorio de kubrow, no es un arma ni un compañero del Arsenal.",
             "Kavasa Prime Band", "Kavasa Prime Buckle", "Kavasa Prime Kubrow Collar Blueprint"),
    **_grupo("Ascaris Prime es un recurso del Tau (/Gameplay/Tau/Resources), no un arma.",
             "Ascaris Prime"),
    **_grupo("Decoración o cosmético, no es del Arsenal.",
             "Blazing Step Ephemera Blueprint", "Lavos Cordatus Helmet Blueprint"),
    **_grupo("Accesorio de otro sistema (Incubador, Pherliac, potenciadores), no es del Arsenal.",
             "Kavat Incubator Upgrade Segment Blueprint", "Pherliac Pods Blueprint",
             "Orokin Catalyst Blueprint", "Orokin Reactor Blueprint"),
}
