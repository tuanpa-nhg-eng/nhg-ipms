# NHG Group — Design System for AI for Trust & Romance Portal

## 1. Nguyên tắc quan trọng
Logo gốc do người dùng cung cấp phải được **giữ nguyên tuyệt đối**. Không redraw, không bo góc lại, không đổi tỷ lệ, không đổi màu, không thêm hiệu ứng, không tạo phiên bản AI mới thay thế logo chính thức.

## 2. Logo assets
- `logo.png`: logo gốc, dùng cho header, splash screen, tài liệu chính thức.
- `icon-logo.png`: icon được tạo từ phần biểu tượng gốc, không redraw, chỉ tách phần mark và đặt vào canvas vuông trong suốt để dùng cho favicon/app/profile.

## 3. Logo usage
### Master logo
Dùng `logo.png` cho mọi vị trí nhận diện chính.

### Icon logo
Dùng `icon-logo.png` cho các không gian nhỏ: favicon, app icon, avatar hệ thống, sidebar collapsed state.

### Clear space
Khoảng trống tối thiểu quanh logo nên bằng chiều cao chữ “Group” hoặc 12% chiều cao logo, chọn giá trị lớn hơn.

### Không được làm
- Không đổi màu xanh/đỏ/đen của logo.
- Không đặt gradient lên logo.
- Không tách lại ký tự NHG theo kiểu mới.
- Không kéo giãn ngang/dọc.
- Không thêm shadow/glow lên logo trong bản chính thức.
- Không dùng logo trên nền làm giảm tương phản.

## 4. Color tokens
Các màu dưới đây được lấy trực tiếp/tương thích từ logo gốc.

| Token | Hex | Vai trò |
|---|---:|---|
| `brand.green` | `#037236` | Primary, trust, growth, education |
| `brand.red` | `#ED2024` | Accent, romance, urgency, highlight |
| `brand.black` | `#050708` | Authority, text, high contrast |
| `brand.gray` | `#818285` | Secondary text, rules, metadata |
| `brand.white` | `#FFFFFF` | Background, clarity, breathing space |
| `surface.ivory` | `#F8F6F1` | Warm editorial background |
| `surface.mist` | `#EEF3EF` | Soft cards, calm sections |
| `text.primary` | `#101214` | Body copy |
| `text.secondary` | `#5F6668` | Supporting copy |

## 5. Typography direction
Không nhúng font file. Gợi ý hệ chữ:

- Headline/editorial: `Playfair Display`, `Cormorant Garamond`, hoặc serif tương đương để tạo chất “Lãng mạn”.
- UI/body: `Inter`, `IBM Plex Sans`, hoặc sans-serif tương đương để tạo độ rõ ràng và “Uy tín”.
- Data/numeric: dùng cùng sans-serif UI, ưu tiên tabular numbers.

## 6. UI mood
**Uy tín**: rõ ràng, có cấu trúc, dữ liệu minh bạch, trạng thái phê duyệt, dấu kiểm chứng, dashboard bình tĩnh.

**Lãng mạn**: editorial layout, quote cards, human stories, ánh sáng ấm, chuyển động nhẹ, nhiều khoảng thở.

## 7. Components
### Navigation
- Header dùng `logo.png` bên trái.
- Sidebar collapsed dùng `icon-logo.png`.

### Cards
- Border radius: 16–24px.
- Background: `surface.ivory` hoặc trắng.
- Border: `rgba(3,114,54,0.12)`.

### Buttons
- Primary: nền `brand.green`, chữ trắng.
- Accent: nền `brand.red`, chữ trắng, chỉ dùng cho điểm nhấn quan trọng.
- Ghost: chữ `brand.green`, nền trong suốt.

### Dashboard cards
Mỗi card nên có 3 lớp:
1. Data
2. Insight
3. Recommended Action

### Story cards
Cấu trúc khuyến nghị:
- Before
- AI Intervention
- Human Touch
- Impact
- Quote

## 8. Voice & microcopy
Không viết kiểu công nghệ lạnh. Viết theo tinh thần:

> Let AI carry the repetitive work, so people can carry the meaningful work.

> Use data with care. Generate insight with responsibility.

> Take the next step in your AI journey.

## 9. File naming
- `logo.png` — logo gốc preserved.
- `icon-logo.png` — icon từ logo gốc.
- `design-system.md` — tài liệu design system.
- `design-system.json` — design tokens cho dev.
