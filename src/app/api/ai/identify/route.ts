import { NextRequest, NextResponse } from "next/server"
import { auth } from "@root/auth"
import Anthropic from "@anthropic-ai/sdk"

const keySnippet = process.env.ANTHROPIC_API_KEY
  ? `${process.env.ANTHROPIC_API_KEY.slice(0, 12)}…` : "(MISSING)"
console.log(`[identify] ANTHROPIC_API_KEY at module load: ${keySnippet}`)

const anthropic = new Anthropic()

const VALID_CATEGORIES = ["ELECTRONICS","CLOTHING","BAGS","BEAUTY","ACCESSORIES","FURNITURE","BOOKS","GAMING","SPORTS","BIKES","TOYS","TOOLS","MUSIC","ART","COLLECTIBLES","PETS","PLANTS","FOOD","SERVICES","OTHER"]
const VALID_CONDITIONS  = ["NEW","LIKE_NEW","GOOD","FAIR","POOR"]

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { imageUrl } = await req.json() as { imageUrl?: string }
  if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 })

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: `Identify this item for a secondhand trade marketplace listing. Return ONLY valid JSON — no markdown, no code fences, no explanation:
{"name":"<concise item name, max 6 words>","category":"<ELECTRONICS|CLOTHING|BAGS|BEAUTY|ACCESSORIES|FURNITURE|BOOKS|GAMING|SPORTS|BIKES|TOYS|TOOLS|MUSIC|ART|COLLECTIBLES|PETS|PLANTS|FOOD|SERVICES|OTHER>","condition":"<NEW|LIKE_NEW|GOOD|FAIR|POOR>","tags":["<tag1>","<tag2>","<tag3>"]}`,
          },
        ],
      }],
    })

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : ""
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, unknown> : {}

    return NextResponse.json({
      name:      typeof result.name === "string" ? result.name : "",
      category:  VALID_CATEGORIES.includes(result.category as string) ? result.category : "OTHER",
      condition: VALID_CONDITIONS.includes(result.condition as string) ? result.condition : "GOOD",
      tags:      Array.isArray(result.tags) ? (result.tags as unknown[]).filter(t => typeof t === "string").slice(0, 5) : [],
    })
  } catch (e) {
    console.error("[identify] AI call failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ name: "", category: "OTHER", condition: "GOOD", tags: [], _error: String(e) })
  }
}
