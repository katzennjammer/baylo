import prisma from "@/lib/prisma"
import {
  ECO_TASK_POINTS,
  ECO_TASK_ORDER,
  type EcoTaskKey,
  type EcoTasksStatus,
} from "@/lib/eco-constants"

// Reconciles a user's Eco-Task completions against current DB state and
// returns the up-to-date task checklist. Called lazily (dashboard load /
// GET /api/eco-tasks) so no award hooks are needed in other routes.
//
// Award rules:
//   VERIFY_ACCOUNT   — Google-verified accounts only (password === null).
//                      Never awarded for merely having a password.
//   COMPLETE_PROFILE — avatar, bio and location all filled in.
//   FIRST_LISTING    — has listed at least one item.
//   VERIFIED_SWAP    — once per COMPLETED trade (code-verified flow).
//   SAFEZONE_MEETUP  — once per COMPLETED trade flagged safeZoneMeetup.
export async function reconcileEcoTasks(userId: string): Promise<EcoTasksStatus | null> {
  const [user, itemCount, completedTrades, existing] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { password: true, avatar: true, bio: true, location: true, ecoPoints: true },
    }),
    prisma.item.count({ where: { userId } }),
    prisma.tradeRequest.findMany({
      where:  { OR: [{ senderId: userId }, { receiverId: userId }], status: "COMPLETED" },
      select: { id: true, safeZoneMeetup: true },
    }),
    prisma.ecoTaskCompletion.findMany({
      where:  { userId },
      select: { task: true, refId: true },
    }),
  ])
  if (!user) return null

  const googleVerified = user.password === null
  const profileComplete =
    !!user.avatar?.trim() && !!user.bio?.trim() && !!user.location?.trim()

  // Everything the user is currently eligible for
  const eligible: { task: EcoTaskKey; refId: string }[] = []
  if (googleVerified)   eligible.push({ task: "VERIFY_ACCOUNT",   refId: "" })
  if (profileComplete)  eligible.push({ task: "COMPLETE_PROFILE", refId: "" })
  if (itemCount > 0)    eligible.push({ task: "FIRST_LISTING",    refId: "" })
  for (const t of completedTrades) {
    eligible.push({ task: "VERIFIED_SWAP", refId: t.id })
    if (t.safeZoneMeetup) eligible.push({ task: "SAFEZONE_MEETUP", refId: t.id })
  }

  const have = new Set(existing.map((c) => `${c.task}:${c.refId}`))
  const missing = eligible.filter((e) => !have.has(`${e.task}:${e.refId}`))

  // Award each missing completion atomically with its ecoPoints increment.
  // The @@unique([userId, task, refId]) constraint makes concurrent
  // reconciles safe: a duplicate insert fails and the increment rolls back.
  for (const m of missing) {
    const points = ECO_TASK_POINTS[m.task]
    try {
      await prisma.$transaction([
        prisma.ecoTaskCompletion.create({
          data: { userId, task: m.task, refId: m.refId, points },
        }),
        prisma.user.update({
          where: { id: userId },
          data:  { ecoPoints: { increment: points } },
        }),
      ])
    } catch {
      // P2002 unique violation — another request already awarded it
    }
  }

  // Re-read so the response reflects exactly what's in the DB
  const [freshUser, completions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { ecoPoints: true } }),
    prisma.ecoTaskCompletion.findMany({
      where:  { userId },
      select: { task: true, points: true },
    }),
  ])

  const byTask = new Map<string, { count: number; pointsEarned: number }>()
  for (const c of completions) {
    const cur = byTask.get(c.task) ?? { count: 0, pointsEarned: 0 }
    cur.count += 1
    cur.pointsEarned += c.points
    byTask.set(c.task, cur)
  }

  return {
    ecoPoints: freshUser?.ecoPoints ?? 0,
    googleVerified,
    tasks: ECO_TASK_ORDER.map((task) => {
      const agg = byTask.get(task)
      return {
        task,
        done:         (agg?.count ?? 0) > 0,
        count:        agg?.count ?? 0,
        pointsEarned: agg?.pointsEarned ?? 0,
      }
    }),
  }
}
