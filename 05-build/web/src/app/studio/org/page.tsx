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
import { Building2, Network, Plus, Save } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { CanvasLayoutData, OrgUnit } from "@/lib/api";

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
          <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--nhg-text-secondary)" }}>
            <Network size={12} style={{ verticalAlign: -2 }} /> Gán chức năng cho đơn vị (org_function)
            dùng API <code>/org-functions</code> — UI gán kéo–thả vào lát Studio kế tiếp.
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
