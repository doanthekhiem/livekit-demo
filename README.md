# LiveKit Demo — hiểu cách chạy

Bản demo tối giản để nắm ba mảnh cốt lõi của LiveKit:

1. **Backend cấp JWT** (`server.mjs`) — mô phỏng vai trò `bff-tenant` trong Kairo Chat.
2. **Client `livekit-client`** (`src/App.tsx`) — `Room.connect(url, token)` → publish camera/mic → subscribe track remote qua event.
3. **Event lifecycle** — panel log realtime cho bạn thấy từng bước.

## 1. Chuẩn bị LiveKit server + credentials

Chọn **1 trong 2** cách:

### Cách A — LiveKit Cloud (nhanh nhất, có free tier)

1. Đăng ký https://cloud.livekit.io (mất ~2 phút).
2. Tạo project → **Settings → Keys** → copy 3 giá trị:
   - `wss://<subdomain>.livekit.cloud`
   - `API Key`
   - `API Secret`

### Cách B — Self-host bằng Docker (giống prod Kairo)

```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: devsecret1234567890abcdefghij" \
  livekit/livekit-server \
  --dev
```

- URL: `ws://localhost:7880`
- API Key: `devkey`
- API Secret: `devsecret1234567890abcdefghij`

(Chỉ dùng cho local — cần TURN + TLS cho prod.)

## 2. Cấu hình

```bash
cd scratchpad/livekit-demo
cp .env.example .env
# Mở .env, điền LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
```

## 3. Cài dependency

```bash
npm install
```

## 4. Chạy

Mở **2 terminal**:

```bash
# Terminal 1 — token server
npm run server
# → [server] Token server chạy tại http://localhost:3001

# Terminal 2 — Vite dev
npm run dev
# → Local: http://localhost:5173
```

Mở http://localhost:5173. Bấm **Join** → cho phép camera/mic → bạn thấy video local.

## 5. Test có 2 người

Cách đơn giản nhất: mở **tab thứ 2** (hoặc trình duyệt khác / máy khác cùng LAN),
vào cùng URL, để **cùng `Room`** nhưng **khác `Identity`** → Join.

Bạn sẽ thấy trên log:

```
[hh:mm:ss] ▶ Participant vào: user-xxx
[hh:mm:ss] ⬇ Subscribed audio track from user-xxx
[hh:mm:ss] ⬇ Subscribed video track from user-xxx
```

Video của peer xuất hiện trong ô **Remote**.

## Cấu trúc thư mục

```
livekit-demo/
├── server.mjs          # Token server (Express + livekit-server-sdk)
├── src/
│   ├── main.tsx        # Entry React
│   ├── App.tsx         # Room + event lifecycle + UI
│   └── styles.css
├── index.html
├── vite.config.ts      # /api proxy → :3001
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

## Bản đồ khái niệm ↔ code trong `App.tsx`

| Khái niệm LiveKit             | Nơi xuất hiện trong `App.tsx`                       |
| ----------------------------- | --------------------------------------------------- |
| `Room`                        | `new Room({ adaptiveStream, dynacast })`            |
| Kết nối signaling + media     | `room.connect(url, token)`                          |
| Publish local track           | `room.localParticipant.enableCameraAndMicrophone()` |
| Attach local vào DOM          | `camPub.videoTrack.attach(<video>)`                 |
| Subscribe remote track (auto) | `RoomEvent.TrackSubscribed` → `track.attach(el)`    |
| Trạng thái kết nối            | `RoomEvent.ConnectionStateChanged`                  |
| Ai vào/rời                    | `RoomEvent.ParticipantConnected / Disconnected`    |
| Reconnect (mất mạng)          | `RoomEvent.Reconnecting / Reconnected`             |
| Mute/unmute camera/mic        | `localParticipant.setCameraEnabled(bool)`           |
| Rời room                      | `room.disconnect()`                                 |

## Chuyện gì đang xảy ra khi bạn bấm Join

1. Client `POST /api/token { identity, room }`.
2. Server ký JWT với `API_SECRET`, add grant `roomJoin + canPublish + canSubscribe`, trả về `{ token, url }`.
3. `room.connect(url, token)`:
   - Mở WebSocket signaling tới LiveKit server.
   - LiveKit gửi lại thông tin ICE (STUN/TURN), setup `RTCPeerConnection` publisher + subscriber.
4. `enableCameraAndMicrophone()`:
   - Trình duyệt hỏi permission → tạo `MediaStreamTrack`.
   - LiveKit publish qua peer connection publisher (Simulcast: nhiều layer bitrate cùng lúc).
5. Khi có peer khác vào, server tự forward track → client nhận qua `TrackSubscribed`.
6. Bạn `track.attach(<video>)` — LiveKit tự set `srcObject` cho element.

## Bước tiếp theo (thử tay)

- Đổi `adaptiveStream` / `dynacast` sang `false` rồi mở DevTools → `chrome://webrtc-internals` → so sánh số bitrate publisher.
- Thêm screen share: `room.localParticipant.setScreenShareEnabled(true)`.
- Test reconnect: mở room, tắt Wi-Fi 5s rồi bật lại → xem log `Reconnecting` → `Reconnected`.
- Đọc token trên https://jwt.io (paste vào) → xem grant.

## Liên hệ với Kairo Chat

- LiveKit server sẽ self-host @ LocalZone VN (**ADR-D3-006**) — không dùng LiveKit Cloud khi prod.
- Token issuance ở prod = `bff-tenant` (web) hoặc `sdk` (widget guest), không phải server rời như demo.
- Web app dùng SDK này y hệt trong `web-experiences/web-enduser`; Flutter app dùng `livekit_client` với cùng khái niệm.
- Ràng buộc 3s incoming-call wake trên mobile (**ADR-CR-004**) là chuyện của VoIP push + CallKit — LiveKit chỉ vào cuộc **sau khi** user accept call.
