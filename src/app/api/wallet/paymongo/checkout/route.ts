import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { PHP_PER_POINT } from "@/lib/wallet-config";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

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

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 503 });
  }

  const grossAmountPhp = points * PHP_PER_POINT;
  const amountCentavos = grossAmountPhp * 100;
  const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const payload = {
    data: {
      attributes: {
        cancel_url: `${appUrl}/dashboard?topup=cancelled`,
        description: `Baylo top-up — ${points.toLocaleString("en-US")} points`,
        line_items: [
          {
            currency: "PHP",
            amount: amountCentavos,
            description: `Baylo points (1 pt = ₱${PHP_PER_POINT})`,
            name: "Baylo Points",
            quantity: 1,
          },
        ],
        // userId and points survive through to the webhook via metadata
        metadata: { userId, points: String(points) },
        payment_method_types: ["gcash"],
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: `${appUrl}/topup/success`,
      },
    },
  };

  const pmRes = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  if (!pmRes.ok) {
    const err = await pmRes.json().catch(() => ({}));
    console.error("[paymongo/checkout] session creation failed:", err);
    return NextResponse.json({ error: "Failed to create payment session" }, { status: 502 });
  }

  const pmData = (await pmRes.json()) as {
    data?: { attributes?: { checkout_url?: string } };
  };
  const checkoutUrl = pmData.data?.attributes?.checkout_url;

  if (!checkoutUrl) {
    return NextResponse.json({ error: "No checkout URL returned by gateway" }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
