import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import prisma from "@/lib/prisma"
import sharp from "sharp"
import Anthropic from "@anthropic-ai/sdk"

const keySnippet = process.env.ANTHROPIC_API_KEY
  ? `${process.env.ANTHROPIC_API_KEY.slice(0, 12)}…` : "(MISSING)"
console.log(`[phash] ANTHROPIC_API_KEY at module load: ${keySnippet}`)

const anthropic = new Anthropic()

// ── Config ────────────────────────────────────────────────────────────────────
// Hamming distance ceiling (out of 64 bits) for Stage 1 to flag a candidate.
// dHash ranges: renamed/recompressed ≈ 0–8, completely different image ≈ 20+.
// Default 10 gives a comfortable gap; tune down if you get false positives.
const THRESHOLD = parseInt(process.env.PHASH_THRESHOLD ?? "10", 10)

// What to do when Stage 2 (AI) confirms a duplicate: "block" | "warn" | "flag"
// "block" → status:"failed" (wizard blocks Next button)
// "warn"  → status:"warned" (wizard can show a softer warning)
// "flag"  → status:"passed" (allow but include flagged:true in response)
const DUPLICATE_ACTION = process.env.DUPLICATE_ACTION ?? "block"

// ── dHash ─────────────────────────────────────────────────────────────────────
// Resize to 9×8, compare each pixel to its right neighbour per row → 64-bit
// binary string. Encodes local gradients, so JPEG recompression / minor resizes
// / brightness shifts don't flip bits — far more robust than aHash.
async function computeDHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = Array.from(data as Uint8Array)
  const bits: string[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      bits.push(pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? "1" : "0")
    }
  }
  return bits.join("")
}

function hammingDistance(a: string, b: string): number {
  let d = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++
  return d
}

// ── Stage 2: Claude vision confirmation ───────────────────────────────────────
// Both URLs are public Cloudinary URLs — imageUrl is the newly-uploaded image
// (already on Cloudinary before /api/ai/phash is called by the wizard),
// existingUrl is the stored first image of the matching item.
async function confirmWithAI(imageUrl: string, existingUrl: string): Promise<boolean> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "image", source: { type: "url", url: existingUrl } },
        {
          type: "text",
          text: "You are a duplicate-image detector for a secondhand trade marketplace. Are these two images the same photo, or is the same physical item reused in both? Answer YES or NO on the first line, then one short sentence of reasoning.",
        },
      ],
    }],
  })
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : ""
  return text.toUpperCase().startsWith("YES")
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { imageUrl } = await req.json() as { imageUrl?: string }
  if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 })

  // ── Stage 1A: compute dHash for the new upload ────────────────────────────
  let hash: string
  try {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    hash = await computeDHash(buffer)
  } catch (e) {
    console.error(
      "[phash] ⚠ Stage 1A FAILED — item will be posted without imageHash (duplicate protection disabled for this listing).",
      "\n  imageUrl:", imageUrl,
      "\n  error:", e instanceof Error ? `${e.name}: ${e.message}` : e,
    )
    return NextResponse.json({ hash: null, status: "passed" })
  }

  // ── Stage 1B: self-check (own items — allowed, just note it) ─────────────
  const ownItems = await prisma.item.findMany({
    where: { status: "AVAILABLE", imageHash: { not: null }, userId: session.user.id },
    select: { id: true, imageHash: true },
  })
  console.log(`[phash] Own items (AVAILABLE, hashed): ${ownItems.length}`)
  for (const item of ownItems) {
    if (!item.imageHash) continue
    const dist = hammingDistance(hash, item.imageHash)
    console.log(`[phash] Self-check item ${item.id}: distance=${dist}`)
    if (dist <= THRESHOLD) {
      return NextResponse.json({ hash, status: "self", matchedItemId: item.id, distance: dist })
    }
  }

  // ── Stage 1C: compare against other users' items ──────────────────────────
  const otherItems = await prisma.item.findMany({
    where: {
      status: "AVAILABLE",
      imageHash: { not: null },
      userId: { not: session.user.id },
    },
    select: { id: true, imageHash: true, images: true },
  })

  console.log(`[phash] Candidates (other users, AVAILABLE, hashed): ${otherItems.length}`)
  console.log(`[phash] New upload hash: ${hash}`)

  let candidate: { id: string; existingImageUrl: string; distance: number } | null = null
  let closestDist = Infinity
  let closestItemId: string | null = null
  for (const item of otherItems) {
    if (!item.imageHash) continue
    const dist = hammingDistance(hash, item.imageHash)
    if (dist < closestDist) { closestDist = dist; closestItemId = item.id }
    if (dist <= THRESHOLD) {
      let existingImageUrl = ""
      try { existingImageUrl = (JSON.parse(item.images) as string[])[0] ?? "" } catch { /* skip */ }
      candidate = { id: item.id, existingImageUrl, distance: dist }
      break
    }
  }

  if (closestItemId) {
    console.log(`[phash] Closest match: item ${closestItemId} @ distance ${closestDist} (threshold=${THRESHOLD}) → ${closestDist <= THRESHOLD ? "HIT" : "MISS"}`)
  } else {
    console.log(`[phash] No candidates to compare against — returning passed with no check`)
  }

  if (!candidate) {
    return NextResponse.json({
      hash, status: "passed",
      _debug: {
        candidatesChecked: otherItems.length,
        closestDistance:   closestDist === Infinity ? null : closestDist,
        closestItemId,
        threshold: THRESHOLD,
      },
    })
  }

  // ── Stage 2: Claude vision confirmation ───────────────────────────────────
  if (!candidate.existingImageUrl) {
    // No stored image URL to send to Claude — fall back to Stage 1 result
    console.warn("[phash] Stage 2 skipped: no stored image URL for item", candidate.id)
    const status = DUPLICATE_ACTION === "block" ? "failed" : "passed"
    return NextResponse.json({ hash, status, matchedItemId: candidate.id, distance: candidate.distance, stage: 1 })
  }

  let aiConfirmed: boolean
  try {
    aiConfirmed = await confirmWithAI(imageUrl, candidate.existingImageUrl)
  } catch (e) {
    // Vision API failed — fall back to Stage 1 decision conservatively
    console.error("[phash] Stage 2 AI call failed, falling back to Stage 1:", e)
    aiConfirmed = true
  }

  if (!aiConfirmed) {
    // AI says these are different items — Stage 1 was a false positive
    return NextResponse.json({
      hash, status: "passed",
      matchedItemId: candidate.id, distance: candidate.distance, aiVerdict: "no", stage: 2,
    })
  }

  // AI confirmed duplicate — apply configured action
  const status =
    DUPLICATE_ACTION === "block" ? "failed" :
    DUPLICATE_ACTION === "warn"  ? "warned" :
    "passed" // "flag" mode: allow but caller can inspect aiVerdict + flagged

  return NextResponse.json({
    hash, status,
    matchedItemId: candidate.id, distance: candidate.distance,
    aiVerdict: "yes", stage: 2,
    ...(DUPLICATE_ACTION === "flag" ? { flagged: true } : {}),
  })

  } catch (e) {
    // Stages 1B/1C Prisma queries and auth() have no individual try-catch.
    // Without this outer catch, any DB error returns HTML 500, the wizard's
    // r.json() throws, phashRes becomes "rejected", and imageHash is silently dropped.
    console.error(
      "[phash] ⚠ UNHANDLED ERROR in phash route — item will be posted without imageHash.",
      "\n  Root cause: likely a transient DB error in Stage 1B/1C Prisma query, or auth() failure.",
      "\n  error:", e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : e,
    )
    return NextResponse.json({ hash: null, status: "passed" })
  }
}
