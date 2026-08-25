import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import pusher from "@/lib/pusher"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const resolvedParams = await params
    const tradeId = resolvedParams.id
    console.log("[submit] raw params:", resolvedParams, "| tradeId:", tradeId, "| tradeId length:", tradeId?.length)
    const myId = session.user.id
    const body = await req.json() as { code?: string; safeZone?: boolean }
    const submitted = (body.code ?? "").trim()

    if (!/^\d{6}$/.test(submitted)) {
      return NextResponse.json({ error: "Code must be exactly 6 digits" }, { status: 400 })
    }

    const trade = await prisma.tradeRequest.findUnique({
      where: { id: tradeId },
      include: {
        sender:        { select: { id: true, name: true, email: true } },
        receiver:      { select: { id: true, name: true, email: true } },
        offeredItem:   { select: { id: true, title: true, status: true } },
        requestedItem: { select: { id: true, title: true, status: true } },
      },
    })

    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 })
    if (trade.senderId !== myId && trade.receiverId !== myId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (trade.status !== "CONFIRMING" && trade.status !== "COMPLETED") {
      return NextResponse.json({ error: "Trade is not in confirmation phase" }, { status: 400 })
    }
    if (trade.status === "COMPLETED") {
      return NextResponse.json({ correct: true, completed: true })
    }

    const isSender  = trade.senderId === myId
    const partnerId = isSender ? trade.receiverId : trade.senderId

    // The user enters their PARTNER's code (cross-exchange proves in-person meeting).
    // So we verify the submitted code against the PARTNER's stored hash.
    const partnerCode = await prisma.swapConfirmationCode.findUnique({
      where: { tradeId_userId: { tradeId, userId: partnerId } },
    })

    if (!partnerCode) {
      return NextResponse.json({ error: "Codes have not been generated yet — open the modal again" }, { status: 400 })
    }

    const now = new Date()
    if (partnerCode.expiresAt < now) {
      return NextResponse.json({ error: "Code has expired — click the button again to get new codes" }, { status: 400 })
    }

    const match = await bcrypt.compare(submitted, partnerCode.codeHash)
    if (!match) {
      return NextResponse.json({ error: "Incorrect code — check the code in your partner's email" }, { status: 400 })
    }

    // Mark the partner's code as used (= "I submitted my partner's code correctly")
    await prisma.swapConfirmationCode.update({
      where: { tradeId_userId: { tradeId, userId: partnerId } },
      data:  { used: true },
    })

    // Either participant can flag the meetup as a Safe-Zone meetup
    if (body.safeZone === true) {
      await prisma.tradeRequest.update({
        where: { id: tradeId },
        data:  { safeZoneMeetup: true },
      })
    }

    // Check if the other participant has already verified
    const myCode = await prisma.swapConfirmationCode.findUnique({
      where: { tradeId_userId: { tradeId, userId: myId } },
    })
    const bothVerified = partnerCode !== null && (myCode?.used ?? false)
    // After marking partner's code used, re-check:
    const updatedCodes = await prisma.swapConfirmationCode.findMany({
      where:  { tradeId },
      select: { used: true },
    })
    const allUsed = updatedCodes.length === 2 && updatedCodes.every((c) => c.used)

    if (!allUsed) {
      return NextResponse.json({ correct: true, completed: false })
    }

    // Both verified — run the atomic completion transaction
    const itemIds = [trade.offeredItemId, trade.requestedItemId]

    try {
      await prisma.$transaction(async (tx) => {
        const freshTrade = await tx.tradeRequest.findUnique({
          where:  { id: tradeId },
          select: { status: true },
        })
        if (freshTrade?.status === "COMPLETED") throw new Error("already_completed")

        const freshItems = await tx.item.findMany({
          where:  { id: { in: itemIds } },
          select: { id: true, status: true },
        })
        if (freshItems.some((i) => ["TRADED", "OWNED", "REMOVED"].includes(i.status))) {
          throw new Error("item_traded")
        }

        const offer = await tx.offer.findFirst({
          where:  { senderId: trade.senderId, postId: trade.requestedItemId, status: "ACCEPTED" },
          select: { id: true, offeredPoints: true },
        })
        const points = offer?.offeredPoints ?? 0

        if (points > 0) {
          const freshSender = await tx.user.findUnique({
            where:  { id: trade.senderId },
            select: { points: true },
          })
          if (!freshSender || freshSender.points < points) throw new Error("insufficient_points")
        }

        await tx.tradeRequest.update({ where: { id: tradeId }, data: { status: "COMPLETED" } })
        await tx.item.update({ where: { id: trade.offeredItemId },   data: { userId: trade.receiverId, status: "OWNED" } })
        await tx.item.update({ where: { id: trade.requestedItemId }, data: { userId: trade.senderId,   status: "OWNED" } })
        await tx.user.updateMany({
          where: { id: { in: [trade.senderId, trade.receiverId] } },
          data:  { totalTrades: { increment: 1 } },
        })

        if (points > 0) {
          await tx.user.update({ where: { id: trade.senderId },   data: { points: { decrement: points } } })
          await tx.user.update({ where: { id: trade.receiverId }, data: { points: { increment: points } } })
          await tx.walletTransaction.create({
            data: {
              userId: trade.senderId, type: "TRADE_SPEND", amount: -points,
              description: `Points paid to ${trade.receiver.name} for trade`,
              offerId: offer?.id, tradeId,
            },
          })
          await tx.walletTransaction.create({
            data: {
              userId: trade.receiverId, type: "TRADE_RECEIVE", amount: points,
              description: `Points received from ${trade.sender.name} for trade`,
              offerId: offer?.id, tradeId,
            },
          })
        }
      })
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "already_completed") {
        return NextResponse.json({ correct: true, completed: true })
      }
      if (txErr instanceof Error && txErr.message === "item_traded") {
        return NextResponse.json({ error: "An item in this trade is no longer available" }, { status: 409 })
      }
      if (txErr instanceof Error && txErr.message === "insufficient_points") {
        return NextResponse.json({ error: "Sender no longer has enough points for this trade" }, { status: 400 })
      }
      throw txErr
    }

    void Promise.allSettled([
      prisma.notification.create({
        data: {
          userId: trade.senderId, type: "TRADE_COMPLETED",
          message: `Swap with ${trade.receiver.name} completed! ${trade.offeredItem.title} ↔ ${trade.requestedItem.title}`,
          link: "/dashboard/trades", actorId: trade.receiverId,
        },
      }),
      prisma.notification.create({
        data: {
          userId: trade.receiverId, type: "TRADE_COMPLETED",
          message: `Swap with ${trade.sender.name} completed! ${trade.offeredItem.title} ↔ ${trade.requestedItem.title}`,
          link: "/dashboard/trades", actorId: trade.senderId,
        },
      }),
      pusher.trigger(`private-user-${trade.senderId}`, "trade-status-changed", {
        tradeId, newStatus: "COMPLETED", itemIds,
      }),
      pusher.trigger(`private-user-${trade.receiverId}`, "trade-status-changed", {
        tradeId, newStatus: "COMPLETED", itemIds,
      }),
    ])

    return NextResponse.json({ correct: true, completed: true })
  } catch (err) {
    console.error("[confirm/submit]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
