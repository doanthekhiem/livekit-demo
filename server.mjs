// server.mjs — token server tối giản, mô phỏng vai trò `bff-tenant` trong Kairo Chat.
// Client KHÔNG được giữ API_KEY/SECRET — luôn xin token qua backend.
//
// Endpoint: POST /api/token   { identity, room }  →  { token, url }

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { AccessToken } from 'livekit-server-sdk'

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('[server] Thiếu env. Copy .env.example → .env và điền giá trị.')
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/token', async (req, res) => {
  try {
    const { identity, room } = req.body ?? {}
    if (!identity || !room) {
      return res.status(400).json({ error: 'identity và room là bắt buộc' })
    }

    // AccessToken = JWT ký bằng API_SECRET. TTL 1h — phiên demo ngắn.
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '1h',
    })

    // Grant tối thiểu để tham gia room + publish/subscribe track.
    // Trong prod bạn còn set: canPublishData, canUpdateOwnMetadata, room-admin, ...
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    })

    const token = await at.toJwt()
    res.json({ token, url: LIVEKIT_URL })
  } catch (err) {
    console.error('[server] mint token failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`[server] Token server chạy tại http://localhost:${PORT}`)
  console.log(`[server] LiveKit URL = ${LIVEKIT_URL}`)
})
