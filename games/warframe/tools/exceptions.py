"""Nombres de la tabla de drops que no cruzan a ningún `uniqueName` del export, revisados a mano."""

# nombre en la tabla de drops -> por qué no cruza (a propósito)
UNRESOLVED: dict[str, str] = {
    "2X Forma Blueprint": "Es la cantidad (dos) de un Forma Blueprint como recompensa, no un objeto aparte: "
                          "el plano de Forma no está en el export y no es parte de nada del Arsenal.",
}
