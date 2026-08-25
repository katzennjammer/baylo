import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import prisma from "@/lib/prisma";
import { PHP_PER_POINT, calcPlatformFee } from "@/lib/wallet-config";

// TODO: Real gateway webhook entry point.
// When PayMongo/GCash confirms a payment, it POSTs to a separate
// /api/wallet/topup/webhook route. That route verifies the provider's
// signature, then calls the same Prisma transaction below with
// provider = "paymongo" (or "gcash") and the real gatewayFee from
// the provider's response. No other wallet or UI code needs changing.

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json()) as { points?: unknown };
  const points = Math.floor(Number(body.points ?? 0));

  if (!Number.isFinite(points) || points <= 0 || points > 100_000) {
    return NextResponse.json({ error: "Invalid points amount (1–100,000)" }, { status: 400 });
  }

  const provider = "demo";
  const grossAmount = points * PHP_PER_POINT;  // notional PHP — no real charge in demo
  const gatewayFee = 0;                         // demo: no real gateway
  const platformFee = calcPlatformFee(grossAmount);
  // In demo mode platformFee = 0, so netPoints = points.
  // When a real gateway runs, it may deduct fees from netPoints — adjust here per provider logic.
  const netPoints = points;

  const result = await prisma.$transaction(async (tx) => {
    const ledger = await tx.walletTransaction.create({
      data: {
        userId,
        type: "TOP_UP",
        amount: netPoints,
        description: `Demo top-up — ${points.toLocaleString("en-US")} pts`,
        grossAmount,
        gatewayFee,
        platformFee,
        netPoints,
        provider,
      },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { increment: netPoints } },
      select: { points: true },
    });
    return { balance: updated.points, transaction: ledger };
  });

  return NextResponse.json(result, { status: 201 });
}
