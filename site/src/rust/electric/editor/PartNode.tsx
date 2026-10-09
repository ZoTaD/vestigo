/**
 * Un componente en el lienzo (2026-10-09), estilo A+B: un casillero del inventario con el ícono del juego, los enchufes
 * a los costados y la cifra que sale por cada salida. Los nombres de los enchufes ("Power In", "Branch Out") aparecen
 * al pasar el mouse o con el componente elegido. El estado va por tinte (prendido, aviso), nunca por borde.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "../engine";
import { iconOf, nameOf, useEditor, useSim } from "./ctx";

/** Dónde va el enchufe `i` de `n` en el costado del casillero (en %). */
const at = (i: number, n: number): string => `${((i + 1) * 100) / (n + 1)}%`;

function PartNode({ id, selected }: NodeProps) {
  const { store, lang, readOnly } = useEditor();
  useSim();
  const e = store.world.get(id);
  if (!e) return null;
  const def = e.def;
  const name = nameOf(def.name, lang);
  const on = e.isPowered() || (def.cat === "source" && e.sent.some((v) => v > 0)) || (def.cat === "battery" && e.isOn());
  // Aviso: un corto, o le llega energía pero no le alcanza.
  const use = e.consumptionAmount();
  const warn = e.hasFlag(Flag.Reserved7) || (use > 0 && e.currentEnergy > 0 && e.currentEnergy < use);
  return (
    <div className={`el-node${on && !warn ? " is-on" : ""}${warn ? " is-warn" : ""}${selected ? " is-sel" : ""}`} title={name}>
      <div className="el-slot">
        <img src={iconOf(def.id)} alt="" width={44} height={44} decoding="async" draggable={false} />
      </div>
      <span className="el-name">{name}</span>
      {e.inputs.map((s, i) => (
        <div className="el-port el-in" style={{ top: at(i, e.inputs.length) }} key={`i${i}`}>
          <Handle type="target" position={Position.Left} id={`i${i}`} className={`el-h el-t${s.type}${e.received[i] > 0 ? " is-live" : ""}`} isConnectable={!readOnly} />
          <span className="el-pname">
            {s.niceName || "—"}
            {s.connectedTo ? <b>{e.received[i]}</b> : null}
          </span>
        </div>
      ))}
      {e.outputs.map((s, i) => (
        <div className="el-port el-out" style={{ top: at(i, e.outputs.length) }} key={`o${i}`}>
          <Handle type="source" position={Position.Right} id={`o${i}`} className={`el-h el-t${s.type}${e.sent[i] > 0 && s.connectedTo ? " is-live" : ""}`} isConnectable={!readOnly} />
          <span className="el-pname">
            {s.niceName || "—"}
            {s.connectedTo ? <b>{e.sent[i]}</b> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default memo(PartNode);
