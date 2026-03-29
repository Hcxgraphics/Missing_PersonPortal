import { NextRequest, NextResponse } from "next/server";

const rawBackendBase =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const backendBase = rawBackendBase.replace(/\/+$/, "").replace(/\/api$/, "");

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();

    const response = await fetch(`${backendBase}/predict`, {
      method: "POST",
      body: incoming,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          detail:
            typeof data?.detail === "string"
              ? data.detail
              : "We could not process this request right now. Please try again.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const detail =
      error instanceof Error && error.message
        ? `Backend API is unreachable at ${backendBase}. Start the FastAPI server and try again.`
        : "Backend API is unavailable. Start the FastAPI server and try again.";

    return NextResponse.json(
      {
        detail,
      },
      { status: 503 },
    );
  }
}
