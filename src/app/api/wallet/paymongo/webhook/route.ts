import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import { PHP_PER_POINT, calcPlatformFee } from "@/lib/wallet-config";

// Must run on Node.js runtime (uses Node crypto, Prisma)
export const runtime = "nodejs";

// PayMongo signature header: "t=<epoch>,te=<hmac_test_hex>,li=<hmac_live_hex>"
// Verify against "te" (test signature) using the webhook secret from the dashboard.
function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parsed: Record<string, string> = {};
  for (const pair of signatureHeader.split(",")) {
    const sep = pair.indexOf("=");
    if (sep !== -1) parsed[pair.slice(0, sep).trim()] = pair.slice(sep + 1).trim();
  }

  const timestamp = parsed["t"];
  const testSig = parsed["te"];
  if (!timestamp || !testSig) return false;

  // Reject if webhook is >5 minutes old (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const expBuf = Buffer.from(expected, "hex");
    const recBuf = Buffer.from(testSig, "hex");
    if (expBuf.length !== recBuf.length) return false;
    return timingSafeEqual(expBuf, recBuf);
  } catch {
    return false;
  }
}

// PayMongo webhook event shape (checkout_session.payment.paid)
interface PMLineItem {
  amount: number;   // centavos per unit
  quantity?: number;
}

interface PMEvent {
  data: {
    id: string;
    attributes: {
      type: string;
      data: {
        id: string; // checkout session id → used as gatewayRef
        attributes: {
          line_items?: PMLineItem[]; // sum of amounts gives total in centavos
          metadata: Record<string, string>;
        };
      };
    };
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paymongo/webhook] PAYMONGO_WEBHOOK_SECRET is not set");
    return new NextResponse(null, { status: 503 });
  }

  // Read raw body BEFORE any JSON parsing — needed for HMAC verification
  const rawBody = await req.text();
  const sigHeader = req.headers.get("paymongo-signature") ?? "";

  if (!verifySignature(rawBody, sigHeader, secret)) {
    console.warn("[paymongo/webhook] signature verification failed");
    return new NextResponse(null, { status: 400 });
  }

  let event: PMEvent;
  try {
    event = JSON.parse(rawBody) as PMEvent;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Acknowledge events we don't handle (e.g. checkout_session.payment.failed)
  if (event.data?.attributes?.type !== "checkout_session.payment.paid") {
    return new NextResponse(null, { status: 200 });
  }

  const sessionData = event.data.attributes.data;
  const sessionId = sessionData.id;
  const meta = sessionData.attributes.metadata ?? {};
  const userId = meta["userId"];
  const points = Math.floor(Number(meta["points"] ?? 0));

  if (!userId || !Number.isFinite(points) || points <= 0) {
    console.error("[paymongo/webhook] invalid metadata", { userId, points, sessionId });
    return new NextResponse(null, { status: 400 });
  }

  // PayMongo checkout sessions have no top-level `amount`; sum line_items instead
  const lineItems = sessionData.attributes.line_items ?? [];
  const amountCentavos = lineItems.reduce(
    (sum, item) => sum + item.amount * (item.quantity ?? 1),
    0
  );
  const grossAmount = amountCentavos / 100; // centavos → PHP

  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    console.error("[paymongo/webhook] could not parse amount from payload", {
      sessionId,
      lineItems,
      attributes: sessionData.attributes,
    });
    return new NextResponse(null, { status: 400 });
  }

  // Idempotency: if this session was already credited, return 200 silently
  const existing = await prisma.walletTransaction.findFirst({
    where: { gatewayRef: sessionId },
    select: { id: true },
  });
  if (existing) {
    return new NextResponse(null, { status: 200 });
  }

  const platformFee = calcPlatformFee(grossAmount);
  const gatewayFee = 0; // PayMongo doesn't expose per-txn fee in webhook; tracked separately
  const netPoints = Math.floor((grossAmount - gatewayFee - platformFee) / PHP_PER_POINT);

  await prisma.$transaction([
    prisma.walletTransaction.create({
      data: {
        user: { connect: { id: userId } },
        type: "TOP_UP",
        amount: netPoints,
        description: `GCash top-up — ${points.toLocaleString("en-US")} pts`,
        grossAmount,
        gatewayFee,
        platformFee,
        netPoints,
        provider: "paymongo",
        gatewayRef: sessionId,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: netPoints } },
    }),
  ]);

  return new NextResponse(null, { status: 200 });
}
