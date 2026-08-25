import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import pusher from "@/lib/pusher"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.text()
  const params = new URLSearchParams(body)
  const socketId = params.get("socket_id") ?? ""
  const channelName = params.get("channel_name") ?? ""

  const myId = session.user.id
  const isOwnPrivate = channelName === `private-user-${myId}`
  const isPresencePair = channelName.startsWith("presence-chat-") && channelName.includes(myId)

  if (!isOwnPrivate && !isPresencePair) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (channelName.startsWith("presence-")) {
    const authData = pusher.authorizeChannel(socketId, channelName, {
      user_id: myId,
      user_info: { name: session.user.name ?? "" },
    })
    return NextResponse.json(authData)
  }

  const authData = pusher.authorizeChannel(socketId, channelName)
  return NextResponse.json(authData)
}
