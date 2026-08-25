import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { auth } from "@/../auth"
import prisma from "@/lib/prisma"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { name, bio, location, currentPassword, newPassword } = body

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (typeof name === "string") {
    const trimmed = name.trim()
    if (!trimmed) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
    data.name = trimmed
  }
  if (typeof bio === "string") data.bio = bio.trim() || null
  if (typeof location === "string") data.location = location.trim() || null

  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
    }
    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 })
      }
      const valid = await bcrypt.compare(currentPassword, user.password)
      if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }
    data.password = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return NextResponse.json({ name: updated.name, bio: updated.bio, location: updated.location })
}
