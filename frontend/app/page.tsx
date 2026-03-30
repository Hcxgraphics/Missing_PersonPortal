"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type PredictResponse = {
  name: string;
  gender: string;
  age_at_missing: number;
  missing_year: number;
  current_age: number;
  model_name: string;
  progression_image_base64: string;
  progress_gif_base64: string;
  progression_image_path: string;
  progress_gif_path: string;
};

type ModelStatus = {
  male_available: boolean;
  female_available: boolean;
};

export default function HomePage() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [ageAtMissing, setAgeAtMissing] = useState("");
  const [missingYear, setMissingYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({
    male_available: true,
    female_available: false,
  });

  const toFriendlyError = (message: string) => {
    const lower = message.toLowerCase();

    if (lower.includes("backend api is unreachable") || lower.includes("backend api is unavailable")) {
      return "The backend service is not running. Start the FastAPI server on port 8000, then try again.";
    }
    if (lower.includes("inference failed:")) {
      return message.replace(/^inference failed:\s*/i, "");
    }
    if (lower.includes("name is required")) {
      return "Please enter the person's name.";
    }
    if (lower.includes("uploaded image is empty") || lower.includes("image")) {
      return "Please upload a valid image file.";
    }
    if (lower.includes("failed to fetch") || lower.includes("service is temporarily unavailable")) {
      return "The processing service is currently unavailable. Please try again shortly.";
    }
    if (lower.includes("checkpoint folder is missing") || lower.includes("selected gender model")) {
      return "The selected gender model is not installed yet. Please select an available option.";
    }

    return "We could not process this request right now. Please try again.";
  };

  useEffect(() => {
    const loadModelStatus = async () => {
      try {
        const response = await fetch("/api/model-status", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as ModelStatus;
        setModelStatus(data);
        if (!data.female_available && gender === "female") {
          setGender("male");
        }
      } catch {
        // Keep safe defaults when status check fails.
      }
    };

    loadModelStatus();
  }, [gender]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError("");

    if (selected) {
      setPreviewUrl(URL.createObjectURL(selected));
    } else {
      setPreviewUrl("");
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    if (!file) {
      setError("Image upload is required.");
      return;
    }

    const parsedAgeAtMissing = Number.parseInt(ageAtMissing, 10);
    const parsedMissingYear = Number.parseInt(missingYear, 10);
    const currentYear = new Date().getFullYear();

    if (Number.isNaN(parsedAgeAtMissing) || parsedAgeAtMissing < 0 || parsedAgeAtMissing > 120) {
      setError("Please enter a valid age at the time of missing (0-120).");
      return;
    }

    if (Number.isNaN(parsedMissingYear) || parsedMissingYear < 1900 || parsedMissingYear > currentYear) {
      setError(`Please enter a valid missing year between 1900 and ${currentYear}.`);
      return;
    }

    if (gender === "female" && !modelStatus.female_available) {
      setError("Female model is not available yet. Please choose Male or install the female checkpoint.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("gender", gender);
    formData.append("age_at_missing", String(parsedAgeAtMissing));
    formData.append("missing_year", String(parsedMissingYear));
    formData.append("image", file);

    try {
      setLoading(true);
      setResult(null);

      const response = await fetch("/api/predict", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Inference failed.");
      }

      const data = (await response.json()) as PredictResponse;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(toFriendlyError(message));
    } finally {
      setLoading(false);
    }
  };

  const gifData = result ? `data:image/gif;base64,${result.progress_gif_base64}` : "";
  const progressionImageData = result ? `data:image/png;base64,${result.progression_image_base64}` : "";
  const statusLabel = loading
    ? "Generating progression..."
    : result
      ? `Generated with ${result.gender} model`
      : "Ready for a test image";

  return (
    <main className="page-shell">
      <section className="portal-card">
        <header className="portal-header">
          <div>
            <span className="eyebrow">Age Progression Studio</span>
            <h1>Missing Person Identification Portal</h1>
            <p>Upload one clear face photo and generate a direct lifespan progression from the selected model.</p>
          </div>
          <div className="status-chip">{statusLabel}</div>
        </header>

        <div className="portal-grid">
          <form className="form-panel" onSubmit={onSubmit}>
            <div className="form-intro">
              <h2>Case details</h2>
              <p>Best results come from centered, well-lit, frontal portraits.</p>
            </div>

            <div className="field-grid">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" />
              </div>

              <div className="field">
                <label htmlFor="gender">Gender</label>
                <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="male" disabled={!modelStatus.male_available}>
                    Male{!modelStatus.male_available ? " (Unavailable)" : ""}
                  </option>
                  <option value="female" disabled={!modelStatus.female_available}>
                    Female{!modelStatus.female_available ? " (Unavailable)" : ""}
                  </option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="age-at-missing">Age at missing</label>
                <input
                  id="age-at-missing"
                  type="number"
                  min={0}
                  max={120}
                  value={ageAtMissing}
                  onChange={(e) => setAgeAtMissing(e.target.value)}
                  placeholder="e.g. 14"
                />
              </div>

              <div className="field">
                <label htmlFor="missing-year">Missing year</label>
                <input
                  id="missing-year"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={missingYear}
                  onChange={(e) => setMissingYear(e.target.value)}
                  placeholder="e.g. 2016"
                />
              </div>
            </div>

            <div className="upload-card">
              <div className="field">
                <label htmlFor="image">Upload image</label>
                <input id="image" type="file" accept="image/*" onChange={onFileChange} />
              </div>
              <div className="preview-tile">
                {previewUrl ? <img src={previewUrl} alt="Input preview" /> : <p>No image selected yet.</p>}
              </div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert" aria-live="polite">
                <strong>Request could not be completed.</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="field">
              <button className="submit-btn" type="submit" disabled={loading}>
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>
          </form>

          <section className="results-panel">
            <div className="results-head">
              <div>
                <h2>Progression preview</h2>
                <p>The generated GIF stays front and center so the whole case summary fits on one screen.</p>
              </div>
            </div>

            {result ? (
              <div className="stat-strip">
                <span className="stat-pill">{result.name}</span>
                <span className="stat-pill">{result.gender} model</span>
                <span className="stat-pill">Age at missing: {result.age_at_missing}</span>
                <span className="stat-pill">Missing year: {result.missing_year}</span>
                <span className="stat-pill">Current age (est.): {result.current_age}</span>
                <span className="stat-pill">{result.model_name}</span>
                <span className="stat-pill">Image-driven progression</span>
              </div>
            ) : null}

            <article className="gif-stage">
              {gifData ? (
                <img src={gifData} alt="Aging progression" />
              ) : (
                <div className="empty-state">
                  <h3>Progression GIF will appear here</h3>
                  <p>Use one of the sample images from `testData` or upload a clean portrait to generate the full age trail.</p>
                </div>
              )}
            </article>

            {progressionImageData ? (
              <article className="gif-stage">
                <img src={progressionImageData} alt="Full progression strip" />
              </article>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
