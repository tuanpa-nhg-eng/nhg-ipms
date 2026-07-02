# NHG Icon System

Hệ icon chuẩn cho app / web app NHG. Triết lý giống token màu:
**chọn theo ý nghĩa, không chọn theo hình.** Mỗi hành động/khái niệm ánh xạ tới
một icon cố định (xem `icon-map.json`) để toàn sản phẩm nhất quán.

## 1. Vì sao dùng Lucide (không tự vẽ)

| Tiêu chí | Lý do |
|---|---|
| **Bản quyền** | MIT — dùng thương mại tự do |
| **Phong cách** | Stroke, lưới 24px, bo tròn nhẹ → hợp tinh thần “uy tín, rõ ràng” của NHG |
| **Độ phủ** | ~1.5k icon, đủ cho mọi tác vụ app (CRUD, dashboard, status, media…) |
| **Tích hợp** | `lucide-react` (tree-shakeable), web/CDN, Figma plugin |
| **Bảo trì** | Cộng đồng lớn, cập nhật đều — không gánh chi phí tự vẽ & QA |

> Chỉ tự vẽ icon khi Lucide **không có** khái niệm đó. Khi vẽ: lưới 24px,
> stroke 2, `stroke="currentColor"`, `fill="none"`, viewBox `0 0 24 24`,
> bỏ vào `icons/custom/` và thêm key vào `icon-map.json` (prefix `custom:`).

## 2. Token kích thước (đừng dùng px tuỳ ý)

| Token | px | Dùng cho |
|---|---|---|
| `--nhg-icon-xs` | 16 | bảng dày đặc, icon cạnh chữ 12–14px |
| `--nhg-icon-sm` | 20 | **mặc định UI**: nút, menu, input |
| `--nhg-icon-md` | 24 | toolbar, touch target |
| `--nhg-icon-lg` | 32 | tiêu đề mục, empty state |
| `--nhg-icon-xl` | 48 | feature block, onboarding |

Stroke mặc định **2** (`--nhg-icon-stroke`). Kích thước lớn (≥32) có thể giảm còn 1.75 để nhẹ mắt.

## 3. Màu — luôn theo token, qua `currentColor`

Icon kế thừa màu chữ. Đổi “tông” bằng class role, không hard-code màu:

```html
<i data-lucide="check-circle" class="nhg-icon nhg-icon--success"></i>
<i data-lucide="trash-2"      class="nhg-icon nhg-icon--danger"></i>
<i data-lucide="settings"     class="nhg-icon nhg-icon--muted"></i>
```

Role có sẵn: `--primary --accent --muted --strong --success --warning --danger --info`.
Vì dùng `currentColor`, icon tự đúng ở light/dark mà không cần khai báo thêm.

## 4. Tích hợp Next.js (lucide-react)

```bash
npm install lucide-react
```

```tsx
// components/Icon.tsx — wrapper chuẩn hoá size + role theo token NHG
import { icons, type LucideProps } from 'lucide-react';
import iconMap from '@/icons/icon-map.json';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const px: Record<Size, number> = { xs:16, sm:20, md:24, lg:32, xl:48 };

// name = đường dẫn ngữ nghĩa, vd "actions.approve"
export function Icon({ name, size='sm', className='', ...rest }:
  { name: string; size?: Size } & Omit<LucideProps,'size'>) {
  const lucideName = name.split('.').reduce((o:any,k)=>o?.[k], iconMap as any);
  const Cmp = icons[toPascal(lucideName)];
  if (!Cmp) return null;
  return <Cmp size={px[size]} strokeWidth={2}
    className={`nhg-icon nhg-icon--${size} ${className}`} {...rest} />;
}
const toPascal = (s:string)=> s.replace(/(^\w|-\w)/g, m=>m.replace('-','').toUpperCase());
```

```tsx
// Dùng theo Ý NGHĨA, không theo tên icon
<Icon name="actions.approve" size="sm" className="nhg-icon--success" />
<Icon name="navigation.dashboard" />
<button className="nhg-icon-btn"><Icon name="actions.search" /></button>
```

## 5. Accessibility (bắt buộc)

| Trường hợp | Cách làm |
|---|---|
| Icon **trang trí** (kèm chữ rõ nghĩa) | `aria-hidden="true"`, không cần label |
| Icon **mang nghĩa một mình** (icon-only button) | `aria-label="Tìm kiếm"` trên nút |
| Icon trong link | đảm bảo link có text hoặc `aria-label` |
| Trạng thái màu (success/danger) | **không** chỉ dựa vào màu — thêm chữ/`<title>` |

Vùng chạm tối thiểu **40×40px** (dùng `.nhg-icon-btn`) dù icon chỉ 20px.

## 6. Do / Don't

**✓ Nên**
- Tham chiếu qua `icon-map.json` (ý nghĩa → icon)
- Một icon cho một ý nghĩa, dùng nhất quán toàn app
- Size theo token; màu theo role/`currentColor`
- Đặt `aria-label` cho icon-only

**✗ Không**
- Trộn nhiều bộ icon (filled + stroke + emoji) trong cùng giao diện
- Hard-code màu hex lên icon
- Phóng to icon 16px lên 40px (mờ/lệch stroke) — chọn đúng size token
- Dùng icon mơ hồ thay cho nhãn chữ ở hành động quan trọng

## 7. File trong bộ này
- `icons/icon-map.json` — bản đồ ngữ nghĩa → Lucide (nguồn sự thật)
- `icons/icon-gallery.html` — gallery tra cứu, render icon thật, có light/dark + đổi size
- `styles/nhg-icons.css` — size tokens, `.nhg-icon`, role, `.nhg-icon-btn`
- `icons/custom/` — (khi cần) icon NHG tự vẽ Lucide không có
