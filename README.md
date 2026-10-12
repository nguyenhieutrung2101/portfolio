# Trung's Corner

Góc sở thích cá nhân của Trung: tủ đĩa nhạc cổ điển, giá sách, và Mèo trông nhà.

Dựng bằng [Astro](https://astro.build), build ra trang tĩnh. JavaScript chỉ chạy ở những phần tương tác (Mèo, giá đĩa, giá sách). Kiến trúc và các quyết định về animation: xem [`docs/kien-truc.md`](docs/kien-truc.md).

## Chạy ở máy

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # kiểm tra kiểu + nội dung, rồi build vào dist/
npm run preview   # xem bản build
```

## Thêm nội dung

Mỗi thứ là một file Markdown trong `src/content/`. Phần đầu file (giữa hai dòng `---`) là thông tin. Phần bên dưới là ghi chú của Trung. Nếu thiếu trường bắt buộc hoặc gõ sai tên trường, `npm run build` sẽ báo lỗi chỉ đúng file đó.

Nội dung hiện có chỉ là **mẫu** (ghi chú in nghiêng "Ghi chú mẫu…"). Thay bằng lựa chọn và cảm nhận của bạn.

### Nhà soạn nhạc: `src/content/composers/<id>.md`

Tên file chính là `id`, đồng thời là đường dẫn: `chopin.md` → `/nhac/chopin/`.

```md
---
name: Frédéric Chopin
born: 1810
died: 1849            # bỏ trống nếu còn sống
era: romantic         # baroque | classical | romantic | modern | contemporary
sleeveColor: pink     # green | yellow | pink | purple | blue | sand
intro: "Người viết piano như viết thơ."
catLine: "…"          # (tuỳ chọn) câu Mèo nói khi mở ngăn này
---

Cảm nhận của Trung về Chopin…
```

### Tác phẩm: `src/content/works/<id>.md`

```md
---
composer: chopin              # id của nhà soạn nhạc (tên file, không có .md)
title: Ballade No. 1 in G minor
catalogue: Op. 23             # (tuỳ chọn)
form: Ballade                 # (tuỳ chọn) hiện dưới đĩa
recording:                    # (tuỳ chọn) bản thu bạn chọn
  performer: Krystian Zimerman
  year: 1987
links:                        # (tuỳ chọn) thiếu link nào thì nút đó thành "Tìm trên …"
  spotify: https://open.spotify.com/…
  youtube: https://www.youtube.com/watch?v=…
  appleMusic: https://music.apple.com/…
addedAt: 2026-10-02           # ngày thêm, dùng cho mục "Mới thêm vào"
favorite: true                # (tuỳ chọn) xếp lên đầu, có dấu ♥
---

Ghi chú nghe…
```

### Sách: `src/content/books/<id>.md`

```md
---
title: The Art of Loving
author: Erich Fromm
addedAt: 2026-09-05
status: reading      # reading | read | want
quote: "…"           # (tuỳ chọn) câu trích
spineColor: yellow   # (tuỳ chọn) không ghi thì màu được chọn ngẫu nhiên nhưng cố định
---

Điều Trung giữ lại sau khi đọc…
```

Giá sách không chia thể loại. Thứ tự sách được xáo ngẫu nhiên nhưng **cố định** theo tên file: sách mới chen vào một chỗ bất kỳ, sách cũ giữ nguyên chỗ.

## Đưa lên web

Trang là static (`dist/`). Repo đã cấu hình sẵn cho **Cloudflare Workers** qua file `wrangler.jsonc`: tên Worker là `portfolio`, upload thư mục `dist/`, trang 404 lấy từ `src/pages/404.astro`.

Cấu hình build trên Cloudflare (Workers & Pages → portfolio → Settings → Build):

| | |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

Nếu đổi tên Worker trên dashboard thì phải sửa `name` trong `wrangler.jsonc` cho trùng. Muốn deploy thẳng từ máy: `npx wrangler login`, rồi `npm run deploy`.

Sau này nếu muốn thêm bài ngay trên điện thoại mà không cần mở code: thêm [Keystatic](https://keystatic.com). Đây là CMS lưu thẳng vào git và đọc được các file Markdown ở trên.

## Cấu trúc

```
src/
  content.config.ts      schema của composers / works / books
  content/               nội dung (Markdown)
  layouts/Base.astro     khung trang: header, tab bar, Mèo (sống xuyên các trang)
  pages/                 /, /nhac/, /nhac/[composer]/, /sach/
  components/            Cat (SVG), GuideSheet, Sleeve
  scripts/
    spring.ts            spring engine (response + damping kiểu Apple)
    sheet.ts             bottom sheet kéo được (momentum projection, rubber-band)
    press.ts             phản hồi khi chạm
    rack.ts              giá đĩa đồng bộ theo scroll
    cat-brain.ts         hành vi của Mèo
    cat-bus.ts           sự kiện giữa trang và Mèo
  lib/library.ts         truy vấn nội dung, xáo giá sách, link nghe
```
