import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 415 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 413 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const result = await new Promise<{ secure_url: string; width: number; height: number }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "baylo", resource_type: "image" },
        (error, result) => {
          if (error || !result) reject(error)
          else resolve(result as { secure_url: string; width: number; height: number })
        }
      ).end(buffer)
    })

    console.log(`[upload] Cloudinary stored: ${result.width}×${result.height} → ${result.secure_url}`)
    return NextResponse.json({ url: result.secure_url, width: result.width, height: result.height })
  } catch (err) {
    console.error("[upload/image] Upload failed:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
