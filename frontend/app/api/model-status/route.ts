import { NextResponse } from "next/server";

const rawBackendBase =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const backendBase = rawBackendBase.replace(/\/+$/, "").replace(/\/api$/, "");

export async function GET() {
  try {
    const response = await fetch(`${backendBase}/model-status`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          male_available: true,
          female_available: false,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        male_available: true,
        female_available: false,
      },
      { status: 200 },
    );
  }
}
