"use client";
/**
 * [P1] Trợ lý iPMS — Copilot toàn cục (panel dock phải, theo ảnh tham khảo).
 * Chat streaming (SSE) qua ai-gateway (mock; Claude khi bật cờ ai_gateway_live + key).
 * @mention (thực thể) · /actions (slash → MCP tool) · model picker · thẻ đề xuất HITL.
 * Session dùng CHUNG sessionStorage với Studio (dev-token; production → OIDC Entra).
 * Human-in-the-loop: đề xuất vào hàng chờ pending — người có quyền duyệt riêng.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Plus, History, X, SendHorizontal, ChevronDown, Wrench,
  Lightbulb, KeyRound, Paperclip, Mic,
} from "lucide-react";
import {
  API_BASE, ApiError, ChatModelsResponse, ChatStreamChunk, StudioSession,
  devLogin, streamChat,
} from "@/lib/api";

const SS_KEY = "nhg-studio-session";
const SLASH_ACTIONS = [
  ["derive", "Kéo theo KPI cho vị trí/chức năng"],
  ["draft-taskcell", "Soạn nháp một Task Cell"],
  ["explain-score", "Giải thích điểm scorecard"],
  ["find-duplicates", "Tìm tác vụ trùng lặp"],
  ["summarize", "Tóm tắt trang đang xem"],
  ["find", "Tra cứu KPI / tác vụ / người"],
] as const;

interface UiTool { toolName?: string }
interface UiSuggestion { type: string; summary: string; reason?: string; suggestionId?: string }
interface UiMsg {
  role: "user" | "assistant";
  content: string;
  tools?: UiTool[];
  suggestion?: UiSuggestion;
  streaming?: boolean;
}

function loadSession(): StudioSession | null {
  try { const s = sessionStorage.getItem(SS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

export function AgentPanel({ page }: { page?: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [models, setModels] = useState<ChatModelsResponse | null>(null);
  const [model, setModel] = useState("claude-opus-4-8");
  const [effort, setEffort] = useState("high");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [convId, setConvId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setSession(loadSession()); }, [open]);
  useEffect(() => {
    if (open && session && !models) {
      fetch(`${API_BASE}/ai/models`, { headers: { Authorization: `Bearer ${session.token}`, "X-Tenant-Id": session.tenantId } })
        .then((r) => r.json()).then(setModels).catch(() => {});
    }
  }, [open, session, models]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [msgs]);

  const modelLabel = models?.models.find((m) => m.code === model)?.label ?? "Claude Opus 4.8";

  const quickLogin = async (prefix: string) => {
    setErr(null);
    try {
      const s = await devLogin("H.01", `${prefix}@h01.nhg.local`);
      sessionStorage.setItem(SS_KEY, JSON.stringify(s));
      setSession(s);
    } catch (e) { setErr((e as Error).message); }
  };

  const stop = () => { abortRef.current?.abort(); abortRef.current = null; };
  const newChat = () => { stop(); setMsgs([]); setConvId(undefined); setErr(null); setBusy(false); };
  const close = () => { stop(); setOpen(false); };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !session || busy) return;
    setBusy(true); setErr(null); setSlashOpen(false);
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", tools: [], streaming: true }]);
    // [F148] guard: nếu thread bị xoá (newChat) giữa stream, không patch vào mảng rỗng
    const patchLast = (fn: (a: UiMsg) => UiMsg) =>
      setMsgs((m) => { if (!m.length) return m; const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamChat(
        session,
        { conversationId: convId, message: text, model, effort, context: { tenant: session.tenantCode, page } },
        (chunk: ChatStreamChunk) => {
          if (chunk.conversationId) setConvId(chunk.conversationId);
          switch (chunk.type) {
            case "text":
              if (chunk.text) patchLast((a) => ({ ...a, content: a.content + chunk.text }));
              break;
            case "tool_use":
              patchLast((a) => ({ ...a, tools: [...(a.tools ?? []), { toolName: chunk.toolName }] }));
              break;
            case "suggestion":
              if (chunk.suggestion) patchLast((a) => ({
                ...a,
                suggestion: {
                  type: chunk.suggestion!.type,
                  summary: chunk.suggestion!.summary,
                  reason: chunk.suggestion!.reason,
                  suggestionId: chunk.suggestion!.payload?.suggestionId ?? a.suggestion?.suggestionId,
                },
              }));
              break;
            case "error":
              setErr(chunk.error ?? "Lỗi stream");
              break;
          }
        },
        ac.signal,
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || ac.signal.aborted) {
        // chủ động hủy (Đóng / Hội thoại mới) — không hiện lỗi
      } else {
        const msg = e instanceof ApiError && e.status === 403
          ? "Tài khoản không có quyền ai:invoke — đăng nhập bằng designer@ hoặc admin@."
          : (e as Error).message;
        setErr(msg);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      patchLast((a) => ({ ...a, streaming: false }));
      setBusy(false);
    }
  }, [input, session, busy, convId, model, effort, page]);

  const onInput = (v: string) => { setInput(v); setSlashOpen(v.startsWith("/") && !v.includes(" ")); };
  const pickSlash = (a: string) => { setInput(`/${a} `); setSlashOpen(false); };

  return (
    <>
      {!open && (
        <button className="copilot-fab" onClick={() => setOpen(true)} title="Trợ lý iPMS (AI)">
          <Sparkles size={20} />
        </button>
      )}
      {open && (
        <aside className="copilot" role="complementary" aria-label="Trợ lý iPMS">
          <header className="copilot-head">
            <div className="copilot-title"><Sparkles size={16} /> Trợ lý iPMS</div>
            <div className="copilot-head-actions">
              <button title="Hội thoại mới" onClick={newChat}><Plus size={16} /></button>
              <button title="Lịch sử (P2)" disabled><History size={16} /></button>
              <button title="Đóng" onClick={close}><X size={16} /></button>
            </div>
          </header>

          {!session ? (
            <div className="copilot-login">
              <KeyRound size={22} />
              <p>Đăng nhập để dùng Trợ lý (dev-token). Chọn vai trò có quyền <code>ai:invoke</code>:</p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button className="btn primary sm" onClick={() => quickLogin("designer")}>designer@</button>
                <button className="btn ghost sm" onClick={() => quickLogin("admin")}>admin@</button>
              </div>
              {err && <div className="copilot-err">{err}</div>}
            </div>
          ) : (
            <>
              <div className="copilot-thread" ref={scrollRef}>
                {msgs.length === 0 && (
                  <div className="copilot-welcome">
                    <div className="copilot-avatar"><Sparkles size={22} /></div>
                    <h4>Xin chào 👋</h4>
                    <p>Hỏi về KPI, tác vụ, scorecard… Gõ <b>/</b> để chạy tác vụ, <b>@</b> để nhắc đến thực thể.</p>
                    <div className="copilot-examples">
                      {["/derive kế toán trưởng", "Giải thích KPI-TS-001", "/find-duplicates"].map((ex) => (
                        <button key={ex} onClick={() => setInput(ex)}>{ex}</button>
                      ))}
                    </div>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={`copilot-msg ${m.role}`}>
                    {m.role === "assistant" && (m.tools ?? []).map((t, j) => (
                      <div key={j} className="copilot-tool"><Wrench size={12} /> Đang gọi <code>{t.toolName}</code>…</div>
                    ))}
                    {(m.role === "user" || m.content || !m.streaming) ? (
                      <div className="copilot-bubble">
                        {m.content}
                        {m.role === "assistant" && m.streaming && m.content && <span className="copilot-cursor">▍</span>}
                      </div>
                    ) : (
                      <div className="copilot-bubble">
                        <span className="copilot-typing"><span /><span /><span /></span>
                      </div>
                    )}
                    {m.suggestion && (
                      <div className="copilot-suggestion">
                        <div className="copilot-sug-head"><Lightbulb size={13} /> Đề xuất — cần bạn duyệt</div>
                        <div className="copilot-sug-body">{m.suggestion.summary}</div>
                        {m.suggestion.reason && <div className="copilot-sug-reason">{m.suggestion.reason}</div>}
                        <div className="copilot-sug-note">
                          Đã đưa vào hàng chờ đề xuất (pending). Duyệt tại mục “Đề xuất AI” — không tự áp vào cấu hình.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {err && <div className="copilot-err">{err}</div>}
              </div>

              <div className="copilot-composer">
                <div className="copilot-ctx">
                  {session.tenantCode}{page ? ` · ${page}` : ""} <span>(ngữ cảnh)</span>
                </div>
                {slashOpen && (
                  <div className="copilot-slash">
                    {SLASH_ACTIONS.filter(([a]) => a.startsWith(input.slice(1))).map(([a, d]) => (
                      <button key={a} onClick={() => pickSlash(a)}><code>/{a}</code><span>{d}</span></button>
                    ))}
                  </div>
                )}
                <textarea
                  className="copilot-input" rows={2}
                  placeholder="Hỏi bất kỳ điều gì, @ để nhắc đến, / để chạy tác vụ"
                  value={input} disabled={busy}
                  onChange={(e) => onInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                />
                <div className="copilot-composer-bar">
                  <button className="copilot-icon" title="Đính kèm (P2)" disabled><Paperclip size={15} /></button>
                  <div className="copilot-picker">
                    <button className="copilot-model" onClick={() => setPickerOpen((v) => !v)}>
                      {modelLabel} ({effort.charAt(0).toUpperCase() + effort.slice(1)}) <ChevronDown size={13} />
                    </button>
                    {pickerOpen && (
                      <div className="copilot-picker-pop">
                        <div className="copilot-pick-label">Model</div>
                        {(models?.models ?? []).map((mm) => (
                          <button key={mm.code} className={mm.code === model ? "on" : ""}
                            disabled={mm.disabled}
                            onClick={() => { setModel(mm.code); setPickerOpen(false); }}>
                            {mm.label}{mm.recommended ? " ★" : ""}{mm.disabled ? " (P2)" : ""}
                          </button>
                        ))}
                        <div className="copilot-pick-label">Effort</div>
                        <div className="copilot-effort">
                          {(models?.efforts ?? ["low", "medium", "high", "xhigh", "max"]).map((ef) => (
                            <button key={ef} className={ef === effort ? "on" : ""}
                              onClick={() => setEffort(ef)}>{ef}</button>
                          ))}
                        </div>
                        {models?.backendNote && <div className="copilot-pick-note">{models.backendNote}</div>}
                      </div>
                    )}
                  </div>
                  <button className="copilot-icon" title="Giọng nói (P3)" disabled><Mic size={15} /></button>
                  <button className="copilot-send" disabled={busy || !input.trim()} onClick={() => void send()}>
                    <SendHorizontal size={16} />
                  </button>
                </div>
              </div>
              <div className="copilot-foot">AI có thể sai — hãy kiểm chứng kết quả. Mọi thay đổi cần người duyệt.</div>
            </>
          )}
        </aside>
      )}
    </>
  );
}
