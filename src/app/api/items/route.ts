import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")
    const q = searchParams.get("q")
    const mine = searchParams.get("mine") === "true"

    if (mine) {
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const items = await prisma.item.findMany({
        where: { userId: session.user.id, status: "AVAILABLE" },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json(items)
    }

    const items = await prisma.item.findMany({
      where: {
        status: "AVAILABLE",
        ...(category && category !== "ALL" ? { category: category as never } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
      },
      include: { user: { select: { id: true, name: true, avatar: true, rating: true, totalTrades: true, ecoPoints: true } } },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      title, description, category, condition, estimatedValue, images,
      // Dashboard modal fields
      wantedItems: wantedItemsRaw,
      localPickup, pickupLat, pickupLng, pickupAddress,
      imageHash,
    } = body

    const resolvedTitle = title || body.wantedItem
    if (!resolvedTitle || !category || !condition) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Encode pickup location into wantedItems when localPickup is on
    let wantedItemsValue: string | null = wantedItemsRaw || null
    if (localPickup && pickupLat != null && pickupLng != null) {
      wantedItemsValue = JSON.stringify({
        wanted: wantedItemsRaw || null,
        pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress ?? "" },
      })
    }

    const item = await prisma.item.create({
      data: {
        title: resolvedTitle,
        description: description || resolvedTitle,
        category,
        condition,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
        wantedItems: wantedItemsValue,
        images: JSON.stringify(images || []),
        userId: session.user.id,
        ...(imageHash ? { imageHash: String(imageHash) } : {}),
      },
      include: { user: { select: { id: true, name: true, avatar: true, rating: true, totalTrades: true, ecoPoints: true } } },
    })

    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
