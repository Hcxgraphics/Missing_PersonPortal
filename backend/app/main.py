from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Missing Person Identification API", version="1.0.0")
service: ModelInferenceService | None = None
service_init_error: str | None = None

backend_root = Path(__file__).resolve().parents[1]
static_dir = backend_root / "app" / "static"

if not static_dir.exists():
    static_dir.mkdir(parents=True, exist_ok=True)

if TYPE_CHECKING:
    from app.services.inference import ModelInferenceService

try:
    from app.services.inference import ModelInferenceService

    service = ModelInferenceService()
except Exception as exc:
    service_init_error = str(exc)

frontend_origins_raw = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000,http://127.0.0.1:3000",
)
frontend_origins = [origin.strip() for origin in frontend_origins_raw.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


def _require_service() -> ModelInferenceService:
    if service is None:
        detail = "Model runtime is unavailable. Install backend dependencies and restart the API."
        if service_init_error:
            detail = f"{detail} Root cause: {service_init_error}"
        raise HTTPException(status_code=503, detail=detail)
    return service


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/")
def root() -> dict:
    return {"status": "ok", "message": "Missing Person Identification API"}


@app.get("/api/health")
def health_alias() -> dict:
    return health()


@app.get("/model-status")
def model_status() -> dict:
    return _require_service().available_models()


@app.get("/api/model-status")
def model_status_alias() -> dict:
    return model_status()


@app.post("/predict")
async def predict(
    name: str = Form(...),
    image: UploadFile = File(...),
    gender: str = Form("male"),
    age_at_missing: int = Form(...),
    missing_year: int = Form(...),
) -> dict:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    current_year = datetime.now().year
    if age_at_missing < 0 or age_at_missing > 120:
        raise HTTPException(status_code=400, detail="age_at_missing must be between 0 and 120")
    if missing_year < 1900 or missing_year > current_year:
        raise HTTPException(status_code=400, detail=f"missing_year must be between 1900 and {current_year}")

    years_missing = current_year - missing_year
    current_age = age_at_missing + years_missing

    gender_normalized = gender.strip().lower()
    if gender_normalized not in {"male", "female"}:
        raise HTTPException(status_code=400, detail="gender must be male or female")

    model_name = "males_model" if gender_normalized == "male" else "females_model"

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    try:
        result = _require_service().run(
            image_bytes=raw,
            original_filename=image.filename or "input.png",
            model_name=model_name,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return {
        "name": name,
        "gender": gender_normalized,
        "age_at_missing": age_at_missing,
        "missing_year": missing_year,
        "current_age": current_age,
        "model_name": result.model_name,
        "progression_image_base64": result.progression_image_b64,
        "progress_gif_base64": result.gif_b64,
        "progression_image_path": f"/static/generated/{result.progression_image_path.name}",
        "progress_gif_path": f"/static/generated/{result.gif_path.name}",
    }


@app.post("/api/predict")
async def predict_alias(
    name: str = Form(...),
    image: UploadFile = File(...),
    gender: str = Form("male"),
    age_at_missing: int = Form(...),
    missing_year: int = Form(...),
) -> dict:
    return await predict(
        name=name,
        image=image,
        gender=gender,
        age_at_missing=age_at_missing,
        missing_year=missing_year,
    )
