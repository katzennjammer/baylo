import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import pusher from "@/lib/pusher"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { receiverId } = await req.json()
  if (!receiverId) return NextResponse.json({ error: "receiverId required" }, { status: 400 })

  await pusher.trigger(`private-user-${receiverId}`, "typing", {
    senderId: session.user.id,
    name: session.user.name ?? "Someone",
  })

  return NextResponse.json({ ok: true })
}
