# Video Cấu Trúc Anh–Việt

Ứng dụng web Node full-stack dựng hàng loạt video dọc 720×1280 luyện dịch
Việt–Anh. Bản này đã có cấu hình dành cho PandaStack, không cần Gemini API hay
database.

## Không cần thiết lập dịch vụ ngoài

- Không dùng Gemini API, Google Drive, Firebase, Cloud Storage hoặc database.
- Không cần API key hay biến môi trường do người dùng tự nhập.
- Kho footage được lưu lâu dài ngay trong IndexedDB của trình duyệt.
- Kho nhạc nền được lưu dùng chung trong workspace máy chủ tại
  `.runtime/music_library`; tải một lần rồi dùng lại từ các thiết bị mở cùng
  PandaStack App.
- Mỗi bài chọn ngẫu nhiên một clip đang bật; trong cùng một lô, clip được chọn
  trùng chỉ tải lên máy chủ một lần.
- Nhạc nền có ba chế độ: tắt, chọn đúng một bài, hoặc máy chủ xáo kho và chọn
  ngẫu nhiên cho từng video. Có thể chỉnh âm lượng từ 0–100%.
- Máy chủ dùng node-edge-tts cho Hoài My/Jenny và binary ffmpeg-static để dựng
  MP4. Kết quả tạm được giữ 6 giờ để tải xuống rồi tự xóa.

> Edge TTS cần kết nối Internet đến dịch vụ giọng đọc của Microsoft. Đây là
> kết nối ngoài duy nhất cần cho chức năng tạo giọng.

## Cách chạy

    npm install
    npm run dev

Mở http://localhost:3000. PandaStack tự gán `PORT` và `HOST`; không cần tự
tạo các biến này.

## Cài trên PandaStack

1. Giải nén ZIP vào thư mục gốc của một Git repository rồi push lên GitHub.
2. Trên PandaStack, tạo **App** từ repo/branch đó. File `pandastack.json` đã
   ghim dự án ở chế độ Node full-stack và khai báo sẵn:
   - Install: `npm ci`
   - Build: `npm run build`
   - Start: `npm start`
3. Trong cấu hình App, đặt:
   - `auto_hibernate: false`
   - `max_instances: 1`
4. Deploy/redeploy rồi kiểm tra `/api/health` trả `{"status":"ok"}`.

Không bỏ file `pandastack.json`. Nếu PandaStack tự nhận dự án này là Vite
tĩnh, nó chỉ serve giao diện và các API Node/FFmpeg sẽ không chạy.

> `auto_hibernate: false` giữ máy chủ không ngủ khi tab không còn gửi request.
> `max_instances: 1` giữ toàn bộ trạng thái lô và file tạm trên đúng một máy;
> không bật scale-out cho bản không dùng database này.

## Cách dùng

1. Mở **Kho footage**, tải nhiều clip lên một lần và bật các clip muốn dùng.
2. Nếu muốn có nhạc, mở **Kho nhạc**, tải một hoặc nhiều tệp âm thanh lên máy
   chủ. Có thể nghe thử hoặc xóa từng bài ngay tại đây.
3. Mở **Tạo video**, chọn **Không dùng nhạc nền**, **Máy chọn Random cho từng
   video**, hoặc một bài cụ thể; kéo thanh âm lượng theo ý muốn. Mức 10–20%
   thường đủ nghe mà không lấn giọng đọc.
4. Dán một hoặc nhiều bài liên tiếp. Mỗi bài chỉ cần bắt đầu
   bằng một dòng `Cấu trúc:`; ứng dụng tự tách bài và kiểm tra đúng ba cặp
   Việt–Anh cho từng bài.
5. Bấm **Dựng toàn bộ … video**. Ứng dụng tải các footage cần dùng một lần rồi
   đưa toàn bộ bài vào hàng đợi phía máy chủ.
6. Khi màn hình báo **Đã vào hàng đợi máy chủ**, có thể chuyển sang app khác.
   Khi quay lại hoặc tải lại trang, ứng dụng dùng mã lô đã lưu để nối lại và
   hiển thị tiến độ hiện tại.
7. Tải từng MP4 hoặc bấm **Tải tất cả video (.zip)** sau khi lô chạy xong.

Ví dụ dán hai bài không cần dấu phân cách:

    Cấu trúc: I enjoy + V-ing
    Giải thích: Dùng để nói về việc mình thích làm.
    1. VI: Tôi thích đọc sách.
       EN: I enjoy reading books.
    2. VI: Tôi thích đi bộ.
       EN: I enjoy walking.
    3. VI: Tôi thích nấu ăn.
       EN: I enjoy cooking.

    Cấu trúc: Can you + V...?
    Giải thích: Dùng để nhờ ai làm gì.
    1. VI: Bạn mở cửa được không?
       EN: Can you open the door?
    2. VI: Bạn đợi tôi được không?
       EN: Can you wait for me?
    3. VI: Bạn giúp tôi được không?
       EN: Can you help me?

Mỗi lô tối đa 100 bài. Máy chủ dựng tuần tự để không làm FFmpeg và TTS tranh
tài nguyên. Kết quả của lô được giữ 6 giờ để tải xuống. Không đóng tab trước
khi trạng thái **Đã vào hàng đợi máy chủ**, vì footage vẫn đang được tải lên.

Footage tối đa 25 MiB mỗi clip để yêu cầu tải lên hoạt động ổn định trên bản
publish.

Mỗi tệp nhạc/video dùng làm nhạc nền tối đa 200 MiB. Hỗ trợ MP3, WAV, M4A,
AAC, OGG, OPUS, FLAC, MP4, MOV, WEBM, MKV, AVI, MPEG, MPG và 3GP có luồng âm
thanh. Máy chủ dùng chính FFmpeg để lấy audio và chuẩn hóa thành M4A, không cần
ffprobe. Nhạc ngắn hơn video sẽ tự lặp và được cắt đúng ở cuối video.

Trên PandaStack, ứng dụng tự chuyển dữ liệu tạm sang thư mục có quyền ghi thay
vì ghi vào `/app` (thư mục này chỉ đọc khi chạy). Kho nhạc và kết quả lô tồn tại
trong vòng đời của phiên máy chủ. Do ổ đĩa app của PandaStack là tạm thời, dữ
liệu có thể mất sau khi redeploy hoặc scale-to-zero; muốn lưu lâu dài cần dùng
S3-compatible object storage.

## Chuẩn video và giọng

- Video: 720×1280, 30 fps, H.264, yuv420p.
- Audio: AAC 48 kHz.
- Nhạc nền: trộn bằng FFmpeg phía máy chủ, giữ nguyên giọng đọc và tiếng tích
  tắc; âm lượng do người dùng chọn cho từng lô.
- Tiếng Việt: vi-VN-HoaiMyNeural, rate=+0%.
- Tiếng Anh: en-US-JennyNeural, rate=-20%.
- Khoảng suy nghĩ: tiếng tích tắc 2,11 giây.
- Đáp án tiếng Anh chỉ xuất hiện sau khi tích tắc kết thúc.

## Sửa bố cục trong bản này

- Font TTF hỗ trợ tiếng Việt được đóng gói trong assets/fonts/ và truyền trực
  tiếp vào Sharp; không phụ thuộc font của máy chủ.
- Chữ trong khung cam lớn hơn 30%.
- Đáp án tiếng Anh tự đo chiều rộng, xuống tối đa hai dòng và căn giữa.
- CTA của bản trước là 29 px; bản này tăng thêm đúng 30% thành 38 px, in đậm,
  không viết hoa toàn bộ và giữ đúng chữ hoa/thường:

    Xem bình luận để được hướng dẫn
    phát âm chuẩn các câu trên nhé

Frame QA mẫu nằm trong qa/frame-preview.jpg.

## Giao diện điện thoại

- Mobile-first từ 320 px; không cần bật chế độ Desktop site.
- Sidebar chuyển thành thanh điều hướng bốn tab nằm ngang.
- Header, form, nút, danh sách footage, lịch sử, video preview và modal đều
  co giãn theo chiều rộng màn hình.
- Dùng `100dvh` để giao diện vừa vùng hiển thị thực tế của trình duyệt di động
  và không tạo cuộn ngang.

## Kiểm tra source

    npm run lint
    npm run build
