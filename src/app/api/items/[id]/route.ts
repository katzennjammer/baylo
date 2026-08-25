import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const item = await prisma.item.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, avatar: true, rating: true, totalTrades: true } } },
    })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (item.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const {
      title, description, category, condition, estimatedValue, images,
      wantedItems: wantedItemsRaw,
      localPickup, pickupLat, pickupLng, pickupAddress,
      imageHash,
    } = body

    // Encode pickup location into wantedItems JSON (same as POST)
    let wantedItemsValue: string | null = wantedItemsRaw ?? null
    if (localPickup && pickupLat != null && pickupLng != null) {
      wantedItemsValue = JSON.stringify({
        wanted: wantedItemsRaw || null,
        pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress ?? "" },
      })
    }

    const updated = await prisma.item.update({
      where: { id },
      data: {
        ...(title      !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category   !== undefined && { category }),
        ...(condition  !== undefined && { condition }),
        ...(estimatedValue !== undefined && { estimatedValue: estimatedValue != null ? parseFloat(estimatedValue) : null }),
        ...(images     !== undefined && { images: JSON.stringify(images) }),
        wantedItems: wantedItemsValue,
        ...(imageHash  !== undefined && { imageHash: imageHash ? String(imageHash) : null }),
      },
      include: { user: { select: { id: true, name: true, avatar: true, rating: true } } },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error("[PATCH /api/items/[id]]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (item.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.item.update({ where: { id }, data: { status: "REMOVED" } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
