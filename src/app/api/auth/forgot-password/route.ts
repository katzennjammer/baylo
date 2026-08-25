import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/mailer"

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (user) {
      // Delete any existing token for this email
      await prisma.passwordResetToken.deleteMany({ where: { email } })

      const token = crypto.randomBytes(32).toString("hex")
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min

      await prisma.passwordResetToken.create({ data: { email, token, expiresAt } })

      const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
      await sendPasswordResetEmail(email, resetUrl, user.name)
    }

    // Always return 200 — don't reveal whether account exists
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error"
    console.error("forgot-password error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
