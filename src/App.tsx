import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client'

// ─────────────────────────────────────────────────────────────────────────────
// Bản demo LiveKit tối giản — 3 phase bạn cần nắm:
//   1. Xin token JWT từ backend (mô phỏng `bff-tenant`).
//   2. `room.connect(url, token)` → mở WebSocket signaling + WebRTC transport.
//   3. `enableCameraAndMicrophone()` để publish local track; nghe event
//      `TrackSubscribed` để attach remote track vào DOM.
// ─────────────────────────────────────────────────────────────────────────────

const randomIdentity = () => 'user-' + Math.random().toString(36).slice(2, 7)

export default function App() {
  // Room là singleton của phiên — tạo 1 lần, reuse.
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true, // subscribe layer bitrate theo kích thước video element
        dynacast: true,       // publisher dừng layer không ai xem
      }),
  )

  const [identity, setIdentity] = useState(randomIdentity)
  const [roomName, setRoomName] = useState('kairo-demo')
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected)
  const [participants, setParticipants] = useState<string[]>([])
  const [logs, setLogs] = useState<string[]>([])

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remotesRef = useRef<HTMLDivElement | null>(null)

  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString()
    setLogs((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 60))
  }, [])

  // Đăng ký event listeners 1 lần. Đây là "runtime giáo trình" của LiveKit —
  // toàn bộ hoạt động của room đều phát ra event bạn có thể quan sát.
  useEffect(() => {
    const onState = (s: ConnectionState) => {
      setState(s)
      log(`ConnectionState → ${s}`)
    }
    const onParticipantConnected = (p: RemoteParticipant) => {
      log(`▶ Participant vào: ${p.identity}`)
      setParticipants((prev) => Array.from(new Set([...prev, p.identity])))
    }
    const onParticipantDisconnected = (p: RemoteParticipant) => {
      log(`◀ Participant rời: ${p.identity}`)
      setParticipants((prev) => prev.filter((i) => i !== p.identity))
    }
    const onTrackSubscribed = (
      track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      log(`⬇ Subscribed ${track.kind} track from ${participant.identity}`)
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
        const el = track.attach()
        el.dataset.participant = participant.identity
        el.dataset.kind = track.kind
        if (track.kind === Track.Kind.Video) {
          const v = el as HTMLVideoElement
          v.autoplay = true
          v.playsInline = true
          v.className = 'remote-video'
        }
        remotesRef.current?.appendChild(el)
      }
    }
    const onTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
      log(`⬆ Unsubscribed ${track.kind}`)
    }
    const onDisconnected = () => log('Room disconnected')
    const onReconnecting = () => log('⚠ Đang reconnect...')
    const onReconnected = () => log('✔ Đã reconnect')

    room
      .on(RoomEvent.ConnectionStateChanged, onState)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)

    return () => {
      room
        .off(RoomEvent.ConnectionStateChanged, onState)
        .off(RoomEvent.ParticipantConnected, onParticipantConnected)
        .off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
        .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
        .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.Reconnecting, onReconnecting)
        .off(RoomEvent.Reconnected, onReconnected)
    }
  }, [room, log])

  const join = async () => {
    try {
      log(`Xin token cho identity=${identity}, room=${roomName}`)
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identity, room: roomName }),
      })
      if (!res.ok) {
        log(`✖ Token server trả ${res.status}`)
        return
      }
      const { token, url } = await res.json()
      log(`Connecting → ${url}`)
      await room.connect(url, token)
      log(`Connected. localParticipant = ${room.localParticipant.identity}`)

      // Publish camera + mic. Trình duyệt sẽ hỏi permission lần đầu.
      await room.localParticipant.enableCameraAndMicrophone()
      log('Local camera + mic đã publish')

      // Attach local camera track vào <video> để bạn tự nhìn.
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.videoTrack && localVideoRef.current) {
        camPub.videoTrack.attach(localVideoRef.current)
      }

      // Nếu vào sau người khác, remote participant đã có sẵn.
      // TrackSubscribed sẽ tự fire khi server gửi track — không cần loop thủ công,
      // chỉ cần sync danh sách participant hiển thị.
      const existing = Array.from(room.remoteParticipants.values()).map((p) => p.identity)
      setParticipants(existing)
    } catch (err) {
      log(`✖ Join lỗi: ${String(err)}`)
    }
  }

  const leave = async () => {
    await room.disconnect()
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remotesRef.current) {
      remotesRef.current.innerHTML = ''
    }
    setParticipants([])
  }

  const toggleCamera = async () => {
    const enabled = room.localParticipant.isCameraEnabled
    await room.localParticipant.setCameraEnabled(!enabled)
    log(`Camera → ${!enabled ? 'ON' : 'OFF'}`)
  }

  const toggleMic = async () => {
    const enabled = room.localParticipant.isMicrophoneEnabled
    await room.localParticipant.setMicrophoneEnabled(!enabled)
    log(`Mic → ${!enabled ? 'ON' : 'OFF'}`)
  }

  const connected = state === ConnectionState.Connected

  return (
    <div className="app">
      <header>
        <h1>LiveKit Demo</h1>
        <span className={`badge state-${state}`}>State: {state}</span>
      </header>

      <section className="controls">
        <label>
          Identity{' '}
          <input value={identity} onChange={(e) => setIdentity(e.target.value)} disabled={connected} />
        </label>
        <label>
          Room{' '}
          <input value={roomName} onChange={(e) => setRoomName(e.target.value)} disabled={connected} />
        </label>
        {!connected ? (
          <button onClick={join} className="primary">
            Join
          </button>
        ) : (
          <>
            <button onClick={toggleCamera}>Toggle camera</button>
            <button onClick={toggleMic}>Toggle mic</button>
            <button onClick={leave} className="danger">
              Leave
            </button>
          </>
        )}
      </section>

      <section className="stage">
        <div className="pane">
          <h3>Local (bạn)</h3>
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
        </div>
        <div className="pane">
          <h3>Remote ({participants.length})</h3>
          <ul className="participant-list">
            {participants.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div ref={remotesRef} className="remotes" />
        </div>
      </section>

      <section className="log">
        <h3>Event log</h3>
        <pre>{logs.join('\n')}</pre>
      </section>

      <footer>
        <p>
          Mở tab thứ 2 (hoặc thiết bị khác) → nhập cùng <code>Room</code> nhưng khác <code>Identity</code>{' '}
          → Join. Bạn sẽ thấy participant xuất hiện + track được subscribe qua event log.
        </p>
      </footer>
    </div>
  )
}
