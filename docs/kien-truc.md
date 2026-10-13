# Kiến trúc & animation

## Vì sao Astro

- **Nội dung là chính, cập nhật định kỳ.** Astro build ra HTML tĩnh, nên trên điện thoại trang hiện ra ngay mà không phải chờ framework JS tải xong. Mỗi trang chỉ tải script của phần tương tác. Không dùng React.
- **Content collections có schema** (`src/content.config.ts`). Thêm một bản nhạc hay một cuốn sách chỉ là thêm một file `.md`. Sai trường thì build báo lỗi.
- **`<ClientRouter />` (View Transitions)** cho chuyển trang mượt như app. Khung thoại của Mèo được đánh dấu `transition:persist`: chuyển trang thì nó không bị dựng lại và con mèo nhỏ vẫn cử động liên tục.
- **URL thật** cho từng nhà soạn nhạc (`/nhac/chopin/`) và từng đĩa hay từng cuốn sách (`#id`), nên chia sẻ được.

## Layout

| | Điện thoại (< 768px) | Laptop (≥ 768px) |
|---|---|---|
| Điều hướng | Tab bar dưới cùng, trong vùng ngón cái, có safe-area | Nav trên header |
| Mèo | Bottom sheet kéo được, nằm trên tab bar | Panel sticky bên phải |
| Header | Lớp vật liệu trong mờ (`backdrop-filter`), nội dung cuộn bên dưới | như bên trái |

Hover chỉ bật với `(hover: hover) and (pointer: fine)`. Có hỗ trợ light/dark, `prefers-reduced-motion`, `prefers-reduced-transparency` và `prefers-contrast`.

## Các nguyên tắc chuyển động

1. **Spring thay cho duration** (`scripts/spring.ts`). Mỗi spring có 2 thông số: `response` (giây) và `damping` (1 = không nảy). Mặc định là critically damped. Chỉ nảy nhẹ (damping ~0.8) khi chính cử chỉ của người dùng có quán tính, ví dụ khi ném sheet.
2. **Ngắt được giữa chừng.** `to()` chỉ đổi đích đến, vị trí và vận tốc hiện tại được giữ nguyên. Sheet có thể bị "chộp" ngay khi đang chạy.
3. **Chỉ animate `transform` và `opacity`.** Không animate chiều cao. Khi nội dung đổi kích thước thì dùng FLIP bằng transform.
4. **Không ép layout giữa frame.** Đổi chữ (crossfade) được dời ra sau vòng `tick`. Hình học của giá đĩa được cache sẵn, nên khi scroll chỉ cần đọc `scrollLeft`.
5. **Chỉ những spring đang chạy mới được tick.** Phần tử đứng yên không có transform, nên không chiếm một compositor layer thường trực.
6. **Cử chỉ 1:1 + chiếu quán tính.** Sheet bám ngón tay, có rubber-band ở biên. Khi thả tay thì chiếu điểm dừng theo công thức của Apple, rồi chuyển vận tốc vào spring.
7. **Cùng đường đi, cùng đường về.** Hướng trượt khi chuyển trang theo thứ tự các ngăn (Trang đầu → Nhạc → Nhà soạn nhạc → Sách), nên bấm Back thì trang trượt ngược lại.

## Chuyển trang (View Transitions)

- **Lớp cố định:** header, thanh tab và khung Mèo có `view-transition-name` riêng, không animate, và luôn nằm trên nội dung (đặt `z-index` cho các `::view-transition-group`). Trong lúc chuyển chỉ có `<main>` trượt.
- **Không đặt `transition:*` trên `<html>`:** Astro sẽ gán cho nó một tên khác nhau ở mỗi trang, khiến trình duyệt phủ ảnh chụp cả trang cũ lên trên trang mới (cảm giác như tải lại trang).
- **Tên cố định cho khung Mèo:** khung Mèo được giữ nguyên qua các trang (`transition:persist`), nên tên transition của nó phải đặt cố định bằng CSS, không dùng `transition:name`. Tên do `transition:name` sinh ra gắn theo từng trang và sẽ mất khi sang trang mới.
- **Vệt vàng của tab:** là phần tử đầu tiên của thanh điều hướng. Khi chạm, nó trượt sang tab mới ngay lập tức bằng spring, rồi View Transition nối tiếp (`tab-pill` / `nav-pill`).
- **Không phải chờ mạng:** HTML có header `stale-while-revalidate=120` (file `public/_headers`) và CSS được nhúng thẳng vào HTML. Một trang đã prefetch là đủ để hiện ra ngay khi chạm, không phải đợi thêm request nào.

## Review mockup ban đầu (đã sửa trong bản này)

| Vấn đề trong mockup | Đã xử lý |
|---|---|
| Mỗi frame ghi CSS custom property lên phần tử cha, nên cả cây con phải tính lại style | Ghi thẳng `style.transform` lên đúng phần tử cần di chuyển |
| Khung co giãn bằng `scaleY`, làm viền đậm bị méo | Sheet chỉ dịch chuyển. Phần nền kéo dài xuống dưới mép nên không bao giờ hở |
| Đo layout ngay trong callback của spring | Đổi nội dung ở microtask sau frame |
| Danh sách spring không bao giờ được xóa | Chỉ giữ các spring đang chạy |
| Mọi nút luôn mang sẵn `translate3d` | Lúc đứng yên thì không có transform. `will-change` chỉ gắn khi đang nhấn |
| Lướt giá đĩa không đổi đĩa đang chọn | Đĩa nằm giữa khung là đĩa được chọn. Độ "rút đĩa ra" gắn trực tiếp vào vị trí scroll |
| `pointerdown` gọi `scrollTo`, cắt ngang quán tính trên iOS | Bỏ |
| Nút "lún" xuống mỗi khi bắt đầu lướt | Trong vùng cuộn được, hiệu ứng nhấn chờ khoảng 80ms |
| Đĩa xoay cố định 48° rồi đứng im | Đĩa đang chọn quay liên tục (WAAPI), tăng tốc và giảm tốc bằng spring. Nhãn đĩa có vạch để nhìn thấy nó quay |
| Khung Mèo nằm trong flow, trôi khỏi màn hình khi trang dài | Bottom sheet cố định ở cuối màn hình |

## Mèo

SVG chia thành nhiều lớp lồng nhau. Mỗi lớp chỉ do **một** nguồn điều khiển, nên các chuyển động không giành nhau:

- **CSS loop:** thở, đuôi đung đưa (mỗi con mèo có nhịp hơi khác nhau).
- **WAAPI một lần:** chớp mắt, giật tai, quẫy đuôi, liếm chân, ngáp, vươn vai, rừ rừ khi được vuốt.
- **Spring JS:** nhìn theo con trỏ hoặc chỗ vừa chạm (X và Y tách riêng), nảy lên khi được vuốt.
- **Trạng thái:** khoảng 25 giây không có tương tác thì Mèo ngủ (mắt nhắm, gục đầu, hiện "z z"). Có tương tác là tỉnh.

Mèo tạm dừng hoàn toàn khi ra khỏi màn hình hoặc khi tab bị ẩn. Khi bật reduced motion thì chỉ còn chớp mắt và các tư thế tĩnh.
