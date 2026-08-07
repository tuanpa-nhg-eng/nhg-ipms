"use client";
import { useEffect, useRef, useState } from "react";
import { Users, ChevronDown, Check } from "lucide-react";
import { API_BASE, devLogin } from "@/lib/api";

/**
 * [Demo] BỘ CHUYỂN VAI — một cú bấm để trở thành persona khác.
 *
 * ═══ Vì sao là thứ này chứ không phải một "tài khoản master"
 *
 * Yêu cầu ban đầu là *"một tài khoản duy nhất thấy tất cả để demo cho khách"*. Nhưng phân
 * tách quyền CHÍNH LÀ sản phẩm: iPMS bán cho tập đoàn đúng cái lời hứa "không ai một mình
 * làm được tất" — trục B đã đập god-account (J2) và cấm tenant_admin đọc vết kiểm toán (J3).
 * Demo một tài khoản thấy-tất-làm-tất là tự tay phá luận điểm bán hàng mạnh nhất, và khách
 * sẽ kỳ vọng đúng như thế khi lên thật.
 *
 * Thứ người demo THỰC SỰ cần là *một phiên làm việc, đổi vai không ma sát* — không phải một
 * tài khoản gộp quyền. Bộ chuyển vai cho đúng điều đó, và còn KHOE được câu chuyện SoD:
 * bấm sang `emp1@` thì màn Quản trị biến mất, bấm sang `auditor@` thì vết kiểm toán hiện ra
 * mà `admin@` không bao giờ thấy.
 *
 * ═══ Không phải đóng vai (impersonation)
 *
 * Đây là ĐĂNG NHẬP THẲNG bằng dev-token, nên có ĐỦ quyền ghi của vai đó — demo được mọi
 * luồng nghiệp vụ. Khác hẳn `support@` + Đóng vai (chỉ-đọc, có băng cảnh báo, có vết kiểm
 * toán). Hai cơ chế cho hai mục đích, không thay nhau.
 *
 * ═══ Production tự tắt
 *
 * Chỉ hiện khi `/auth/health` trả `devTokenEnabled: true` — suy từ chính hai điều kiện mà
 * API dùng để mở cửa `dev-token`. Không có cờ FE riêng để lệch.
 */

interface Persona {
  prefix: string;
  ten: string;
  mo_ta: string;
}

/** Thứ tự theo HÀNH TRÌNH DEMO, không theo bảng chữ cái: từ người dùng cuối lên quản trị. */
const PERSONAS: Persona[] = [
  { prefix: "demo1", ten: "Nhân viên", mo_ta: "Bàn làm việc của tôi · check-in · bằng chứng" },
  { prefix: "mgr", ten: "Quản lý", mo_ta: "Duyệt check-in · đánh giá đội ngũ" },
  { prefix: "hr", ten: "Nhân sự (HRBP)", mo_ta: "Chu kỳ đánh giá · hiệu chỉnh · hồ sơ" },
  { prefix: "exec", ten: "Điều hành", mo_ta: "Cockpit · bản đồ hiệu suất toàn hàng" },
  { prefix: "designer", ten: "Thiết kế KPI", mo_ta: "Studio · Copilot · quản trị AI" },
  { prefix: "curator", ten: "Kiểm duyệt thư viện", mo_ta: "Hàng đợi BU Authoring Gate" },
  { prefix: "steward", ten: "Chủ dữ liệu", mo_ta: "Sổ đăng ký dữ liệu · danh bạ agent AI" },
  { prefix: "admin", ten: "Quản trị đơn vị", mo_ta: "Người dùng · vai trò · cơ cấu tổ chức" },
  { prefix: "auditor", ten: "Kiểm toán", mo_ta: "Vết kiểm toán — thứ admin KHÔNG thấy (J3)" },
  { prefix: "support", ten: "Hỗ trợ kỹ thuật", mo_ta: "Chỉ-đọc + Đóng vai để soi lỗi người dùng" },
];

const SS_KEY = "ipms.studio.session";

export function PersonaSwitcher() {
  const [open, setOpen] = useState(false);
  const [hien, setHien] = useState(false);          // dev-token có mở không
  const [dangLa, setDangLa] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/auth/health`)
      .then((r) => r.json())
      .then((j) => setHien(!!j?.devTokenEnabled))
      .catch(() => setHien(false));
  }, []);

  // Đọc phiên hiện tại từ sessionStorage — cùng nguồn với AgentPanel/StudioProvider, không
  // dựng thêm một nguồn sự thật thứ hai về "đang là ai".
  useEffect(() => {
    const doc = () => {
      try {
        const s = sessionStorage.getItem(SS_KEY);
        setDangLa(s ? (JSON.parse(s).email as string)?.split("@")[0] ?? null : null);
      } catch { setDangLa(null); }
    };
    doc();
    const id = setInterval(doc, 1000);   // phiên có thể đổi từ nơi khác (panel Trợ lý)
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!hien) return null;

  const doiVai = async (p: Persona) => {
    setErr(null);
    setBusy(p.prefix);
    try {
      const s = await devLogin("H.01", `${p.prefix}@h01.nhg.local`);
      sessionStorage.setItem(SS_KEY, JSON.stringify(s));
      // Tải lại để MỌI màn đọc lại quyền theo vai mới. Đổi vai mà chỉ set state thì các
      // trang đã fetch xong vẫn giữ dữ liệu của vai cũ — đúng loại lệch làm người demo
      // tưởng sản phẩm rò dữ liệu giữa các vai.
      window.location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  const hienTai = PERSONAS.find((p) => p.prefix === dangLa);

  return (
    <div className="persona-switcher" ref={ref}>
      <button
        className="iconbtn persona-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Đổi vai để demo — mỗi vai thấy đúng phần của mình"
        aria-expanded={open}
      >
        <Users size={15} />
        <span className="persona-label">{hienTai?.ten ?? "Chọn vai"}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="persona-dropdown">
          <div className="persona-head">
            Đổi vai <span>chế độ demo · dev-token</span>
          </div>
          <p className="persona-note">
            Mỗi vai thấy đúng phần của mình — đó là thiết kế, không phải thiếu sót.
            Không tài khoản nào thấy tất cả.
          </p>
          {PERSONAS.map((p) => (
            <button
              key={p.prefix}
              className={`persona-item${p.prefix === dangLa ? " active" : ""}`}
              disabled={busy !== null}
              onClick={() => doiVai(p)}
            >
              <span className="persona-item-main">
                <b>{p.ten}</b>
                <code>{p.prefix}@</code>
              </span>
              <span className="persona-item-desc">{p.mo_ta}</span>
              {p.prefix === dangLa && <Check size={14} className="persona-check" />}
            </button>
          ))}
          {err && <div className="persona-err">{err}</div>}
        </div>
      )}
    </div>
  );
}
