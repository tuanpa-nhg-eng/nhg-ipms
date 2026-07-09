"use client";
/**
 * ② Org Designer (Spec §13) — react-flow graph cây tổ chức (node = org unit,
 * edge = quan hệ cha–con). Kéo–thả bố cục lưu canvas_layout (kind=org, ref=tenant).
 * Org unit là dữ liệu LIVE (không version-scoped) — tạo mới đi thẳng org:write.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  applyNodeChanges, Background, Controls, Edge, MiniMap, Node, NodeChange,
} from "reactflow";
import { Building2, ListChecks, Plus, Save } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { CanvasLayoutData, OrgFunction, OrgUnit, UnitFunction } from "@/lib/api";

const LEVELS = ["group", "bu", "department", "team"] as const;
const LEVEL_COLOR: Record<string, string> = {
  group: "#7c3aed", bu: "#037236", department: "#1d4ed8", team: "#64748b",
};

/** Bố cục cây mặc định khi chưa có layout lưu: BFS theo depth. */
function treePositions(units: OrgUnit[]): Record<string, { x: number; y: number }> {
  const children = new Map<string | null, OrgUnit[]>();
  for (const u of units) {
    const k = u.parentId ?? null;
    children.set(k, [...(children.get(k) ?? []), u]);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  let queue = (children.get(null) ?? []).map((u) => u.id);
  let depth = 0;
  const seen = new Set<string>();
  while (queue.length) {
    queue.forEach((id, i) => {
      pos[id] = { x: 60 + i * 240, y: 60 + depth * 130 };
      seen.add(id);
    });
    queue = queue.flatMap((id) => (children.get(id) ?? []).map((u) => u.id)).filter((id) => !seen.has(id));
    depth += 1;
  }
  // node mồ côi (parent bị soft-delete…) — xếp cuối, vẫn hiển thị để thấy vấn đề
  units.filter((u) => !pos[u.id]).forEach((u, i) => {
    pos[u.id] = { x: 60 + i * 240, y: 60 + depth * 130 };
  });
  return pos;
}

export default function OrgDesignerPage() {
  const { call, session } = useStudio();
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selected, setSelected] = useState<OrgUnit | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", nameVi: "", level: "department", parentId: "" });
  // gán chức năng (feed Derivation Engine)
  const [functions, setFunctions] = useState<OrgFunction[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fnForm, setFnForm] = useState({ code: "", nameVi: "" });

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  const edges: Edge[] = useMemo(
    () => units.filter((u) => u.parentId).map((u) => ({
      id: `e-${u.parentId}-${u.id}`, source: u.parentId!, target: u.id,
    })),
    [units],
  );

  const reload = useCallback(async () => {
    try {
      const list = await call<OrgUnit[]>("/org-units");
      setUnits(list);
      let saved: CanvasLayoutData | null = null;
      try {
        saved = await call<CanvasLayoutData>(`/canvas-layout?kind=org&refId=${session!.tenantId}`);
      } catch {}
      const fallback = treePositions(list);
      setNodes(list.map((u) => ({
        id: u.id,
        position: saved?.nodes?.[u.id] ?? fallback[u.id],
        data: { label: `${u.code} · ${u.nameVi}` },
        style: {
          borderColor: LEVEL_COLOR[u.level] ?? "#64748b", borderWidth: 2, borderRadius: 10,
          padding: 8, fontSize: 12, background: "var(--nhg-bg-surface)", color: "var(--nhg-text-primary)",
        },
      })));
    } catch (e) { fail(e); }
  }, [call, session]);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    call<OrgFunction[]>("/org-functions").then(setFunctions).catch(fail);
  }, [call]);

  // chọn đơn vị → nạp bộ chức năng đang gán
  useEffect(() => {
    if (!selected) { setChecked(new Set()); return; }
    call<UnitFunction[]>(`/org-units/${selected.id}/functions`)
      .then((list) => setChecked(new Set(list.map((f) => f.functionId))))
      .catch(fail);
  }, [selected, call]);

  const toggleFn = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveFunctions = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await call(`/org-units/${selected.id}/functions`, {
        method: "PUT",
        json: { functions: [...checked].map((functionId) => ({ functionId })) },
      });
      setMsg({ kind: "ok", text: `Đã gán ${checked.size} chức năng cho ${selected.code} — Derivation Engine sẽ kéo KPI theo function` });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const createFunction = async () => {
    setBusy(true);
    try {
      await call("/org-functions", {
        method: "POST",
        json: { code: fnForm.code.toUpperCase(), nameVi: fnForm.nameVi },
      });
      setFnForm({ code: "", nameVi: "" });
      setFunctions(await call<OrgFunction[]>("/org-functions"));
      setMsg({ kind: "ok", text: "Đã thêm chức năng vào catalog" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const saveLayout = async () => {
    setBusy(true);
    try {
      const positions = Object.fromEntries(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]));
      await call("/canvas-layout/org", {
        method: "PUT", json: { refId: session!.tenantId, nodes: positions },
      });
      setMsg({ kind: "ok", text: "Đã lưu bố cục sơ đồ tổ chức" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const createUnit = async () => {
    setBusy(true);
    try {
      await call("/org-units", {
        method: "POST",
        json: {
          code: form.code.toUpperCase(), nameVi: form.nameVi, level: form.level,
          ...(form.parentId ? { parentId: form.parentId } : {}),
        },
      });
      setMsg({ kind: "ok", text: `Đã tạo đơn vị ${form.code.toUpperCase()}` });
      setForm({ code: "", nameVi: "", level: "department", parentId: "" });
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Org Designer" }}>
      <div className="page-head">
        <div className="eyebrow">② Org Designer — react-flow</div>
        <h1>Sơ đồ tổ chức</h1>
        <p>Cơ cấu live của tenant (không qua version) · gán chức năng ⇒ Derivation Engine kéo KPI theo function.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <div>
          <div className="rf-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onNodeClick={(_, n) => setSelected(units.find((u) => u.id === n.id) ?? null)}
              nodesConnectable={false}
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
              <label>Mã</label>
              <input className="studio-input" style={{ width: 110 }} placeholder="MARKETING"
                value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Tên đơn vị (VI)</label>
              <input className="studio-input" value={form.nameVi}
                onChange={(e) => setForm({ ...form, nameVi: e.target.value })} />
            </div>
            <div className="studio-field">
              <label>Cấp</label>
              <select className="studio-select" value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="studio-field">
              <label>Trực thuộc</label>
              <select className="studio-select" value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— gốc —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select>
            </div>
            <button className="btn primary sm" disabled={busy || !form.code || !form.nameVi}
              onClick={() => void createUnit()}>
              <Plus size={14} /> Tạo đơn vị
            </button>
            <button className="btn ghost sm" disabled={busy} onClick={() => void saveLayout()}>
              <Save size={14} /> Lưu bố cục
            </button>
          </div>
        </div>

        <div>
          <Card title={<><Building2 size={15} /> Đơn vị đang chọn</>}
            sub={selected ? selected.nameVi : "Click một node trên sơ đồ"}>
            {selected && (
              <dl className="kv">
                <dt>Mã</dt><dd><b>{selected.code}</b></dd>
                <dt>Cấp</dt><dd><Badge tone="gray">{selected.level}</Badge></dd>
                <dt>Tên EN</dt><dd>{selected.nameEn ?? "—"}</dd>
                <dt>Trực thuộc</dt>
                <dd>{units.find((u) => u.id === selected.parentId)?.code ?? "— (gốc)"}</dd>
              </dl>
            )}
          </Card>
          <div style={{ height: 12 }} />
          <Card title={<><ListChecks size={15} /> Chức năng của đơn vị</>}
            sub={selected
              ? "Tick chức năng rồi Lưu — Derivation Engine kéo KPI theo function"
              : "Chọn đơn vị trước"}>
            {selected && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {functions.map((f) => (
                    <label key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked.has(f.id)} onChange={() => toggleFn(f.id)} />
                      <b>{f.code}</b> <span style={{ color: "var(--nhg-text-secondary)" }}>{f.nameVi}</span>
                    </label>
                  ))}
                  {functions.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--nhg-text-secondary)" }}>
                      Catalog trống — thêm chức năng bên dưới.
                    </span>
                  )}
                </div>
                <button className="btn primary sm" style={{ marginTop: 10 }} disabled={busy}
                  onClick={() => void saveFunctions()}>
                  <Save size={13} /> Lưu chức năng
                </button>
              </>
            )}
            <div className="studio-toolbar" style={{ marginTop: 12 }}>
              <div className="studio-field">
                <label>Mã mới</label>
                <input className="studio-input" style={{ width: 100 }} placeholder="ADMISSION"
                  value={fnForm.code} onChange={(e) => setFnForm({ ...fnForm, code: e.target.value })} />
              </div>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>Tên chức năng</label>
                <input className="studio-input" value={fnForm.nameVi}
                  onChange={(e) => setFnForm({ ...fnForm, nameVi: e.target.value })} />
              </div>
              <button className="btn ghost sm" disabled={busy || !fnForm.code || !fnForm.nameVi}
                onClick={() => void createFunction()}>
                <Plus size={13} /> Thêm
              </button>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
