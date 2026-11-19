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

## Cắt video từ YouTube

Cài Python 3.11 trở lên và các gói tải YouTube trong môi trường riêng.

```bash
python3 -m venv .tools/youtube-env
.tools/youtube-env/bin/python -m pip install -r scripts/requirements-youtube.txt
```

Đặt `YOUTUBE_PYTHON_PATH` trong `.env.local` thành đường dẫn tuyệt đối tới `.tools/youtube-env/bin/python` (trên Windows dùng `Scripts/python.exe` trong môi trường Python). Máy chạy ứng dụng cần có Node.js, FFmpeg và FFprobe. Nếu FFmpeg nằm ngoài PATH, cấu hình `FFMPEG_PATH` và `FFPROBE_PATH` như trên.

Mở menu **Cắt video**, dán link YouTube hoặc Shorts và bấm **Lấy video**. Khi video tải xong, chọn điểm đầu và cuối, xem trước rồi xuất MP4. Ứng dụng tải toàn bộ video vào nguồn cắt, chọn định dạng MP4 H.264 tối đa 1080p và áp dụng giới hạn 1 GB. Video có yêu cầu đăng nhập, giới hạn vùng, video riêng tư, đang phát trực tiếp hoặc bị YouTube chặn tải sẽ hiển thị lỗi để người dùng chọn tệp từ máy.

Route `POST /api/youtube` dùng `scripts/import_youtube.py` và yt-dlp để tải vào thư mục tạm, trả MP4 về trình duyệt rồi dọn tệp tạm. Khi triển khai lên VPS, sao chép cả thư mục `scripts` và cài các gói Python từ requirements. Tính năng này cần máy chủ Node.js có các tệp thực thi trên.

## Xử lý video

Route `POST /api/merge` chạy trên Node.js và gọi FFmpeg trên máy chủ. Video đầu ra dùng H.264 và AAC ở 30 fps. Mỗi clip được giữ tỉ lệ gốc và thêm viền đen nếu cần để vừa khung. Các clip không có âm thanh được bổ sung phần im lặng. Tệp tạm được xóa sau khi phản hồi hoàn tất hoặc khi xử lý lỗi.

Route `POST /api/trim` dùng cùng FFmpeg để xuất đoạn đã chọn, giữ kích thước khung hình gốc với tối đa một pixel đệm ở cạnh lẻ để tương thích H.264.

Dùng `npm run build` rồi `npm start` để chạy bản production trên máy có FFmpeg.

## Codegraph trên máy khác

Sau khi clone dự án, cài Codegraph và tạo lại chỉ mục tại thư mục gốc.

```bash
npm install -g @colbymchenry/codegraph@1.6.1
codegraph index .
codegraph status .
```

Để kết nối Codegraph với Codex trên máy đó, chạy `codegraph install --target codex --location global` rồi mở lại Codex. Khi mã nguồn thay đổi, có thể cập nhật chỉ mục bằng `codegraph sync .`.

Tệp `.codegraph/.gitignore` được lưu trong Git. Database và các tệp chạy nền được tạo riêng trên từng máy. Cài các phụ thuộc ứng dụng và cấu hình lại `.env.local` theo các phần phía trên để chạy Clipjoin.
