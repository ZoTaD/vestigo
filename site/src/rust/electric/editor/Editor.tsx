/**
 * El editor de circuitos (2026-10-09): React Flow (`@xyflow/react`) con los casilleros del inventario, la paleta, el
 * inspector y la barra. El estado vive en `EditorStore`; React Flow sólo dibuja y avisa. En el celular es de sólo
 * lectura: se abre, se tocan interruptores y botones, se le da play y se mira el inspector.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Route } from "../../../route";
import { encode, HASH_KEY, saveLocal } from "../codec";
import type { ElectricCopy } from "../copy";
import { Ctx, useEditor } from "./ctx";
import Inspector from "./Inspector";
import Palette, { DRAG_TYPE } from "./Palette";
import PartNode from "./PartNode";
import { wireKey, type EditorStore } from "./store";
import Toolbar from "./Toolbar";
import WireEdge from "./WireEdge";

const nodeTypes = { part: PartNode };
const edgeTypes = { wire: WireEdge };

type Nav = (r: Route) => void;

export interface EditorProps {
  store: EditorStore;
  lang: "en" | "es";
  t: ElectricCopy;
  readOnly: boolean;
  route: Route;
  navigate: Nav;
}

export default function Editor(props: EditorProps) {
  const ctx = useMemo(() => ({ store: props.store, lang: props.lang, t: props.t, readOnly: props.readOnly }), [props.store, props.lang, props.t, props.readOnly]);
  return (
    <Ctx.Provider value={ctx}>
      <ReactFlowProvider>
        <Shell route={props.route} navigate={props.navigate} />
      </ReactFlowProvider>
    </Ctx.Provider>
  );
}

const toNodes = (store: EditorStore): Node[] => {
  const sel = store.selection?.kind === "part" ? new Set(store.selection.ids) : new Set<string>();
  return store.circuit.parts.map((p) => ({ id: p.id, type: "part", position: { x: p.x, y: p.y }, data: {}, selected: sel.has(p.id) }));
};

const toEdges = (store: EditorStore): Edge[] => {
  const sel = store.selection?.kind === "wire" ? store.selection.key : null;
  return store.circuit.wires.map((w) => {
    const id = wireKey(w);
    return { id, source: w.from[0], sourceHandle: `o${w.from[1]}`, target: w.to[0], targetHandle: `i${w.to[1]}`, type: "wire", selected: id === sel };
  });
};

const slotOf = (h: string | null | undefined): number => Number((h ?? "x0").slice(1));

function Shell({ route, navigate }: { route: Route; navigate: Nav }) {
  const { store, t, readOnly } = useEditor();
  const flow = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>(() => toNodes(store));
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(store));
  const [error, setError] = useState<string | null>(null);

  // Cada cambio del circuito: se vuelve a armar lo que dibuja React Flow, y se guarda en el link y en el navegador.
  useEffect(() => {
    let timer = 0;
    const off = store.onChange(() => {
      setNodes(toNodes(store));
      setEdges(toEdges(store));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void encode(store.circuit).then((s) => {
          const url = `${window.location.pathname}${window.location.search}#${HASH_KEY}${s}`;
          window.history.replaceState(window.history.state, "", url);
          saveLocal(s);
        });
      }, 400);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [store]);

  // El reloj: la simulación corre con la pantalla (requestAnimationFrame se frena solo con la pestaña oculta).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      store.advance(Math.max(0, now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), ns)), []);

  const onSelectionChange = useCallback(
    ({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
      const cur = store.selection;
      if (ns.length) {
        const ids = ns.map((n) => n.id);
        if (cur?.kind !== "part" || cur.ids.join() !== ids.join()) store.select({ kind: "part", ids });
      } else if (es.length) {
        if (cur?.kind !== "wire" || cur.key !== es[0].id) store.select({ kind: "wire", key: es[0].id });
      } else if (cur) store.select(null);
    },
    [store],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const err = store.connect({ from: [c.source, slotOf(c.sourceHandle)], to: [c.target, slotOf(c.targetHandle)] });
      setError(err ? t.wireErrors[err] : null);
    },
    [store, t],
  );

  const addAt = useCallback(
    (type: string, clientX?: number, clientY?: number) => {
      const r = box.current?.getBoundingClientRect();
      const x = clientX ?? (r ? r.left + r.width / 2 : 0);
      const y = clientY ?? (r ? r.top + r.height / 2 : 0);
      const p = flow.screenToFlowPosition({ x, y });
      // Las que se agregan con clic, en escalera, para que no caigan una arriba de la otra.
      const n = clientX === undefined ? store.circuit.parts.length % 6 : 0;
      store.addPart(type, p.x - 36 + n * 24, p.y - 36 + n * 24);
    },
    [flow, store],
  );

  useEffect(() => {
    if (readOnly) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || !(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey) store.undo();
      else if (k === "y" || (k === "z" && ev.shiftKey)) store.redo();
      else if (k === "d" && store.selection?.kind === "part") store.duplicate(store.selection.ids);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, readOnly]);

  const share = useCallback(async () => {
    const s = await encode(store.circuit);
    const url = `${window.location.origin}${window.location.pathname}#${HASH_KEY}${s}`;
    window.history.replaceState(window.history.state, "", url);
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [store]);

  return (
    <div className={`el-editor${readOnly ? " is-ro" : ""}`}>
      {!readOnly ? <Palette onAdd={(type) => addAt(type)} /> : null}
      <div className="el-center">
        <Toolbar onShare={share} />
        <div
          className="el-canvas"
          ref={box}
          onDragOver={(ev) => {
            if (ev.dataTransfer.types.includes(DRAG_TYPE)) {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(ev) => {
            const type = ev.dataTransfer.getData(DRAG_TYPE);
            if (!type) return;
            ev.preventDefault();
            addAt(type, ev.clientX, ev.clientY);
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            onNodeDragStop={(_, __, dragged) => store.moveParts(dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })), true)}
            onNodesDelete={(ns) => store.removeParts(ns.map((n) => n.id))}
            onEdgesDelete={(es) => es.forEach((e) => store.disconnect(e.id))}
            onPaneClick={() => setError(null)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
            minZoom={0.2}
            maxZoom={2}
            snapToGrid
            snapGrid={[10, 10]}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.08)" />
            <Controls showInteractive={false} />
          </ReactFlow>
          {!store.circuit.parts.length ? <p className="el-empty">{t.emptyCanvas}</p> : null}
          {error ? (
            <p className="el-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <Inspector route={route} navigate={navigate} />
    </div>
  );
}
