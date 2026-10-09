"""
Lo que la pestaña Electricidad necesita y el cliente no trae (2026-10-09). Lo usa `electricity.py`.

El cliente es IL2CPP: los números que el juego calcula en C# (`ConsumptionAmount()` sobrescrito) no están en los
prefabs. Salen del código decompilado público **github.com/MillionthOdin16/RustChangelog** (rama `release`, último push
2024-08-03), un archivo por clase (`<Clase>.cs`). Cuando el prefab trae el dato como campo, manda el prefab (es del
build actual); cuando no, manda esto. Ver `docs/superpowers/plans/2026-10-09-rust-electricidad.md` ("Dudas").
"""

# `ConsumptionAmount()` cuando es código fijo. Valor y archivo del decompilado.
CODE_USE = {
    "AutoTurret": (10, "AutoTurret.cs"),
    "SamSite": (25, "SamSite.cs"),
    "SearchLight": (10, "SearchLight.cs"),
    "CCTV_RC": (3, "CCTV_RC.cs"),
    "ElectricalHeater": (3, "ElectricalHeater.cs"),
    "ModularCarGarage": (5, "ModularCarGarage.cs"),
    # `ConsumptionAmount()` devuelve 10 fijo; lo que pide (`DesiredPower`) es `PowerUsageWhilePlaying` sólo mientras suena.
    "DeployableBoomBox": (10, "DeployableBoomBox.cs"),
    "ReactiveTarget": (1, "ReactiveTarget.cs"),
    # Las que dicen 0 a propósito (no pagan por estar en el medio).
    "ElectricBattery": (0, "ElectricBattery.cs"),
    "Splitter": (0, "Splitter.cs"),
    "ElectricalBranch": (0, "ElectricalBranch.cs"),
    "ElectricalCombiner": (0, "ElectricalCombiner.cs"),
    "ElectricalBlocker": (0, "ElectricalBlocker.cs"),
    "RANDSwitch": (0, "ElectricalBlocker.cs (RANDSwitch hereda)"),
    "ElectricSwitch": (0, "ElectricSwitch.cs"),
    "SmartSwitch": (0, "SmartSwitch.cs"),
    "PressButton": (0, "PressButton.cs"),
    "CustomTimerSwitch": (0, "TimerSwitch.cs (CustomTimerSwitch hereda)"),
    "PowerCounter": (0, "PowerCounter.cs"),
    "ANDSwitch": (0, "ANDSwitch.cs"),
    "ORSwitch": (0, "ORSwitch.cs"),
    "XORSwitch": (0, "XORSwitch.cs"),
    "ElectricalDFlipFlop": (0, "ElectricalDFlipFlop.cs"),
    "PressurePad": (0, "PressurePad.cs"),
    "SolarPanel": (0, "SolarPanel.cs"),
    "ElectricWindmill": (0, "ElectricWindmill.cs (no la sobrescribe: es fuente, no tiene entrada)"),
    "FuelGenerator": (0, "FuelGenerator.cs"),
    "ElectricGenerator": (0, "ElectricGenerator.cs"),
    # Agua (2026-10-09): el aspersor pide 2 de agua por segundo; el interruptor de fluidos hereda el 0 del interruptor.
    "Sprinkler": (2, "Sprinkler.cs"),
    # Industrial: el adaptador no consume (IndustrialStorageAdaptor.cs).
    "IndustrialStorageAdaptor": (0, "IndustrialStorageAdaptor.cs"),
    "FluidSwitch": (0, "FluidSwitch.cs"),
}

# `Mathf.CeilToInt(maxDamageOutput / powerToDamageRatio)` (TeslaCoil.cs), con los campos del prefab actual.
FORMULA_USE = {"TeslaCoil": "TeslaCoil.cs"}

# Campos del prefab que son el consumo (`ConsumptionAmount()` devuelve el campo). `PowerUsageWhilePlaying` no: es lo
# que pide la rocola mientras suena, no su consumo (ver CODE_USE).
USE_FIELDS = ("powerConsumption", "PowerConsumption", "consumptionAmount", "PowerDrain", "PowerCost")

# Clases que no sobrescriben `ConsumptionAmount()` en el decompilado: pagan el de `IOEntity`, que es 1.
BASE_USE = {
    "HBHFSensor": "BaseDetector.cs → IOEntity.cs",
    "LaserDetector": "BaseDetector.cs → IOEntity.cs",
    "SeismicSensor": "SeismicSensor.cs → IOEntity.cs",
    "StorageMonitor": "AppIOEntity.cs → IOEntity.cs",
    "SmartAlarm": "AppIOEntity.cs → IOEntity.cs",
    "AudioAlarm": "AudioAlarm.cs → IOEntity.cs",
    "RFBroadcaster": "RFBroadcaster.cs → IOEntity.cs",
    "RFReceiver": "RFReceiver.cs → IOEntity.cs",
    "CustomDoorManipulator": "DoorManipulator.cs → IOEntity.cs",
    "CableTunnel": "CableTunnel.cs → IOEntity.cs",
    "FlasherLight": "FlasherLight.cs → IOEntity.cs",
    "SirenLight": "SirenLight.cs → IOEntity.cs",
    "ContainerIOEntity": "ContainerIOEntity.cs → IOEntity.cs",
    "LiquidContainer": "LiquidContainer.cs → IOEntity.cs",
    "IndustrialConveyor": "IndustrialConveyor.cs → IndustrialEntity.cs → IOEntity.cs",
    "IndustrialCrafter": "IndustrialCrafter.cs → IndustrialEntity.cs → IOEntity.cs",
    "WaterCatcher": "WaterCatcher.cs → LiquidContainer.cs → IOEntity.cs",
    "IOEntity": "IOEntity.cs",
}

# Clases sin código en el decompilado (posteriores a agosto de 2024) y sin el consumo como campo: lo heredan de
# `IOEntity` (1) mientras no aparezca su código. Se marcan como "sin código" en el JSON. La rueda de agua tampoco tiene
# código: es fuente fija con `maxPowerGenerationFromWater`.
NO_CODE_USE = {"StringLights": 1, "ChristmasLights": 1, "Chandelier": 1, "OrientableLight": 1, "ElectricWaterWheel": 0}

# El poste de tendido eléctrico (Power Trip): prefab estático, sin objeto. Ver `powerline_pole` en electricity.py.
POWERLINE_POLE = "assets/prefabs/io/electric/generators/powergrid_powerline_io.static.prefab"

# Afuera de la paleta (por ahora), con el motivo.
EXCLUDE = {
    "DigitalClock": "sin código: no se sabe cómo arma sus pulsos de alarma",
    "BiofuelGenerator": "sin código",
    "Hopper": "sin código (industrial)",
    "CommandBlock": "sólo para administradores",
    "Elevator": "llamar al ascensor no se modela",
    "Telephone": "las llamadas no se modelan",
    "ConnectedSpeaker": "red de audio, no de energía",
    "LaserLight": "red de audio, no de energía",
    "AudioVisualisationEntityLight": "red de audio, no de energía",
    "DiscoFloor": "red de audio, no de energía",
    "FogMachine": "funciona con combustible, no con energía",
    "SnowMachine": "funciona con combustible, no con energía",
    "SpookySpeaker": "funciona con pilas, no con energía",
    "StrobeLight": "funciona con pilas, no con energía",
    # Industrial (plan 7) y agua sin energía (plan 6).
    "WaterPurifier": "el purificador sin energía necesita fuego, que el editor no tiene",
    # El adaptador no va suelto: viene puesto en cada caja u horno de `CONTAINERS` (una sola parte en el editor).
    "IndustrialStorageAdaptor": "va puesto en las cajas y hornos (CONTAINERS)",
}
# El ítem `discoball` coloca un `IOEntity` pelado: no es un componente que se arme.
EXCLUDE_ITEMS = {"discoball", "weaponrack.light", "weaponrack.doublelight"}

# La paleta: categoría por clase, en el orden en que se muestran.
CATEGORIES = ["source", "battery", "route", "logic", "switch", "sensor", "defense", "light", "appliance", "water", "industrial"]
CATEGORY = {
    "SolarPanel": "source", "ElectricWindmill": "source", "ElectricWaterWheel": "source", "FuelGenerator": "source",
    "ElectricGenerator": "source",
    "ElectricBattery": "battery",
    "Splitter": "route", "ElectricalBranch": "route", "ElectricalCombiner": "route", "ElectricalBlocker": "route",
    "CableTunnel": "route",
    "ANDSwitch": "logic", "ORSwitch": "logic", "XORSwitch": "logic", "ElectricalDFlipFlop": "logic",
    "RANDSwitch": "logic", "PowerCounter": "logic", "CustomTimerSwitch": "logic",
    "ElectricSwitch": "switch", "SmartSwitch": "switch", "PressButton": "switch", "RFBroadcaster": "switch",
    "RFReceiver": "switch",
    "HBHFSensor": "sensor", "LaserDetector": "sensor", "PressurePad": "sensor", "SeismicSensor": "sensor",
    "StorageMonitor": "sensor",
    "AutoTurret": "defense", "SamSite": "defense", "TeslaCoil": "defense", "Igniter": "defense",
    "CustomDoorManipulator": "defense", "ReactiveTarget": "defense",
    "SimpleLight": "light", "CeilingLight": "light", "FlasherLight": "light", "SirenLight": "light",
    "NeonSign": "light", "StringLights": "light", "OrientableLight": "light", "SearchLight": "light",
    "ChristmasLights": "light", "Chandelier": "light",
}
# Lo demás que consume (heladera, calefactor, cámaras…) va a "appliance". Lo de la red de agua (`ioType` 1, más la
# bomba y el purificador, que son eléctricos con salida o entrada de agua) va a "water".
WATER_CLASSES = {"WaterPump", "PoweredWaterPurifier"}

# Campos del prefab que el motor necesita, por clase (se copian tal cual a `p`).
PARAMS = {
    "SolarPanel": ["maximalPowerOutput", "dot_minimum", "dot_maximum"],
    "ElectricWindmill": ["maxPowerGeneration"],
    "ElectricWaterWheel": ["maxPowerGenerationFromWater"],
    "FuelGenerator": ["outputEnergy", "fuelPerSec"],
    "ElectricGenerator": ["electricAmount"],
    "ElectricBattery": ["maxOutput", "maxCapactiySeconds", "rustWattSeconds", "maximumInboundEnergyRatio", "chargeRatio"],
    "ElectricalBranch": ["branchAmount"],
    "PressButton": ["pressDuration", "pressPowerTime", "pressPowerAmount", "smallBurst"],
    "PressurePad": ["pressPowerTime", "pressPowerAmount"],
    "CustomTimerSwitch": ["timerLength"],
    "SeismicSensor": ["range"],
    "HBHFSensor": ["range"],
    "TeslaCoil": ["powerToDamageRatio", "maxDamageOutput", "powerForHeavyShorting"],
    "ReactiveTarget": ["activationPowerTime", "activationPowerAmount"],
    "CustomDoorManipulator": ["powerAction"],
    "SamSite": ["lowAmmoThreshold"],
    "DeployableBoomBox": ["PowerUsageWhilePlaying"],
    "Igniter": ["IgniteRange", "IgniteFrequency"],
    # Agua: todo `LiquidContainer` lleva los de contenedor (`LIQUID_PARAMS`) además de estos.
    "WaterPump": ["PumpInterval", "AmountPerPump"],
    "WaterCatcher": ["maxItemToCreate"],
    "PoweredWaterPurifier": ["waterToProcessPerMinute", "freshWaterRatio", "stopWhenOutputFull", "ConvertInterval"],
    "Sprinkler": ["SplashFrequency", "WaterPerSplash"],
}
# Industrial (2026-10-09): cajas y hornos con el adaptador de almacenamiento puesto. Cada uno es una sola parte: los
# enchufes del adaptador (`storageadaptor.deployed.prefab`) y el inventario y las reglas de su contenedor (el prefab que
# coloca el objeto, de `cache/industrial/`). El horno eléctrico queda afuera: su energía entra por otra entidad hija.
ADAPTOR = "assets/prefabs/deployable/playerioents/industrialadaptors/storageadaptor.deployed.prefab"
CONTAINERS = ["box.wooden.large", "box.wooden", "furnace", "furnace.large"]
OVEN_PARAMS = ["smeltSpeed", "fuelSlots", "inputSlots", "outputSlots", "IndustrialMode", "temperature", "allowByproductCreation"]
# `BaseOven.TemperatureType` → `cookingTemperature` (BaseOven.cs).
OVEN_TEMPERATURE = {0: 15, 1: 50, 2: 200, 3: 1000, 4: 1500}
# `IndustrialConveyor.MaxStackSizePerMove`, del prefab.
CONVEYOR_PARAMS = ["MaxStackSizePerMove"]
LIQUID_CLASSES = {"LiquidContainer", "WaterPump", "WaterCatcher", "PoweredWaterPurifier", "WaterPurifier"}
LIQUID_PARAMS = ["maxStackSize", "maxOutputFlow", "autofillOutputs", "autofillTickRate", "autofillTickAmount", "startingAmount"]

# Rangos que el jugador puede poner en el juego. Temporizador y sensor sísmico: los paneles `TimerConfig` y
# `SeismicSensorConfig` de la caché (`io/configs.json`); la rama: `SetBranchOffPower` clampa a 1..10.000.000
# (ElectricalBranch.cs); el contador: `Mathf.Clamp(counterNumber, 0, 999)` (PowerCounter.cs).
RANGES = {
    "CustomTimerSwitch": {"timerLength": "TimerConfig"},
    "SeismicSensor": {"range": "SeismicSensorConfig"},
    "ElectricalBranch": {"branchAmount": [1, 10000000]},
    "PowerCounter": {"target": [0, 999]},
}
