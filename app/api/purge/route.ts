import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredItems } from "@/lib/purge";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-purge-secret");
  if (secret !== process.env.PURGE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await purgeExpiredItems(new Date());
  return NextResponse.json(result);
}
