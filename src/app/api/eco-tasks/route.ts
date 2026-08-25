import { NextResponse } from "next/server";
import { auth } from "@/../auth";
import { reconcileEcoTasks } from "@/lib/eco-tasks";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await reconcileEcoTasks(session.user.id);
  if (!status) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(status);
}
