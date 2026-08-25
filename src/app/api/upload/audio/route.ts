import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB ≈ 2 min of webm audio
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav",
  "audio/aac", "audio/x-m4a", "video/webm", // video/webm is what Chrome/Firefox emit for MediaRecorder
])

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    if (!ALLOWED_AUDIO_TYPES.has(file.type) && !file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "Unsupported audio format" }, { status: 415 })
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "No audio was captured" }, { status: 400 })
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Voice message must be under 10 MB (approx. 2 minutes)" }, { status: 413 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "baylo/audio", resource_type: "video" },
        (error, result) => {
          if (error || !result) reject(error)
          else resolve(result as { secure_url: string })
        }
      ).end(buffer)
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (err) {
    console.error("[upload/audio] Upload failed:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
