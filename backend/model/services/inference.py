from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import os
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List

import cv2
import torch
from PIL import Image


CLASS_ORDER = ["0-2", "3-6", "7-9", "15-19", "30-39", "50-69"]
UPLOAD_SOURCE_CLASS = "30-39"
TRAVERSE_INTERP_STEP = 0.05


@dataclass
class InferenceResult:
    model_name: str
    progression_image_path: Path
    gif_path: Path
    progression_image_b64: str
    gif_b64: str


class ModelInferenceService:
    def __init__(self) -> None:
        backend_root = Path(__file__).resolve().parents[2]
        workspace_root = backend_root.parent.parent

        self.backend_root = backend_root
        self.workspace_root = workspace_root
        self.model_root = workspace_root / "Lifespan_Age_Transformation_Synthesis"
        self.portal_checkpoint_root = backend_root / "model_runtime" / "checkpoints"
        self.generated_dir = backend_root / "model" / "static" / "generated"
        self.uploads_dir = backend_root / "model" / "uploads"
        self.cache_dir = backend_root / "model" / "cache"
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _compute_image_hash(self, image_bytes: bytes) -> str:
        """Compute SHA256 hash of image bytes for caching."""
        return hashlib.sha256(image_bytes).hexdigest()

    def _get_cached_image_path(self, image_hash: str, suffix: str = "aligned") -> Path:
        """Get the cache path for a preprocessed image."""
        return self.cache_dir / f"{suffix}_{image_hash}.png"

    def _checkpoint_roots(self) -> List[Path]:
        roots = [
            self.model_root / "checkpoints",
            self.portal_checkpoint_root,
        ]

        unique_roots: List[Path] = []
        for root in roots:
            if root not in unique_roots:
                unique_roots.append(root)
        return unique_roots

    def _checkpoint_dir_for_model(self, model_name: str) -> Path | None:
        for root in self._checkpoint_roots():
            candidate = root / model_name
            if candidate.exists():
                return candidate
        return None

    def available_models(self) -> dict[str, bool]:
        return {
            "male_available": self._checkpoint_dir_for_model("males_model") is not None,
            "female_available": self._checkpoint_dir_for_model("females_model") is not None,
        }

    def _prepare_dataset(self, input_image: Path, request_id: str) -> tuple[Path, str]:
        temp_dataroot_rel = Path("datasets") / "_portal_tmp" / request_id
        temp_dataroot_abs = self.model_root / temp_dataroot_rel

        if temp_dataroot_abs.exists():
            shutil.rmtree(temp_dataroot_abs)

        for cls in CLASS_ORDER:
            (temp_dataroot_abs / f"test{cls}" / "parsings").mkdir(parents=True, exist_ok=True)

        target_img_abs = temp_dataroot_abs / f"test{UPLOAD_SOURCE_CLASS}" / input_image.name
        target_parsing_abs = temp_dataroot_abs / f"test{UPLOAD_SOURCE_CLASS}" / "parsings" / input_image.name

        img = Image.open(input_image).convert("RGB")
        img.save(target_img_abs)

        parsing = Image.new("RGB", img.size, (255, 255, 255))
        parsing.save(target_parsing_abs)

        image_path_rel = (temp_dataroot_rel / f"test{UPLOAD_SOURCE_CLASS}" / input_image.name).as_posix()
        return temp_dataroot_rel, image_path_rel

    def _candidate_asset_roots(self) -> List[Path]:
        roots = [
            self.model_root,
            self.backend_root / "model_runtime",
        ]

        unique_roots: List[Path] = []
        for root in roots:
            if root not in unique_roots:
                unique_roots.append(root)
        return unique_roots

    def _find_upstream_asset_root(self) -> Path | None:
        required_files = [
            Path("util") / "shape_predictor_68_face_landmarks.dat",
            Path("deeplab_model") / "deeplab_model.pth",
            Path("deeplab_model") / "R-101-GN-WS.pth.tar",
        ]

        for root in self._candidate_asset_roots():
            if all((root / rel_path).is_file() for rel_path in required_files):
                return root
        return None

    def _supports_in_the_wild(self) -> bool:
        return importlib.util.find_spec("dlib") is not None and self._find_upstream_asset_root() is not None

    def _gpu_ids_arg(self) -> str:
        if torch.cuda.is_available():
            return "0"
        return "-1"

    def _run_model(
        self,
        *,
        model_name: str,
        checkpoints_dir: Path,
        dataroot_rel: Path,
        image_path: str,
        request_id: str,
        mode: str,
        in_the_wild: bool = False,
    ) -> str:
        image_list_name = f"portal_input_list_{request_id}.txt"
        image_list_abs = self.model_root / image_list_name
        image_list_abs.write_text(image_path + "\n", encoding="utf-8")

        cmd = [
            sys.executable,
            "test.py",
            "--dataroot",
            dataroot_rel.as_posix(),
            "--name",
            model_name,
            "--checkpoints_dir",
            str(checkpoints_dir),
            "--which_epoch",
            "latest",
            "--display_id",
            "0",
            "--image_path_file",
            image_list_name,
            "--gpu_ids",
            self._gpu_ids_arg(),
        ]

        if mode == "traverse":
            cmd.extend(
                [
                    "--traverse",
                    "--make_video",
                    "--interp_step",
                    str(TRAVERSE_INTERP_STEP),
                ]
            )
        elif mode == "deploy":
            cmd.extend(["--deploy", "--full_progression"])
        else:
            raise ValueError(f"Unsupported inference mode: {mode}")

        if in_the_wild:
            cmd.append("--in_the_wild")

        env = os.environ.copy()
        asset_root = self._find_upstream_asset_root()
        if asset_root is not None:
            env["LATS_ASSET_ROOT"] = str(asset_root)

        completed = subprocess.run(
            cmd,
            cwd=str(self.model_root),
            check=False,
            env=env,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            stderr_tail = "\n".join(completed.stderr.splitlines()[-40:]).strip()
            stdout_tail = "\n".join(completed.stdout.splitlines()[-20:]).strip()
            detail_parts = [f"Model command failed with exit code {completed.returncode}."]
            if stderr_tail:
                detail_parts.append(f"stderr tail:\n{stderr_tail}")
            elif stdout_tail:
                detail_parts.append(f"stdout tail:\n{stdout_tail}")
            raise RuntimeError("\n".join(detail_parts))
        return image_list_name

    def _build_gif_from_video(self, video_path: Path, out_path: Path, duration_ms: int = 90) -> None:
        capture = cv2.VideoCapture(str(video_path))
        pil_frames: List[Image.Image] = []

        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_frames.append(Image.fromarray(rgb_frame))
        finally:
            capture.release()

        if not pil_frames:
            raise FileNotFoundError(f"Traversal video did not contain any frames: {video_path}")

        pil_frames[0].save(
            out_path,
            save_all=True,
            append_images=pil_frames[1:],
            duration=duration_ms,
            loop=0,
        )

    def _collect_traversal_video(self, model_name: str, stem: str) -> Path:
        traversal_dir = self.model_root / "results" / model_name / "test_latest" / "traversal"
        video_path = traversal_dir / f"{stem}.mp4"
        if not video_path.exists():
            raise FileNotFoundError(f"Missing traversal video: {video_path}")
        return video_path

    def _collect_progression_image(self, model_name: str, stem: str) -> Path:
        deploy_dir = self.model_root / "results" / model_name / "test_latest" / "deploy"
        image_path = deploy_dir / f"{stem}.png"
        if not image_path.exists():
            raise FileNotFoundError(f"Missing progression image: {image_path}")
        return image_path

    def _to_b64(self, file_path: Path) -> str:
        return base64.b64encode(file_path.read_bytes()).decode("utf-8")

    def run(
        self,
        *,
        image_bytes: bytes,
        original_filename: str,
        model_name: str,
    ) -> InferenceResult:
        request_id = uuid.uuid4().hex
        safe_name = Path(original_filename).stem.replace(" ", "_")
        
        # Compute hash for caching
        image_hash = self._compute_image_hash(image_bytes)
        cached_input_path = self._get_cached_image_path(image_hash, suffix="input")
        
        # Check if we've already processed this exact image
        if cached_input_path.exists():
            input_path = cached_input_path
        else:
            # Save new input image
            input_name = f"{safe_name}_{request_id}.png"
            input_path = self.uploads_dir / input_name
            with Image.open(io.BytesIO(image_bytes)) as img:
                img.convert("RGB").save(input_path)
            # Also cache it for future requests
            with Image.open(io.BytesIO(image_bytes)) as img:
                img.convert("RGB").save(cached_input_path)

        checkpoint_dir = self._checkpoint_dir_for_model(model_name)
        if checkpoint_dir is None:
            raise FileNotFoundError(
                f"Checkpoint folder for {model_name} is missing. "
                "Add the model checkpoint to Lifespan_Age_Transformation_Synthesis/checkpoints "
                "or missing-person-portal/backend/model_runtime/checkpoints first."
            )

        if not self.model_root.exists():
            raise FileNotFoundError(
                f"Upstream model folder is missing: {self.model_root}"
            )

        use_in_the_wild = self._supports_in_the_wild()

        dataroot_rel: Path | None = None
        generated_list_names: List[str] = []
        try:
            dataroot_rel, image_path_rel = self._prepare_dataset(input_path, request_id)

            model_dataroot = Path(".") if use_in_the_wild else dataroot_rel
            model_image_path = str(input_path.resolve()) if use_in_the_wild else image_path_rel

            generated_list_names.append(
                self._run_model(
                    model_name=model_name,
                    checkpoints_dir=checkpoint_dir.parent,
                    dataroot_rel=model_dataroot,
                    image_path=model_image_path,
                    request_id=f"{request_id}_traverse",
                    mode="traverse",
                    in_the_wild=use_in_the_wild,
                )
            )
            generated_list_names.append(
                self._run_model(
                    model_name=model_name,
                    checkpoints_dir=checkpoint_dir.parent,
                    dataroot_rel=model_dataroot,
                    image_path=model_image_path,
                    request_id=f"{request_id}_deploy",
                    mode="deploy",
                    in_the_wild=use_in_the_wild,
                )
            )

            traversal_video = self._collect_traversal_video(model_name, input_path.stem)
            progression_image = self._collect_progression_image(model_name, input_path.stem)

            gif_out = self.generated_dir / f"{input_path.stem}_progression.gif"
            progression_out = self.generated_dir / f"{input_path.stem}_progression.png"
            self._build_gif_from_video(traversal_video, gif_out)
            shutil.copyfile(progression_image, progression_out)
        finally:
            if dataroot_rel is not None:
                tmp_root = self.model_root / dataroot_rel
                if tmp_root.exists():
                    shutil.rmtree(tmp_root)
            for list_name in generated_list_names:
                list_file = self.model_root / list_name
                if list_file.exists():
                    list_file.unlink()

        return InferenceResult(
            model_name=model_name,
            progression_image_path=progression_out,
            gif_path=gif_out,
            progression_image_b64=self._to_b64(progression_out),
            gif_b64=self._to_b64(gif_out),
        )
