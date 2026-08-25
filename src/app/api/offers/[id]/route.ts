import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import pusher from "@/lib/pusher"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: offerId } = await params
    const { action } = await req.json()

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 })
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        post: { select: { title: true } },
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
    })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.receiverId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (offer.status !== "PENDING") {
      return NextResponse.json({ error: "Offer already resolved" }, { status: 400 })
    }
    // Guard: a user must not trade with themselves
    if (offer.senderId === offer.receiverId) {
      return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 })
    }

    if (action === "accept" && offer.offeredPoints && offer.offeredPoints > 0) {
      const sender = await prisma.user.findUnique({
        where: { id: offer.senderId },
        select: { points: true },
      })
      if ((sender?.points ?? 0) < offer.offeredPoints) {
        return NextResponse.json(
          { error: `Cannot accept — sender now has ${sender?.points ?? 0} pts but this offer requires ${offer.offeredPoints} pts` },
          { status: 400 },
        )
      }
    }

    const newStatus = action === "accept" ? "ACCEPTED" : "DECLINED"
    await prisma.offer.update({ where: { id: offerId }, data: { status: newStatus } })

    // Create an active TradeRequest so both users see it in "Active Trades"
    let tradeRecord: { id: string; offeredItemTitle: string; requestedItemTitle: string } | null = null
    if (action === "accept") {
      try {
        const items: { id: string; title?: string }[] = JSON.parse(offer.offeredItems)
        const isItemSwap   = items.length > 0
        const offeredItemId = isItemSwap ? items[0].id : offer.postId

        const [offeredItem, requestedItem] = await Promise.all([
          prisma.item.findUnique({ where: { id: offeredItemId   }, select: { title: true } }),
          prisma.item.findUnique({ where: { id: offer.postId    }, select: { title: true } }),
        ])

        const trade = await prisma.tradeRequest.create({
          data: {
            senderId:       offer.senderId,
            receiverId:     offer.receiverId,
            offeredItemId,
            requestedItemId: offer.postId,
            status:         "ACCEPTED",
            message:        offer.message,
          },
        })
        tradeRecord = {
          id: trade.id,
          offeredItemTitle:   isItemSwap
            ? (offeredItem?.title ?? "Item")
            : `${offer.offeredPoints ?? 0} pts`,
          requestedItemTitle: requestedItem?.title ?? offer.post.title,
        }
      } catch (e) {
        console.error("[offers/accept] failed to create TradeRequest:", e)
      }
    }

    // Notify sender — link uses ?partner= format so NotifPanel opens the chat dock
    await prisma.notification.create({
      data: {
        userId: offer.senderId,
        type: action === "accept" ? "TRADE_ACCEPTED" : "TRADE_REJECTED",
        message: action === "accept"
          ? `accepted your offer on "${offer.post.title}"`
          : `declined your offer on "${offer.post.title}"`,
        link: `/dashboard/messages?partner=${session.user.id}`,
        actorId: session.user.id,
      },
    })

    // Send status update as a follow-up message in their chat
    const actorName = offer.receiver?.name ?? "They"
    const systemMsg = await prisma.message.create({
      data: {
        senderId: session.user.id,
        receiverId: offer.senderId,
        content: JSON.stringify({
          type: "offer_update",
          offerId,
          status: newStatus,
          actorName,
        }),
      },
    })

    // Tell the sender their offer was resolved (updates OfferCard + appends system msg)
    pusher.trigger(`private-user-${offer.senderId}`, "offer-updated", {
      offerId,
      status: newStatus,
      actorName,
      systemMessage: {
        id: systemMsg.id,
        content: systemMsg.content,
        senderId: systemMsg.senderId,
        receiverId: systemMsg.receiverId,
        createdAt: systemMsg.createdAt.toISOString(),
      },
      ...(tradeRecord && {
        tradeId: tradeRecord.id,
        offeredItemTitle: tradeRecord.offeredItemTitle,
        requestedItemTitle: tradeRecord.requestedItemTitle,
        senderName: offer.sender?.name ?? "",
        receiverName: actorName,
        receiverId: offer.receiverId,
      }),
    }).catch(() => {})

    return NextResponse.json({
      status: newStatus,
      ...(tradeRecord && {
        tradeId: tradeRecord.id,
        offeredItemTitle: tradeRecord.offeredItemTitle,
        requestedItemTitle: tradeRecord.requestedItemTitle,
        senderId: offer.senderId,
        senderName: offer.sender?.name ?? "",
        receiverId: offer.receiverId,
        receiverName: actorName,
      }),
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
