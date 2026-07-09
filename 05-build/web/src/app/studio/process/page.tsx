"use client";
/**
 * ⑤ Process Designer (Spec §13) — react-flow: node = step, edge = luồng.
 * Khép mạch tailor-made: vẽ quy trình → generate Task Cells → (Derivation Engine kéo KPI).
 * Bố cục node lưu canvas_layout (kind=process, ref=process.id) — không phải dữ liệu nghiệp vụ.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  addEdge, applyNodeChanges, Background, Connection, Controls, Edge, MiniMap,
  Node, NodeChange,
} from "reactflow";
import { Boxes, Plus, Save, Workflow, Zap } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import {
  CanvasLayoutData, ConfigVersion, ProcessDef, ProcessStep, TaskCellRow,
} from "@/lib/api";

const STEP_COLOR: Record<string, string> = {
  task: "#037236", decision: "#b45309", milestone: "#1d4ed8",
  approval: "#7c3aed", gateway: "#64748b",
};

function stepNode(s: ProcessStep, pos?: { x: number; y: number }): Node {
  return {
    id: s.id,
    position: pos ?? { x: 60 + ((s.seq - 1) % 4) * 230, y: 60 + Math.floor((s.seq - 1) / 4) * 140 },
    data: { label: `${s.seq}. ${s.nameVi}${s.responsibleRole ? ` · ${s.responsibleRole}` : ""}` },
    style: {
      borderColor: STEP_COLOR[s.type] ?? "#64748b", borderWidth: 2, borderRadius: 10,
      padding: 8, fontSize: 12, background: "var(--nhg-bg-surface)", color: "var(--nhg-text-primary)",
    },
  };
}

export default function ProcessDesignerPage() {
  const { call, versionId, setVersionId, session } = useStudio();
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [processes, setProcesses] = useState<ProcessDef[]>([]);
  const [procId, setProcId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<ProcessStep | null>(null);
  const [cells, setCells] = useState<TaskCellRow[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // form thêm step / tạo process
  const [newProc, setNewProc] = useState({ code: "", nameVi: "" });
  const [newStep, setNewStep] = useState({ type: "task", nameVi: "", responsibleRole: "" });

  const proc = useMemo(() => processes.find((p) => p.id === procId) ?? null, [processes, procId]);
  const drafts = useMemo(() => versions.filter((v) => v.status === "draft" || v.status === "preview"), [versions]);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  useEffect(() => {
    call<ConfigVersion[]>("/config-versions").then(setVersions).catch(fail);
  }, [call]);

  const reloadProcesses = useCallback(async (keepProc?: string) => {
    if (!versionId) return;
    try {
      const list = await call<ProcessDef[]>(`/processes?configVersionId=${versionId}`);
      setProcesses(list);
      const target = keepProc ?? procId;
      if (target && !list.some((p) => p.id === target)) setProcId(list[0]?.id ?? null);
      else if (!target && list.length) setProcId(list[0].id);
    } catch (e) { fail(e); }
  }, [call, versionId, procId]);
  useEffect(() => { void reloadProcesses(); }, [reloadProcesses]);

  // nạp canvas: steps + edges + layout đã lưu
  useEffect(() => {
    if (!proc) { setNodes([]); setEdges([]); setCells([]); setSelected(null); return; }
    (async () => {
      let saved: CanvasLayoutData | null = null;
      try {
        saved = await call<CanvasLayoutData>(`/canvas-layout?kind=process&refId=${proc.id}`);
      } catch { /* layout là tiện ích — thiếu không chặn canvas */ }
      // [F78] ưu tiên vị trí ĐANG kéo trên canvas (chưa bấm Lưu) > layout đã lưu > fallback grid
      // — nối edge/thêm bước không được reset công sắp xếp của designer
      setNodes((prev) => {
        const current = Object.fromEntries(prev.map((n) => [n.id, n.position]));
        return proc.steps.map((s) => stepNode(s, current[s.id] ?? saved?.nodes?.[s.id]));
      });
      setEdges(proc.edges.map((e) => ({
        id: e.id, source: e.fromStepId, target: e.toStepId,
        label: e.condition ?? undefined, animated: true,
      })));
      try {
        const allCells = await call<TaskCellRow[]>(`/task-cells?configVersionId=${proc.configVersionId}`);
        setCells(allCells.filter((c) => c.code.startsWith(`${proc.code}-S`)));
      } catch { setCells([]); }
    })();
  }, [proc, call]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const onConnect = useCallback((conn: Connection) => {
    if (!proc || !conn.source || !conn.target) return;
    setBusy(true);
    call(`/processes/${proc.id}/edges`, {
      method: "POST",
      json: { edges: [{ fromStepId: conn.source, toStepId: conn.target }] },
    })
      .then(() => {
        setEdges((es) => addEdge({ ...conn, animated: true }, es));
        setMsg({ kind: "ok", text: "Đã nối bước" });
        return reloadProcesses(proc.id);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [call, proc, reloadProcesses]);

  const saveLayout = async () => {
    if (!proc) return;
    setBusy(true);
    try {
      const positions = Object.fromEntries(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]));
      await call("/canvas-layout/process", { method: "PUT", json: { refId: proc.id, nodes: positions } });
      setMsg({ kind: "ok", text: "Đã lưu bố cục canvas" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const createProcess = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      const p = await call<ProcessDef>("/processes", {
        method: "POST",
        json: { configVersionId: versionId, code: newProc.code.toUpperCase(), nameVi: newProc.nameVi },
      });
      setNewProc({ code: "", nameVi: "" });
      setMsg({ kind: "ok", text: `Đã tạo quy trình ${p.code}` });
      await reloadProcesses(p.id);
      setProcId(p.id);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const addStep = async () => {
    if (!proc) return;
    setBusy(true);
    try {
      const seq = Math.max(0, ...proc.steps.map((s) => s.seq)) + 1;
      await call(`/processes/${proc.id}/steps`, {
        method: "POST",
        json: {
          steps: [{
            seq, type: newStep.type, nameVi: newStep.nameVi,
            ...(newStep.responsibleRole ? { responsibleRole: newStep.responsibleRole } : {}),
          }],
        },
      });
      setNewStep({ type: "task", nameVi: "", responsibleRole: "" });
      setMsg({ kind: "ok", text: `Đã thêm bước ${seq}` });
      await reloadProcesses(proc.id);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const generateCells = async () => {
    if (!proc) return;
    setBusy(true);
    try {
      const r = await call<{ created: number; skipped: number }>(`/processes/${proc.id}/generate-cells`, { method: "POST" });
      setMsg({ kind: "ok", text: `Task Cell: tạo ${r.created ?? 0}, bỏ qua ${r.skipped ?? 0} (idempotent)` });
      const allCells = await call<TaskCellRow[]>(`/task-cells?configVersionId=${proc.configVersionId}`);
      setCells(allCells.filter((c) => c.code.startsWith(`${proc.code}-S`)));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Process Designer" }}>
      <div className="page-head">
        <div className="eyebrow">⑤ Process Designer — react-flow</div>
        <h1>Thiết kế quy trình</h1>
        <p>Vẽ quy trình → sinh Task Cell (7 nhóm thuộc tính) → Derivation Engine kéo KPI. Chỉ sửa được trên version draft.</p>
      </div>

      <div className="studio-toolbar">
        <div className="studio-field">
          <label>Config version (draft)</label>
          <select className="studio-select" value={versionId ?? ""}
            onChange={(e) => setVersionId(e.target.value || null)}>
            <option value="">— chọn —</option>
            {drafts.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.status})</option>)}
          </select>
        </div>
        <div className="studio-field">
          <label>Quy trình</label>
          <select className="studio-select" value={procId ?? ""} onChange={(e) => setProcId(e.target.value || null)}>
            <option value="">— chọn —</option>
            {processes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nameVi}</option>)}
          </select>
        </div>
        <div className="studio-field">
          <label>Tạo quy trình mới (code / tên)</label>
          <div className="row" style={{ gap: 6 }}>
            <input className="studio-input" style={{ width: 90 }} placeholder="TS" value={newProc.code}
              onChange={(e) => setNewProc({ ...newProc, code: e.target.value })} />
            <input className="studio-input" placeholder="Tuyển sinh" value={newProc.nameVi}
              onChange={(e) => setNewProc({ ...newProc, nameVi: e.target.value })} />
            <button className="btn ghost sm" disabled={busy || !versionId || !newProc.code || !newProc.nameVi}
              onClick={() => void createProcess()}>
              <Plus size={13} /> Tạo
            </button>
          </div>
        </div>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <div>
          <div className="rf-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelected(proc?.steps.find((s) => s.id === n.id) ?? null)}
              deleteKeyCode={null}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} />
              <MiniMap pannable zoomable />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <div className="studio-toolbar" style={{ marginTop: 10 }}>
            <div className="studio-field">
              <label>Thêm bước — loại</label>
              <select className="studio-select" value={newStep.type}
                onChange={(e) => setNewStep({ ...newStep, type: e.target.value })}>
                {Object.keys(STEP_COLOR).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Tên bước (VI)</label>
              <input className="studio-input" value={newStep.nameVi}
                onChange={(e) => setNewStep({ ...newStep, nameVi: e.target.value })} />
            </div>
            <div className="studio-field">
              <label>Vai trò phụ trách</label>
              <input className="studio-input" placeholder="admissions_officer" value={newStep.responsibleRole}
                onChange={(e) => setNewStep({ ...newStep, responsibleRole: e.target.value })} />
            </div>
            <button className="btn primary sm" disabled={busy || !proc || !newStep.nameVi}
              onClick={() => void addStep()}>
              <Plus size={14} /> Thêm bước
            </button>
            <button className="btn ghost sm" disabled={busy || !proc} onClick={() => void saveLayout()}>
              <Save size={14} /> Lưu bố cục
            </button>
            <button className="btn accent sm" disabled={busy || !proc} onClick={() => void generateCells()}>
              <Zap size={14} /> Sinh Task Cell
            </button>
          </div>
        </div>

        <div>
          <Card title={<><Workflow size={15} /> Bước đang chọn</>}
            sub={selected ? `${selected.seq}. ${selected.nameVi}` : "Click một node trên canvas"}>
            {selected && (
              <dl className="kv">
                <dt>Loại</dt><dd><Badge tone="gray">{selected.type}</Badge></dd>
                <dt>Phụ trách</dt><dd>{selected.responsibleRole ?? "—"}</dd>
                <dt>Config</dt>
                <dd><pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0 }}>
                  {JSON.stringify(selected.config ?? {}, null, 1)}
                </pre></dd>
              </dl>
            )}
          </Card>

          <div style={{ height: 12 }} />
          <Card title={<><Boxes size={15} /> Task Cell đã sinh</>}
            sub={`${cells.length} cell — mã <PROCESS>-Snn, đủ 7 nhóm thuộc tính`}>
            <table className="table">
              <thead><tr><th>Mã</th><th>Tên</th><th>KPI</th></tr></thead>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{c.code}</td>
                    <td>{c.nameVi}</td>
                    <td>{c.kpiRef ? <Badge tone="green">{c.kpiRef}</Badge> : "—"}</td>
                  </tr>
                ))}
                {cells.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>
                    Chưa có — thêm bước loại <b>task</b> rồi bấm “Sinh Task Cell”.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
