import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import { phpToPoints } from "@/lib/wallet-config"

// Realistic second-hand market bands in PHP for the Philippines.
// phpToPoints() converts to Baylo points (₱5 = 1 pt).
const VALUE_BANDS: Record<string, [number, number]> = {
  ELECTRONICS:  [500, 20000], CLOTHING:  [150, 3000],  BAGS:    [200, 8000],
  BEAUTY:       [100, 5000],  ACCESSORIES:[200, 10000], FURNITURE:[500, 15000],
  BOOKS:        [75, 1000],   GAMING:    [500, 20000],  SPORTS:  [300, 15000],
  BIKES:        [1000, 30000],TOYS:      [100, 3000],   TOOLS:   [200, 10000],
  MUSIC:        [500, 30000], ART:       [200, 5000],   COLLECTIBLES:[100, 10000],
  PETS:         [100, 3000],  PLANTS:    [100, 2000],   FOOD:    [50, 500],
  SERVICES:     [500, 10000], OTHER:     [100, 5000],
}

const CATEGORY_LABELS: Record<string, string> = {
  ELECTRONICS: "Electronics",  CLOTHING: "Clothing",      BAGS: "Bags",
  BEAUTY: "Beauty",            ACCESSORIES: "Accessories", FURNITURE: "Furniture",
  BOOKS: "Books & Media",      GAMING: "Gaming",           SPORTS: "Sports",
  BIKES: "Bikes",              TOYS: "Toys & Kids",        TOOLS: "Tools",
  MUSIC: "Music",              ART: "Art & Crafts",        COLLECTIBLES: "Collectibles",
  PETS: "Pets",                PLANTS: "Plants",           FOOD: "Food",
  SERVICES: "Services",        OTHER: "Other",
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const category = new URL(req.url).searchParams.get("category") ?? "OTHER"
  const label = CATEGORY_LABELS[category] ?? category

  try {
    const traded = await prisma.item.findMany({
      where: { category: category as never, status: "TRADED", estimatedValue: { not: null } },
      select: { estimatedValue: true },
      take: 100,
    })

    const values = traded.map(i => i.estimatedValue!).filter(v => v > 0)
    const band = VALUE_BANDS[category] ?? [5, 200]
    const comparables: { label: string; sublabel: string; pts: string }[] = []

    let min: number, max: number, midpoint: number
    let source: string

    if (values.length >= 3) {
      min      = Math.min(...values)
      max      = Math.max(...values)
      midpoint = values.reduce((a, b) => a + b, 0) / values.length
      source   = "baylo_trades"
      comparables.push({
        label:    `Recent ${label} swaps`,
        sublabel: `Baylo · ${label} · ${values.length} completed trade${values.length !== 1 ? "s" : ""}`,
        pts:      `~${phpToPoints(midpoint).toLocaleString("en-US")} pts avg`,
      })
    } else {
      min      = band[0]
      max      = band[1]
      midpoint = (band[0] + band[1]) / 2
      source   = "category_average"
    }

    comparables.push({
      label:    `Typical ${label} value`,
      sublabel: "Category average",
      pts:      `${phpToPoints(band[0]).toLocaleString("en-US")} – ${phpToPoints(band[1]).toLocaleString("en-US")} pts`,
    })

    return NextResponse.json({
      min:      phpToPoints(min),
      max:      phpToPoints(max),
      midpoint: phpToPoints(midpoint),
      comparables,
      source,
    })
  } catch {
    const band = VALUE_BANDS[category] ?? [5, 200]
    const midpoint = (band[0] + band[1]) / 2
    return NextResponse.json({
      min:      phpToPoints(band[0]),
      max:      phpToPoints(band[1]),
      midpoint: phpToPoints(midpoint),
      comparables: [{
        label:    `Typical ${label} value`,
        sublabel: "Category average",
        pts:      `${phpToPoints(band[0]).toLocaleString("en-US")} – ${phpToPoints(band[1]).toLocaleString("en-US")} pts`,
      }],
      source: "category_average",
    })
  }
}
