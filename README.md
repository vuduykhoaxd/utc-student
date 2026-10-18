# UTC Student

Cổng thông tin dành riêng cho sinh viên **Trường Đại học Giao thông vận tải và Truyền thông (UTC)** —
bản thay thế cho `qldt.utc.edu.vn`.

Xây dựng **hoàn toàn bằng HTML, CSS và JavaScript thuần**: không framework, không bundler,
không bước build. Mở `index.html` là chạy.

---

## 1. Chạy dự án

Vì dùng ES Modules, cần phục vụ qua HTTP (không mở trực tiếp bằng `file://`).

```bash
# Python 3 — có sẵn trên Windows/macOS/Linux
python -m http.server 8000

# hoặc Node.js
npx serve .

# hoặc VS Code: Live Server extension
```

Mở <http://localhost:8000>.

> **Không cần cài gì.** Dự án không có dependency, không có `node_modules`.

### Tài khoản trải nghiệm

Hệ thống **cố ý không có chức năng đăng ký** — tài khoản do Nhà trường cấp, mỗi tài khoản
gắn với một mã sinh viên duy nhất.

| Họ tên | Mã sinh viên | Mật khẩu |
| --- | --- | --- |
| Nguyễn Thị Mai Anh | `2251010234` | `123456` |
| Trần Quốc Bảo | `2251010567` | `123456` |
| Lê Hoàng Long | `2251010788` | `123456` |

Trang đăng nhập có nút điền nhanh cho 3 tài khoản này. Hệ thống còn có 10 sinh viên, 8 môn
học, 8 tin tức, 12 tài liệu, 6 cuộc trò chuyện… (xem `scripts/data/seed.js`).

---

## 2. Các phần chức năng

| # | Mục | Mô tả |
| --- | --- | --- |
| — | **Đăng nhập** | Màn hình pre-auth tách đôi, kiểm tra form, hiện/ẩn mật khẩu, thử tài khoản nhanh. **Không có đăng ký.** |
| 1 | **Tin tức & Thông báo** | Bài nổi bật, 6 chuyên mục, tìm kiếm, đánh dấu đã đọc, trang đọc kèm tệp đính kèm và bài liên quan. |
| 2 | **Thời khóa biểu** | Lưới tuần thật (buổi học chiếm đúng số giờ qua `grid-row: span`), chế độ theo ngày cho mobile, đếm ngược kỳ thi, biểu đồ khối lượng học, thẻ môn kèm chuyên cần. |
| 3 | **Hồ sơ** | **Chỉ sửa được phần giới thiệu, tối đa 500 ký tự.** Mọi thông tin khác hiển thị read-only kèm biểu tượng ổ khóa và bị chặn ở tầng API. |
| 4 | **Tìm bạn bè** | Tìm theo **mã sinh viên**, gửi / chấp nhận / từ chối lời mời, gợi ý kết bạn, mở chat 1-1. |
| 5 | **Tin nhắn** | Chat 1-1 và **tạo nhóm chat**, tin nhắn văn bản. Kiến trúc sẵn sàng cho ảnh / tin thoại / GIF / tệp / gọi. |
| 6 | **Bài đăng** | Đăng bài, **Like / Dislike**, bình luận, tìm kiếm, lọc "bạn bè", xoá bài của chính mình, bảng xếp hạng. |
| 7 | **Tài liệu** | Chia sẻ tài liệu (**môn học + tiêu đề + mô tả tuỳ chọn + timestamp + tác giả**), lọc theo môn / loại tệp / học kỳ, 4 kiểu sắp xếp, phân trang, tải xuống, đánh giá hữu ích. |
| + | **Tổng quan** | Chào theo giờ, đếm ngược kỳ thi, thẻ số liệu, lịch học hôm nay, hoạt động gần đây, chuyên cần. |
| + | **Kết quả học tập** | Bảng điểm học kỳ, **bấm vào từng môn để xem cấu thành điểm**, điểm TB / GPA / tín chỉ, lọc đã chốt - đang tạm, thang điểm, lịch sử các kỳ trước, xuất CSV, in. |
| + | **Tìm kiếm toàn cục** | `Ctrl/⌘ + K` — palette tìm **đồng thời** trong tài liệu, bài đăng, tin tức, môn học và sinh viên; điều hướng bằng `↑ ↓ Enter`. |
| + | **Thông báo** | Hộp thư, lọc theo nhóm, đánh dấu đã đọc, xoá. |
| + | **Cài đặt** | Chủ đề, mật độ hiển thị, **mức hiệu ứng nền**, bộ lọc thông báo, khôi phục dữ liệu mẫu, danh sách phím tắt. |

### Quy tắc nghiệp vụ đã hiện thực

- **Không có đăng ký.** Mỗi tài khoản gắn đúng một mã sinh viên.
- **Hồ sơ chỉ sửa được `bio`**, tối đa **500 ký tự**, có bộ đếm ký tự trực tiếp.
  `users.updateProfile()` **từ chối ở tầng API** nếu payload chứa bất kỳ trường nào ngoài `bio` —
  kể cả khi gọi thủ công từ console.
- **Thích / không thích loại trừ lẫn nhau** trên bài đăng.
- **Chỉ tác giả** mới xoá được bài đăng / tài liệu của mình.
- Tìm kiếm **không phân biệt dấu tiếng Việt**: gõ `lap trinh` vẫn ra `Lập trình`.

---

## 3. Cấu trúc thư mục

```
FrontEnd/
├── index.html                  # Điểm vào duy nhất
├── 404.html                    # Trang dự phòng cho GitHub Pages
├── manifest.webmanifest        # Metadata PWA
├── robots.txt
├── .nojekyll                   # Tắt xử lý Jekyll của GitHub Pages
├── .github/workflows/pages.yml # Deploy tự động lên GitHub Pages
├── assets/
│   ├── favicon.svg             # Icon vector nhúng tay
│   ├── og-image.svg            # Ảnh chia sẻ 1200×630 (nên xuất sang .png)
│   └── fonts/                  # 30 file .woff2 — Be Vietnam Pro, Sora, JetBrains Mono
├── styles/
│   ├── styles.css              # MANIFEST — khai báo thứ tự nạp
│   ├── base/
│   │   ├── fonts.css           # @font-face (sinh tự động từ Google Fonts)
│   │   ├── tokens.css          # Màu, typography, spacing, motion, light/dark theme
│   │   ├── reset.css           # Reset hiện đại + hợp đồng kích thước icon
│   │   ├── typography.css      # Vai trò chữ
│   │   ├── textures.css        # Aurora, film grain, dot/grid, scanline, glass
│   │   ├── animations.css      # Toàn bộ @keyframes + hệ thống chuyển động + data-fx
│   │   └── utilities.css       # Layout, tiện ích, mật độ hiển thị
│   ├── components/             # button, card, form, badge, overlay, navigation, palette
│   ├── layout/                 # app-shell, sidebar, topbar
│   └── features/               # Mỗi tính năng một file CSS riêng
└── scripts/
    ├── main.js                 # Entry: theme → prefs → lớp nền → session → router → phím tắt
    ├── core/
    │   ├── api.js              # ★ Toàn bộ API — điểm duy nhất để thay backend
    │   ├── db.js               # Chỉ tầng này chạm vào localStorage
    │   ├── app-store.js        # State: auth, theme, sidebar, toast
    │   ├── preferences.js      # Tuỳ chọn người dùng → data-attribute trên <html>
    │   ├── store.js            # Observable store tối giản
    │   └── router.js           # Hash router + route guard
    ├── data/
    │   └── seed.js             # Dữ liệu mẫu (gồm grades, gradeScale, gradeHistory)
    ├── utils/
    │   ├── dom.js              # el() / render() / setStyles()
    │   ├── format.js           # Ngày giờ, số, tiền tố, bỏ dấu tiếng Việt
    │   ├── motion.js           # Reveal khi cuộn, spotlight, ripple, đếm số
    │   └── storage.js          # Wrapper localStorage có namespace
    ├── components/
    │   ├── ui.js               # Nguyên tử giao diện (button, panel, stat, avatar…)
    │   ├── forms.js            # field, input, textarea, select, checkbox, dropzone
    │   ├── overlay.js          # modal, drawer, confirm, lightbox (có focus trap)
    │   ├── menu.js             # Menu & popover neo vào trigger
    │   ├── icons.js            # ~90 icon SVG trong một registry
    │   ├── command-palette.js  # ★ Tìm kiếm toàn cục (Ctrl/⌘ + K)
    │   ├── toast.js            # Host của toast
    │   ├── sidebar.js          # Thanh điều hướng
    │   ├── topbar.js           # Thanh trên cùng
    │   ├── app-shell.js        # Khung ứng dụng
    │   └── page.js             # Khung trang dùng chung
    ├── features/
    │   └── chat/
    │       └── attachmentRegistry.js   # ★ Kiến trúc mở rộng tin nhắn
    └── pages/                  # Một module cho mỗi route
```

### Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
| --- | --- | --- |
| Hàm / thành phần | `camelCase`, dùng động từ | `formatDate`, `emptyState`, `attachRipple` |
| Hằng số | `SCREAMING_SNAKE_CASE` | `BIO_MAX_LENGTH`, `ROUTE_EVENT` |
| Lớp CSS | `kebab-case` | `.post-card`, `.panel__header`, `.attach--voice` |
| Custom property | `--token-name` | `--surface-1`, `--primary-soft`, `--hour-h` |
| Biến CSS động | `--reveal-delay`, `--spot-x` | gán bằng `style.setProperty()` |
| Hàm sự kiện | `handleX` / `onX` | `handleSubmit`, `onNavigate` |
| Boolean | `isX` / `hasX` / `shouldX` | `isActive`, `hasUnread`, `viewOwnsOutlet` |
| ID | `handleX` | `handleOpenSettings`, `login-student-id` |

---

## 4. Hệ thống animation & texture

Nằm ở `styles/base/textures.css` và `styles/base/animations.css`.

### Texture — toàn bộ dựng bằng CSS/SVG nội tuyến, **không dùng ảnh nào**

| Kỹ thuật | Dùng ở đâu |
| --- | --- |
| Aurora field — 4 khối màu trôi theo 4 đường cong độc lập | Nền toàn trang |
| Film grain — `feTurbulence fractalNoise`, jitter 6 bước | Lớp nhiệp ký trên mọi nền |
| Blueprint grid — 2 trục đường kẻ, mask bằng gradient | Hero, hero hồ sơ, ô nội dung |
| Dot matrix, scanline, sọc nguy hiểm, weave | Panel, dropzone, banner |
| Glass — `backdrop-filter` + inner highlight | Sidebar, topbar, card, panel |
| Viền gradient tạo bằng `mask-composite` | Card, avatar nhóm |
| Ánh sáng đuổi theo con trỏ (`--spot-x/y`, rAF-throttle) | Nền + card + quick-card |
| Conic gradient xoay | Ánh sáng trang đăng nhập |

### Animation

- **Entrance** — `rise-in`, `slide-in-left/right`, `scale-in`, `pop-in`, `flip-in-y`
- **Reveal khi cuộn** — `IntersectionObserver` + `--reveal-delay` để so lep danh sách
- **Hover** — nâng (`lift`), spotlight, shine quét, xoay/phóng icon
- **Nhấn** — `pressable` co lại, ripple lan toả (delegation, chỉ 1 listener cho cả tài liệu)
- **Chuyển route** — wipe gradient + `rise-in`, đồng thời dispatch `utc:route` để sidebar/topbar đồng bộ
- **Trạng thái chờ** — skeleton sweep, spinner, progress bar không xác định
- **Chi tiết** — marquee vô hạn (dừng khi hover), con dấu đếm số, caret nhấp nháy, equalizer
- **Hệ giờ cốc định** — `--dur-fast…slow` × `--ease-out / --ease-spring / --ease-smooth`
- **Tôn trọng `prefers-reduced-motion`** — mọi animation gộp về 0.01ms; hiệu ứng con trỏ, ripple
  và reveal bị tắt hẳn (không chỉ rút ngắn)

### Hiệu năng — vì sao app lớn vẫn mượt khi vừa nhiều dữ liệu vừa nhiều animation

Câu trả lời ngắn: **animation không phải thứ tốn thời gian.** Animation `transform`/`opacity`
chạy trên **compositor thread**, tách biệt hoàn toàn khỏi main thread. Cái tốn thời gian là
**paint lại những vùng lớn**. App lớn mượt không phải vì chúng animate ít, mà vì chúng không
bao giờ bắt trình duyệt vẽ lại những thứ không cần vẽ lại.

Bốn quy tắc thực tế đã áp dụng ở đây, đều kèm số đo:

#### 1. `filter: blur()` trên một lớp lớn là điều tốn kém nhất

Một `blur` trong CSS **không phải texture được cache** — nó được tính lại mỗi khi bất kỳ
thứ gì phía trên nó trong stacking context thay đổi. Aurora trước đây là 4 blob ~750 px,
`blur(72px)` + `mix-blend-mode: screen` ≈ 2,2 triệu pixel bị blur lại ở **mỗi lần đổi route**.

| Cấu hình | Thời gian đổi tab (trung bình 10 route) |
| --- | --- |
| Như cũ: blur 72px + blend `screen` | 74,9 ms |
| Bỏ blend | 64,7 ms |
| **Bỏ blur** | **47,4 ms** |
| Bỏ hẳn `.backdrop` | 47,4 ms |

Cách sửa: gradient radial đã **tự mềm** khi chạm `transparent` trước mép — nên blur gần như
thừa. Bốn chặng màu mềm cho cùng cái nhìn, chỉ tốn một lần paint. Không cần `blur`, không
cần blend, vẫn trôi bằng `transform`.

#### 2. Không bao giờ blur bề mặt dính (sticky)

`.sidebar` và `.topbar` đều `position: sticky` và từng có `backdrop-filter: blur(48px)`.
Nội dung trượt **dưới** chúng ở mọi khung hình cuộn → trình duyệt phải lấy mẫu lại nền
đang di chuyển. Đây đúng là trường hợp tệ nhất của `backdrop-filter`.

Nay chúng dùng nền gần đục (94–97 % opacity). Không có gì trượt qua để blur, nên chỉ tốn
đúng một lần paint.

#### 3. Đừng vẽ gradient toàn màn hình để che một sự chuyển cảnh

`route-wipe` cũ là một gradient phủ `inset: 0` animate `scaleX` trong 620 ms — một layer
toàn màn hình nằm trên toàn app, chỉ để trang trí. Đo được ~9 % tổng chi phí đổi route.

Nay là một đường tiến trình 3px dưới topbar: cùng tín hiệu "đang chuyển", vài trăm pixel
thay vì cả màn hình.

Router cũng từng ép `opacity: 0` rồi xoá ở frame kế tiếp quanh mỗi lần đổi trang — bắt
trình duyệt **repaint toàn bộ outlet hai lần** mà chẳng thấy gì. Đã bỏ.

#### 4. Đừng vẽ cái đang ngoài màn hình

`content-visibility: auto` + `contain-intrinsic-size` cho phép bỏ qua layout/paint/composite
của mọi thứ đang lọt ngoài viewport, và khôi phục ngay khi nó cuộn tới. Không đổi gì về
mắt thường — chỉ ngừng vẽ cái không ai nhìn thấy.

#### Kết quả tổng hợp

| | Trước | Sau |
| --- | --- | --- |
| Đổi tab (trung bình 10 route) | 74,9 ms | **47,7 ms** |
| Frame chậm khi cuộn (6 route) | 3,5 – 33,7 % | **0 %** |

Đã kiểm tra không vỡ layout: chiều cao trang trước/sau thay đổi **0 px** trên cả 12 route.

#### Ba mức hiệu ứng cho người dùng

`Cài đặt → Hiệu ứng & chuyển động` ghi `data-fx` lên `<html>`:

| Mức | Hành vi | Frame > 32 ms (cuộn) |
| --- | --- | --- |
| **Đầy đủ** | Aurora trôi, grain rung, spotlight theo con trỏ | 43 % |
| **Giảm** | Giữ hình ảnh, bỏ blend + bỏ animation nền | 16,6 % |
| **Tắt** | Ẩn toàn bộ lớp nền | **0 %** |

Tuỳ chọn `prefers-reduced-motion` của hệ điều hành có quyền ưu tiên tuyệt đối và ghi đè
mọi lựa chọn trong ứng dụng.

---

## 5. Triển khai lên GitHub Pages

Dự án **không có bước build**. HTML, CSS và ES module được phát thẳng, nên GitHub Pages
phục vụ được nguyên bản.

### Cách 1 — GitHub Actions (khuyến nghị)

Repo đã có sẵn `.github/workflows/pages.yml`.

1. Push code lên nhánh `main`.
2. Vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
3. Workflow sẽ tự chạy và xuất URL ở mục `deploy → environment`.

### Cách 2 — Deploy từ nhánh

**Settings → Pages → Source → Deploy from a branch**, chọn `main` và thư mục `/ (root)`.

### Những gì đã chuẩn bị sẵn

| Tệp | Vai trò |
| --- | --- |
| `.nojekyll` | Chặn Jekyll bỏ qua các thư mục bắt đầu bằng `_` hoặc `.` |
| `404.html` | Trang dự phòng khi mở nhầm đường dẫn |
| `manifest.webmanifest` | Cài được như app (PWA metadata) |
| `robots.txt` | Cho phép index |
| `assets/og-image.svg` | Ảnh chia sẻ (xem lưu ý bên dưới) |
| `index.html` | OG/Twitter meta + `?theme=` để ép light/dark từ link |

### Ba điểm cần biết

**1. Đường dẫn đều là tương đối.** Không có `/styles/...` hay `/scripts/...` nào tuyệt
đối, nên dự án chạy được ở cả `user.github.io/` lẫn `user.github.io/ten-repo/`.
Đã kiểm chứng bằng cách phục vụ dưới subpath `/repo/`: toàn bộ route, font và stylesheet
đều nạp đúng, **0 lỗi console**.

**2. Xoá cache sau mỗi lần deploy.** GitHub Pages cache tĩnh khá lâu và tự nó sẽ **không**
lấy bản `styles.css` / `main.js` mới. Vì vậy hai entry point có đuôi `?v=`:

```html
<link rel="stylesheet" href="styles/styles.css?v=20261018">
<script type="module" src="scripts/main.js?v=20261018"></script>
```

**Mỗi lần deploy, tăng con số này** (VD `?v=20261019`). Không có build step nên đây là
cơ chế bust cache duy nhất.

**3. Định tuyến dùng hash (`#/documents`).** Nhờ vậy mọi route đều nằm trong `index.html`,
không cần cấu hình rewrite và không bao giờ gặp 404 khi bấm link sâu. `404.html` chỉ là
lưới an toàn.

**Lưu ý về ảnh chia sẻ:** Facebook, X và LinkedIn **không render SVG** cho `og:image`.
Hãy export `assets/og-image.svg` thành `assets/og-image.png` (1200×630) rồi đổi meta
tag trỏ sang `.png` nếu bạn cần link preview.

### Miền riêng (tuỳ chọn)

Tạo file `CNAME` ở thư mục gốc chứa tên miền (VD `utc-student.vn`), trỏ DNS về
`<user>.github.io`, rồi bật **Enforce HTTPS** trong Settings → Pages.

---

## 6. Chat — kiến trúc mở rộng

Yêu cầu: hiện chỉ gửi tin nhắn văn bản, nhưng cấu trúc phải sẵn sàng cho **hình ảnh, tin
thoại, GIF và gọi thoại**. Toàn bộ phần mở rộng nằm trong **một file duy nhất**:
`scripts/features/chat/attachmentRegistry.js`.

Mọi message đã mang sẵn mảng `attachments` có kiểu:

```js
{ id, kind: 'text',  payload: { text } }
{ id, kind: 'image', payload: { url, width, height, alt } }
{ id, kind: 'voice', payload: { url, durationSec, waveform } }
{ id, kind: 'gif',   payload: { url, provider } }
{ id, kind: 'file',  payload: { name, size, mimeType, url } }
{ id, kind: 'call',  payload: { durationSec, direction, kind: 'voice'|'video' } }
```

Mỗi loại đăng ký:

| Trường | Ý nghĩa |
| --- | --- |
| `enabled` | Đã dùng được chưa |
| `render(attachment)` | Hợp đồng hiển thị trong bong bóng tin |
| `validate(payload)` | Kiểm tra hình dạng payload |
| `COMPOSER_TOOLS` | Nút tương ứng trên ô soạn tin |

**Thêm tính năng mới (ví dụ sticker):**

1. Thêm một entry vào `REGISTRY`
2. Thêm rule `.attach--sticker` vào `styles/features/chat.css`
3. Đặt `enabled: true` và thêm nút vào `COMPOSER_TOOLS`

**Không cần sửa** renderer, store, router hay API.

Các nút chưa bật hiện mờ kèm chấm cam "đang phát triển"; bấm vào sẽ giải thích chính xác
cần bật cờ nào. Dòng *"7 loại tệp đang được phát triển: hình ảnh, tin thoại, GIF, tệp, gọi"*
dưới ô soạn tin được sinh từ `capabilities()` — tự cập nhật khi bật thêm loại.

---

## 7. Thay bằng backend thật

Kiến trúc đã tách sẵn để chỉ cần sửa **một file**.

```
Mọi trang  ──►  scripts/core/api.js  ──►  scripts/core/db.js  ──►  localStorage
                        ▲
                        │  thay phần thân hàm bằng fetch()
                        │
                   backend thật
```

**Bước 1** — đổi mỗi method trong `scripts/core/api.js` sang gọi HTTP. Phía gọi **không đổi**,
vì chúng vốn đã trả về promise:

```js
// scripts/core/api.js
async function list(params) {
  const res = await fetch(`/api/news?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.json();
}
```

**Bước 2** — xoá `scripts/core/db.js`. Không module nào khác đọc storage.

**Bước 3** — giữ nguyên chữ ký `auth.login()` / `auth.logout()`. Giả lập độ trễ (`respond()`) và
lỗi mô phỏng có thể bỏ hoàn toàn.

Các endpoint tương ứng đã có sẵn:

| Nhóm | Method |
| --- | --- |
| `auth` | `login`, `logout`, `session` |
| `users` | `get`, `getByStudentId`, `updateProfile`, `directory` |
| `newsApi` | `list`, `get`, `unreadCount` |
| `schedule` | `term`, `courses`, `getWeek`, `getDay`, `getNextSession`, `exams` |
| `postsApi` | `list`, `get`, `create`, `toggleLike`, `toggleDislike`, `addComment`, `remove` |
| `documentsApi` | `list`, `create`, `download`, `toggleLike`, `remove` |
| `friends` | `search`, `list`, `request`, `accept`, `decline`, `remove` |
| `chatApi` | `list`, `messages`, `send`, `createGroup`, `openDirect`, `markRead` |
| `notificationsApi` | `list`, `unreadCount`, `markRead`, `markAllRead`, `remove` |
| `gradesApi` | `transcript`, `toLetter`, `computeFinal` |
| `dashboard` | `summary` |
| `demo` | `reset` |

### Quản lý dữ liệu mẫu

Lưu ở `localStorage` (khoá `utc-student:db-snapshot`) nên **thay đổi còn giữ sau khi tải lại**.
Đặt lại dữ liệu gốc:

- menu tài khoản (góc trên phải) → **Đặt lại dữ liệu demo**, hoặc
- console: `localStorage.clear()` rồi tải lại trang.

---

## 8. Ghi chú kỹ thuật

**Không phụ thuộc build.** ES Modules gốc, CSS `@import`, CSS custom properties, `oklch()`.
Yêu cầu trình duyệt: **Chrome/Edge 111+, Firefox 113+, Safari 16.4+**.

**Font tải sẵn, không dùng CDN.** Ba bộ font (Be Vietnam Pro cho chữ chạy, Sora cho tiêu đề,
JetBrains Mono cho mã) nằm trong `assets/fonts/`, đủ bộ dấu tiếng Việt, tổng ~486 KB.
Trang vẫn hiển thị đúng khi mất mạng nhờ font dự phòng trong `tokens.css`.

**Chống nháy trắng (FOUC).** Script nhỏ trong `<head>` đặt `data-theme` từ `localStorage`
trước khi stylesheet nạp.

**Không framework, không Virtual DOM.** `el()` trong `scripts/utils/dom.js` dựng node DOM;
`render()` thay nội dung và bỏ qua `null` — khác với `replaceChildren()` gốc vốn biến `null`
thành chuỗi `"null"`.

**Custom property phải dùng `setProperty`.** `Object.assign(el.style, { '--x': v })` **không có
tác dụng** — `setStyles()` trong `dom.js` xử lý đúng việc này.

**Router dùng hash** (`#/documents?course=c3`) nên chạy được trên mọi host tĩnh, không cần
cấu hình rewrite. Route param (`:id`) và query param đều được truyền qua `ctx.params`, ưu tiên
route param khi trùng tên.

**Theme.** Tối mặc định, sáng/tối chuyển tức thì. Bảng màu viết bằng `oklch()` nên hai theme
dùng chung một hệ số sáng/tối. Tôn trọng `prefers-color-scheme` khi người dùng chưa chọn.

**Truy cập.** Skip-link, `aria-label` trên mọi nút icon, focus trap trong modal, thông báo qua
`aria-live`, hỗ trợ `prefers-reduced-motion` và `forced-colors`, bản in ẩn chrome, responsive
từ 360 px trở lên, bàn phím `/` và `Ctrl/Cmd + K` mở tìm kiếm, `Esc` đóng lớp phủ.

**Trình duyệt kiểm thử.** Chrome với DevTools bật *Auto Dark Mode* sẽ tự đảo màu mọi vùng sáng
của theme sáng. CSS vẫn đúng — hãy kiểm tra bằng DevTools → *Rendering* → tắt Auto Dark Mode
trước khi đánh giá thị giác bản sáng.

---

## 9. Tham khảo

- Trường Đại học Giao thông vận tải và Truyền thông: <https://utc.edu.vn>
- Hệ thống quản lý học tập hiện tại: <https://qldt.utc.edu.vn>