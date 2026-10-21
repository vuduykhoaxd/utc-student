# Giao thức API UTC

Ghi chép lại luồng mạng của hệ thống quản lý đào tạo UTC, đối chiếu với
`apitest/mainjwt.py` và `apitest/ThoiKhoaBieu.py` (đã chạy thật, thành công).

Mọi khẳng định trong tài liệu này đều đã **đo trực tiếp** trên
`https://qldt.utc.edu.vn`, không phải suy đoán.

---

## 1. Địa chỉ

| Mục đích | URL |
| --- | --- |
| Trang đăng nhập | `https://qldt.utc.edu.vn/congthongtin/login.aspx` |
| Trang sau đăng nhập | `https://qldt.utc.edu.vn/congthongtin/Index.aspx` |
| Đổi mật khẩu | `https://qldt.utc.edu.vn/congthongtin/Pages/ChangePass.aspx` |
| API sinh viên | `https://qldt.utc.edu.vn/sinhvienapi/api/{MODULE}/{ACTION}` |
| Cổng API (khai báo trong JS của trang) | `https://api-apis.com` |

Trang web khai báo nhiều microservice qua `Init_API()`
(`/cmsapi/api`, `/sinhvienapi/api`, `/quanlydiemapi/api`, …), nhưng các request
thực tế mà trình duyệt gửi đi vẫn nhắm vào `qldt.utc.edu.vn`.

---

## 2. CORS

Đo bằng preflight `OPTIONS` như trình duyệt sẽ gửi:

```
OPTIONS /sinhvienapi/api/SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv
Origin: http://localhost:8130
Access-Control-Request-Method: POST

HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

CORS **mở**. Nhưng `*` kèm `credentials: 'include'` là tổ hợp bị cấm — xem mục 6.

---

## 3. Đăng nhập

Portal là ASP.NET WebForms: mọi form POST đều phải kèm trạng thái ẩn.

### Bước 1 — GET trang đăng nhập

```
GET /congthongtin/login.aspx
→ 200, text/html
```

Trả về ba trường ẩn bắt buộc:

| Trường | Ý nghĩa |
| --- | --- |
| `__VIEWSTATE` | Trạng thái view của form |
| `__VIEWSTATEGENERATOR` | Mã sinh trạng thái |
| `__EVENTVALIDATION` | Dữ liệu chống giả mạo sự kiện |

> Trong `api/utc-client.js` các trường này được đọc bằng `DOMParser`, không dùng
> regex: giá trị `__VIEWSTATE` rất dài và có thể chứa `>`, `<`, dấu nháy.

### Bước 2 — POST thông tin đăng nhập

```
POST /congthongtin/login.aspx
Content-Type: application/x-www-form-urlencoded

username=...&password=...&cms_authenticate_do_login=ĐĂNG NHẬP
&__VIEWSTATE=...&__VIEWSTATEGENERATOR=...&__EVENTVALIDATION=...
```

| Kết quả | Ý nghĩa |
| --- | --- |
| `302` + `Location: /congthongtin/Index.aspx` | Thành công |
| `200` (render lại form) | Sai tài khoản / mật khẩu |

Response thành công thiết lập **hai cookie `.Auth`** (session + forms auth ticket).
Trong body của 302 **không** có token.

### Bước 3 — Lấy token từ trang sau đăng nhập

```
GET /congthongtin/Index.aspx      (kèm cookie .Auth)
→ 200
```

Trang nhúng:

```html
<script type="text/javascript">AXYZCLRVN = () => "OlgIPC4OKjI1..."</script>
```

### Bước 4 — Giải mã token

```
tokenJWT = Base64Decode(AXYZCLRVN()) XOR "AzzS"     →  JSON
```

JSON thu được có bốn khoá:

| Khoá | Ví dụ |
| --- | --- |
| `rootPath` | `/congthongtin` |
| `rootPathUpload` | `/upload` |
| `userId` | `D0086336A1C34D9187930382C55EA30A` |
| `tokenJWT` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…` (347 ký tự) |

---

## 4. Gọi API sinh viên

```
POST /sinhvienapi/api/SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv
Authorization: Bearer <tokenJWT>
Referer: https://qldt.utc.edu.vn/congthongtin/Index.aspx
X-Requested-With: XMLHttpRequest
```

Body (form field `A`):

```js
A = Base64( utf8( XOR( JSON.stringify(body), actionCode ) ) )
```

- `actionCode` = phần sau dấy `/` trong action, VD `DSA4BRINKCIpAiAPKSAv`
- `iM` = `"AzzSystem"`

```jsonc
{
  "action": "SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv",
  "iM": "AzzSystem",
  "strChucNang_Id": "AF6FFE7566A84F058C31083395D4ED4B",
  "strNguoiThucHien_Id": "D0086336A1C34D9187930382C55EA30A",
  "func": "pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan",
  "strQLSV_NguoiHoc_Id": "…",
  "strNgayBatDau": "13/10/2026",
  "strNgayKetThuc": "19/10/2026"
}
```

Phản hồi:

```jsonc
{ "Success": true, "Data": { "B": "<Base64(XOR(json, 'AzzSystem'))>" } }
```

**Đã đo:** gọi API mà thiếu header `Authorization` trả về **401**, dù có cookie
`.Auth`. Bearer token là bắt buộc.

---

## 5. Đổi mật khẩu

```
GET /congthongtin/Pages/ChangePass.aspx     (kèm cookie .Auth)
→ 200, form có: old_password, new_password, retype_password + 3 trường __VIEWSTATE

POST /congthongtin/Pages/ChangePass.aspx
Content-Type: application/x-www-form-urlencoded

old_password=...&new_password=...&retype_password=...
&cms_authenticate_do_login=...&__VIEWSTATE=...&__VIEWSTATEGENERATOR=...&__EVENTVALIDATION=...
```

WebForms báo **thất bại bằng cách render lại chính trang đó**, nên phải kiểm tra
xem response còn chứa `name="new_password"` hay không. Đó là cách
`utc-client.js` phân biệt thành công / thất bại.

---

## 6. Vướng duy nhất: cookie phiên

Đây là điểm quyết định kiến trúc, và nó **không giải quyết được bằng JavaScript**.

Portal trả `Access-Control-Allow-Origin: *`. Theo đặc tả CORS, một
`Access-Control-Allow-Origin` dạng wildcard **không được dùng** cùng
`credentials: 'include'` — trình duyệt sẽ chặn toàn bộ response.

Hệ quả:

- Không đọc được `Set-Cookie` từ response POST → mất cookie `.Auth`.
- `fetch` mặc định `credentials: 'same-origin'` → gửi request không kèm cookie.

Mà cookie `.Auth` lại là thứ **bắt buộc** cho cả bước 3 và cả luồng đổi mật khẩu.

### Ba lựa chọn

| Lựa chọn | Cách làm | Đánh giá |
| --- | --- | --- |
| **A. Proxy cùng origin** | Một shim mỏng giữ cookie rồi chuyển tiếp | **Chạy được ngay.** Không phải chạy local — deploy ở bất kỳ đâu |
| **B. Nhờ UTC mở CORS** | Thêm `Access-Control-Allow-Credentials: true` và khai báo origin cụ thể | Cần phía trường can thiệp |
| **C. Chấp nhận giới hạn** | Chỉ dùng được phần không cần cookie | Bước 3 sẽ không lấy được token |

`scripts/api/config.js` có `MODE = 'direct' | 'proxy'`:

- `direct` → gọi thẳng portal. Phần hiển thị, phân tích token, đổi mật khẩu đều
  chạy đúng; bước lấy token sẽ báo lỗi rõ ràng nếu cookie bị chặn.
- `proxy` → trỏ `BASE_URL` về shim của bạn. Đây là chế độ dùng được đầy đủ.

Proxy **không phải** phần cốt lõi: nó không chứa logic nghiệp vụ, chỉ giữ cookie
và chuyển tiếp. Toàn bộ xử lý viewstate / XOR / token nằm ở frontend.

---

## 7. Kiểm chứng phần mã hoá

`scripts/api/crypto.js` được đối chiếu với Python theo ba vector:

| Vector | Kết quả |
| --- | --- |
| `encrypt(obj, "DSA4BRINKCIpAiAPKSAv")` | khớp từng byte |
| `encrypt(obj, "AzzS")` | khớp từng byte |
| `encrypt(obj, "AzzSystem")` | khớp từng byte |
| Chuỗi có emoji 😀 (ngoài BMP) | giữ nguyên, round-trip đúng |
| Blob token **thật** lấy từ HAR (616 ký tự) | giải mã ra JWT 347 ký tự, đúng `userId` |

### Chi tiết đáng ghi nh��m

Reference Python XOR trên **code point Unicode**, không phải byte:

```python
"".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(text))
```

Hai điều dễ làm sai khi port sang JS:

1. `str.length` đếm **UTF-16 code unit**, còn `enumerate()` đếm code point →
   phải duyệt bằng `for...of`.
2. Phải dùng `String.fromCodePoint()`, **không** dùng `String.fromCharCode()`.
   `fromCharCode` cắt còn 16 bit, khiến emoji thành surrogate lẻ rồi bị
   `TextEncoder` đổi thành `U+FFFD`.

Cả hai lỗi này đều đã bị bắt khi đối chiếu vector, không phải khi đoán.