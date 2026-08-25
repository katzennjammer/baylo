import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import pusher from "@/lib/pusher"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { postId, offeredItems, offeredPoints, message } = await req.json()

    if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 })
    if ((!offeredItems || offeredItems.length === 0) && !offeredPoints) {
      return NextResponse.json({ error: "Must offer at least one item or points" }, { status: 400 })
    }

    const post = await prisma.item.findUnique({
      where: { id: postId },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    if (post.userId === session.user.id) {
      return NextResponse.json({ error: "Cannot make an offer on your own post" }, { status: 400 })
    }

    if (offeredPoints && offeredPoints > 0) {
      const [sender, committedAgg] = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { points: true },
        }),
        prisma.offer.aggregate({
          where: { senderId: session.user.id, status: "PENDING", offeredPoints: { not: null } },
          _sum: { offeredPoints: true },
        }),
      ])
      const committed = committedAgg._sum.offeredPoints ?? 0
      const available = (sender?.points ?? 0) - committed
      if (offeredPoints > available) {
        return NextResponse.json(
          { error: `Insufficient Baylo points — you need ${offeredPoints} but have ${available} available` },
          { status: 400 },
        )
      }
    }

    const offer = await prisma.offer.create({
      data: {
        postId,
        senderId: session.user.id,
        receiverId: post.userId,
        offeredItems: JSON.stringify(offeredItems || []),
        offeredPoints: offeredPoints || null,
        message: message?.trim() || null,
        status: "PENDING",
      },
    })

    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, avatar: true },
    })

    // Build the offer card content for the message
    const msgContent = JSON.stringify({
      type: "offer",
      offerId: offer.id,
      postId,
      postItem: { title: post.title },
      offeredItems: offeredItems || [],
      offeredPoints: offeredPoints || null,
      userMessage: message?.trim() || null,
      senderName: sender?.name ?? "Someone",
      senderId: session.user.id,
      status: "PENDING",
    })

    const chatMessage = await prisma.message.create({
      data: {
        senderId: session.user.id,
        receiverId: post.userId,
        content: msgContent,
      },
    })

    const pusherPayload = {
      id: chatMessage.id,
      content: chatMessage.content,
      senderId: chatMessage.senderId,
      receiverId: chatMessage.receiverId,
      createdAt: chatMessage.createdAt.toISOString(),
      senderName: sender?.name ?? "",
      senderAvatar: sender?.avatar ?? null,
    }
    pusher.trigger(`private-user-${post.userId}`, "new-message", pusherPayload).catch(() => {})

    await prisma.notification.deleteMany({
      where: { userId: post.userId, actorId: session.user.id, type: "NEW_MESSAGE", read: false },
    })
    await prisma.notification.create({
      data: {
        userId: post.userId,
        type: "NEW_MESSAGE",
        message: `made you an offer on "${post.title}"`,
        link: `/dashboard/messages?partner=${session.user.id}`,
        actorId: session.user.id,
      },
    })

    return NextResponse.json({ offerId: offer.id, messageId: chatMessage.id, partnerId: post.userId, partnerName: post.user.name }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
