import { NextResponse } from "next/server";

const historyApiBase = (process.env.HISTORY_API_URL || "http://127.0.0.1:4100").replace(/\/+$/, "");

export async function GET() {
  try {
    const response = await fetch(`${historyApiBase}/api/history/uploads`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({ items: [] }));

    if (!response.ok) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
