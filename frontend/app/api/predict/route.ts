import { NextRequest, NextResponse } from "next/server";

const rawBackendBase =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const backendBase = rawBackendBase.replace(/\/+$/, "").replace(/\/api$/, "");
const historyApiBase = (process.env.HISTORY_API_URL || "http://127.0.0.1:4100").replace(/\/+$/, "");

function toFilenameFromPath(pathLike: unknown): string {
  if (typeof pathLike !== "string") {
    return "";
  }
  const trimmed = pathLike.trim();
  if (!trimmed) {
    return "";
  }
  const pieces = trimmed.split("/");
  return pieces[pieces.length - 1] || "";
}

async function logHistoryAsync(payload: Record<string, unknown>) {
  try {
    await fetch(`${historyApiBase}/api/history/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Fire-and-forget logging should never block inference response.
  }
}

export async function POST(request: NextRequest) {
  const caseId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const incoming = await request.formData();
    const name = String(incoming.get("name") || "").trim();
    const gender = String(incoming.get("gender") || "unknown").toLowerCase();
    const ageAtMissing = Number.parseInt(String(incoming.get("age_at_missing") || ""), 10);
    const image = incoming.get("image");
    const imageFilename = image instanceof File ? image.name : "";

    void logHistoryAsync({
      caseId,
      personName: name,
      age: Number.isFinite(ageAtMissing) ? ageAtMissing : null,
      gender: gender === "male" || gender === "female" ? gender : "unknown",
      imageFilename,
      imageUrl: imageFilename ? `upload://${imageFilename}` : "",
      status: "pending",
      uploadedAt: now,
      updatedAt: now,
    });

    const response = await fetch(`${backendBase}/predict`, {
      method: "POST",
      body: incoming,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      void logHistoryAsync({
        caseId,
        personName: name,
        age: Number.isFinite(ageAtMissing) ? ageAtMissing : null,
        gender: gender === "male" || gender === "female" ? gender : "unknown",
        imageFilename,
        imageUrl: imageFilename ? `upload://${imageFilename}` : "",
        status: "failed",
        updatedAt: new Date().toISOString(),
      });

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

    void logHistoryAsync({
      caseId,
      personName: typeof data?.name === "string" ? data.name : name,
      age: typeof data?.current_age === "number" ? data.current_age : Number.isFinite(ageAtMissing) ? ageAtMissing : null,
      gender:
        data?.gender === "male" || data?.gender === "female"
          ? data.gender
          : gender === "male" || gender === "female"
            ? gender
            : "unknown",
      imageFilename,
      imageUrl: imageFilename ? `upload://${imageFilename}` : "",
      videoFilename: toFilenameFromPath(data?.progress_gif_path),
      videoUrl: typeof data?.progress_gif_path === "string" ? data.progress_gif_path : "",
      status: "completed",
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    void logHistoryAsync({
      caseId,
      status: "failed",
      updatedAt: new Date().toISOString(),
    });

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
