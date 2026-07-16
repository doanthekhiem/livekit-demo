// Vercel serverless function — POST /api/token
// Cùng logic với server.mjs (local Express) nhưng theo signature Vercel expects.
// Chạy trên Node runtime (không phải Edge) vì livekit-server-sdk cần Node crypto.

import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(500).json({ error: 'Thiếu env: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET' })
  }

  const { identity, room } = req.body ?? {}
  if (!identity || !room) {
    return res.status(400).json({ error: 'identity và room là bắt buộc' })
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '1h',
    })
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    })
    const token = await at.toJwt()
    return res.status(200).json({ token, url: LIVEKIT_URL })
  } catch (err) {
    console.error('mint token failed:', err)
    return res.status(500).json({ error: String(err) })
  }
}
