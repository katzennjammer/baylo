import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sendSwapConfirmationCode } from "@/lib/mailer"

function randomDigits(n: number): string {
  let code = ""
  for (let i = 0; i < n; i++) code += Math.floor(Math.random() * 10).toString()
  return code
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: tradeId } = await params
    const myId = session.user.id

    const trade = await prisma.tradeRequest.findUnique({
      where: { id: tradeId },
      include: {
        sender:        { select: { id: true, name: true, email: true } },
        receiver:      { select: { id: true, name: true, email: true } },
        offeredItem:   { select: { title: true } },
        requestedItem: { select: { title: true } },
      },
    })

    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 })
    if (trade.senderId !== myId && trade.receiverId !== myId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (trade.status !== "ACCEPTED" && trade.status !== "CONFIRMING") {
      return NextResponse.json({ error: "Trade is not ready for confirmation" }, { status: 400 })
    }

    const now = new Date()

    // Check if non-expired codes already exist for both participants.
    // If so, return early — idempotent: don't re-generate, don't re-email.
    const existing = await prisma.swapConfirmationCode.findMany({
      where: {
        tradeId,
        expiresAt: { gt: now },
      },
    })
    if (existing.length === 2) {
      return NextResponse.json({ started: true, alreadyStarted: true })
    }

    // Generate a 6-digit code for each participant, hash with bcrypt.
    const senderCode   = randomDigits(6)
    const receiverCode = randomDigits(6)
    const expiresAt    = new Date(now.getTime() + 15 * 60 * 1000) // 15 minutes

    const [senderHash, receiverHash] = await Promise.all([
      bcrypt.hash(senderCode,   10),
      bcrypt.hash(receiverCode, 10),
    ])

    // Upsert — if a row for [tradeId, userId] already exists (e.g. expired),
    // overwrite it with a fresh code and reset used=false.
    await prisma.$transaction([
      prisma.swapConfirmationCode.upsert({
        where:  { tradeId_userId: { tradeId, userId: trade.senderId } },
        create: { tradeId, userId: trade.senderId,   codeHash: senderHash,   used: false, expiresAt },
        update: { codeHash: senderHash,   used: false, expiresAt },
      }),
      prisma.swapConfirmationCode.upsert({
        where:  { tradeId_userId: { tradeId, userId: trade.receiverId } },
        create: { tradeId, userId: trade.receiverId, codeHash: receiverHash, used: false, expiresAt },
        update: { codeHash: receiverHash, used: false, expiresAt },
      }),
      prisma.tradeRequest.update({
        where: { id: tradeId },
        data:  { status: "CONFIRMING" },
      }),
    ])

    // Email each participant their own code.
    // Use allSettled so an SMTP failure doesn't crash the response — codes are
    // already saved in the DB, so the flow can still proceed.
    const emailResults = await Promise.allSettled([
      sendSwapConfirmationCode(
        trade.sender.email,
        trade.sender.name,
        senderCode,
        trade.receiver.name,
        { yours: trade.offeredItem.title, theirs: trade.requestedItem.title },
      ),
      sendSwapConfirmationCode(
        trade.receiver.email,
        trade.receiver.name,
        receiverCode,
        trade.sender.name,
        { yours: trade.requestedItem.title, theirs: trade.offeredItem.title },
      ),
    ])
    for (const r of emailResults) {
      if (r.status === "rejected") console.error("[confirm/start] email error:", r.reason)
    }

    return NextResponse.json({ started: true })
  } catch (err) {
    console.error("[confirm/start]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
