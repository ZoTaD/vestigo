/**
 * Un cable (2026-10-09): verde con energía, gris sin; la cifra que lleva, en el medio. Lo que lleva es lo último que el
 * juego le pasó al vecino (`sent`), no una cuenta aparte.
 */
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { useEditor, useSim } from "./ctx";

function WireEdge({ id, source, sourceHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const { store } = useEditor();
  useSim();
  const e = store.world.get(source);
  const slot = Number((sourceHandleId ?? "o0").slice(1));
  const v = e?.sent[slot] ?? 0;
  const type = e?.outputs[slot]?.type ?? 0;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6, offset: 14 });
  const cls = `el-wire el-t${type}${v > 0 ? " is-live" : ""}${selected ? " is-sel" : ""}`;
  return (
    <>
      <BaseEdge id={id} path={path} className={cls} interactionWidth={14} />
      <EdgeLabelRenderer>
        <span className={`el-wlabel${v > 0 ? " is-live" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
          {v}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(WireEdge);
