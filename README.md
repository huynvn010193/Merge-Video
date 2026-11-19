# Clipjoin

Ứng dụng Next.js App Router và TypeScript để ghép nhiều clip hoặc cắt một đoạn video và xuất ra MP4. Menu Ghép video hỗ trợ 2–12 tệp MP4, MOV, WebM, MKV, AVI hoặc M4V với tổng dung lượng tối đa 1 GB.

## Chạy trên máy

Cần Node.js 20.9 trở lên và FFmpeg 8.0 trở lên. Đảm bảo cả `ffmpeg` và `ffprobe` nằm trong PATH, với bộ mã hóa `libx264` và `aac` khả dụng. Trên macOS có thể cài bằng `brew install ffmpeg`.

```bash
npm ci
npm run dev
```

Mở [http://localhost:4001](http://localhost:4001), thêm video, dùng các nút mũi tên để đổi thứ tự, chọn tỉ lệ khung hình rồi bấm **Ghép video**. Bấm **Tải video MP4** khi hoàn tất.

Nếu FFmpeg nằm ngoài PATH, đặt `FFMPEG_PATH` và `FFPROBE_PATH` thành đường dẫn tuyệt đối tới các tệp thực thi trong `.env.local`.

Trong menu **Cắt video**, chọn một tệp tối đa 1 GB, nhập mốc bắt đầu và kết thúc theo giây hoặc lấy vị trí đang phát. Bấm **Xem đoạn** để nghe và xem trước, rồi bấm **Cắt và xuất MP4**. Có thể tải tệp kết quả về và đưa vào menu **Ghép video**.

## Xử lý video

Route `POST /api/merge` chạy trên Node.js và gọi FFmpeg trên máy chủ. Video đầu ra dùng H.264 và AAC ở 30 fps. Mỗi clip được giữ tỉ lệ gốc và thêm viền đen nếu cần để vừa khung. Các clip không có âm thanh được bổ sung phần im lặng. Tệp tạm được xóa sau khi phản hồi hoàn tất hoặc khi xử lý lỗi.

Route `POST /api/trim` dùng cùng FFmpeg để xuất đoạn đã chọn, giữ kích thước khung hình gốc với tối đa một pixel đệm ở cạnh lẻ để tương thích H.264.

Dùng `npm run build` rồi `npm start` để chạy bản production trên máy có FFmpeg.
