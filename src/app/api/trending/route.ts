import { NextResponse } from "next/server"
import { auth } from "@/../auth"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

const CATEGORY_HASHTAG: Record<string, string> = {
  ELECTRONICS: "#Electronics",
  CLOTHING:    "#Fashion",
  FURNITURE:   "#HomeGarden",
  BOOKS:       "#BooksMedia",
  SPORTS:      "#Sports",
  TOYS:        "#KidsToys",
  TOOLS:       "#ToolsDIY",
  FOOD:        "#Food",
  SERVICES:    "#Services",
  OTHER:       "#Miscellaneous",
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = await prisma.item.groupBy({
    by: ["category"],
    where: {
      createdAt: { gte: weekAgo },
      status: { not: "REMOVED" },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  })

  const tags = rows.map((r) => ({
    tag: CATEGORY_HASHTAG[r.category] ?? `#${r.category}`,
    count: r._count.id,
  }))

  return NextResponse.json(tags)
}
