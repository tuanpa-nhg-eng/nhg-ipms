---
type: org-requirement
title: Tài liệu nội bộ nằm ngoài repo code
description: Thư mục nào bị .gitignore và hệ quả khi viết tài liệu hoặc dẫn nguồn
tags: [policy, git]
verified: 2026-08-06
sources: [.gitignore]
---
Chính sách "tài liệu nội bộ không vào repo code" (mật/scoping) loại khỏi git:
`00-boi-canh/`, `01-nghien-cuu/`, `02-dac-ta/`, `03-ke-hoach-ngan-sach/`,
`04-pitch/`, `09-so-tay-nguoi-dung/`, `10-trai-nghiem-nen-tang/`,
`11-khao-sat-yeu-cau/`, `STATUS.md`, `/README.md`, `gg-io-nhg/`, thư mục theo
năm trong `12-khach-hang` (hồ sơ khách thật), và `.claude` trừ `.claude/skills`.
Xem [.gitignore](../.gitignore).

`graphify-out/` và `.graphify-cache/` **không bao giờ** vào git: bản đồ tri
thức dựng từ spec + BRD là dẫn xuất của tài liệu mật, commit nó là lách chính
sách bằng cửa sau — nội dung vẫn ra ngoài, chỉ đổi định dạng.

Hệ quả khi làm việc: kế hoạch trục và spec **chỉ tồn tại trên đĩa máy này**.
Không giả định người clone repo đọc được chúng; mọi bất biến cần cưỡng chế phải
có mặt trong mã + test, không chỉ trong tài liệu.

`docs/` (kernel + bundle này) **được git theo dõi** — chốt 06/08/2026. Vì vậy
kernel và các entry chỉ chứa sự thật kỹ thuật, không chứa nội dung nghiệp vụ
mật.
