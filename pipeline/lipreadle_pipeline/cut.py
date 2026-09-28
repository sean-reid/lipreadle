"""Turns a source video into one short mouth clip.

Each source says the word a couple of times with silence around each take.
Audio energy finds the takes, face landmarks judge and frame them, ffmpeg
cuts the best one to a nose-to-chin crop with a still hold at either end.
"""

import json
import math
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .paths import MODELS

OUT_W, OUT_H = 480, 360
PRE_ROLL = 0.30
POST_ROLL = 0.40
HOLD_START = 0.25
HOLD_END = 0.45
MIN_TAKE = 0.18
MERGE_GAP = 0.30
SPEECH_DB_BELOW_PEAK = 30.0
MAX_ABS_YAW = 14.0
MAX_ABS_PITCH = 14.0
MIN_APERTURE_RANGE = 0.035
MIN_SHARPNESS = 40.0

# MediaPipe face mesh indices.
NOSE_TIP = 1
CHIN = 152
UPPER_LIP = 13
LOWER_LIP = 14
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
CHEEK_L = 234
CHEEK_R = 454
FOREHEAD = 10


@dataclass
class Take:
    start: float
    end: float
    yaw: float
    pitch: float
    aperture_range: float
    sharpness: float
    face_frames: int
    frames: int
    crop: tuple[int, int, int, int]
    score: float
    rejected: str | None


@dataclass
class CutResult:
    source: Path
    out: Path
    take: Take
    all_takes: list[Take]


def audio_energy(path: Path, hop: float = 0.02) -> tuple[np.ndarray, float]:
    """RMS per hop, at 16 kHz mono."""
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        check=True,
        capture_output=True,
    ).stdout
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    n = int(16000 * hop)
    frames = samples[: len(samples) // n * n].reshape(-1, n)
    return np.sqrt((frames**2).mean(axis=1)), hop


def find_takes(rms: np.ndarray, hop: float) -> list[tuple[float, float]]:
    peak = float(rms.max())
    if peak <= 0:
        return []
    floor = float(np.percentile(rms, 20))
    threshold = max(peak * 10 ** (-SPEECH_DB_BELOW_PEAK / 20), floor * 3)
    active = rms > threshold
    segments: list[tuple[float, float]] = []
    start = None
    for i, on in enumerate(active):
        if on and start is None:
            start = i
        elif not on and start is not None:
            segments.append((start * hop, i * hop))
            start = None
    if start is not None:
        segments.append((start * hop, len(active) * hop))
    merged: list[tuple[float, float]] = []
    for s, e in segments:
        if merged and s - merged[-1][1] < MERGE_GAP:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return [(s, e) for s, e in merged if e - s >= MIN_TAKE]


class Landmarker:
    """Video-mode landmarker. Timestamps must rise within a session, so each
    video gets a fresh detector from start()."""

    def __init__(self) -> None:
        import mediapipe as mp
        from mediapipe.tasks.python import vision

        self._mp = mp
        self._vision = vision
        self._options = vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=str(MODELS / "face_landmarker.task"),
                delegate=mp.tasks.BaseOptions.Delegate.CPU,
            ),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_facial_transformation_matrixes=True,
        )
        self._detector = None

    def start(self) -> None:
        if self._detector is not None:
            self._detector.close()
        self._detector = self._vision.FaceLandmarker.create_from_options(self._options)

    def detect(self, frame_rgb: np.ndarray, timestamp_ms: int):
        if self._detector is None:
            self.start()
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=frame_rgb)
        return self._detector.detect_for_video(image, timestamp_ms)


def pose_from_matrix(m: np.ndarray) -> tuple[float, float]:
    """Yaw and pitch in degrees from a 4x4 facial transformation matrix."""
    r = m[:3, :3]
    yaw = math.degrees(math.atan2(-r[2, 0], math.sqrt(r[0, 0] ** 2 + r[1, 0] ** 2)))
    pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
    return yaw, pitch


@dataclass
class FrameInfo:
    t: float
    pts: np.ndarray | None
    yaw: float
    pitch: float
    sharpness: float


def analyse_frames(path: Path, landmarker: Landmarker) -> tuple[list[FrameInfo], int, int, float]:
    landmarker.start()
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    infos: list[FrameInfo] = []
    index = 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        t = index / fps
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = landmarker.detect(rgb, int(t * 1000))
        if result.face_landmarks:
            lm = result.face_landmarks[0]
            pts = np.array([(p.x * width, p.y * height) for p in lm], dtype=np.float32)
            yaw, pitch = pose_from_matrix(result.facial_transformation_matrixes[0])
            sharp = mouth_sharpness(bgr, pts)
        else:
            pts, yaw, pitch, sharp = None, 0.0, 0.0, 0.0
        infos.append(FrameInfo(t, pts, yaw, pitch, sharp))
        index += 1
    cap.release()
    return infos, width, height, fps


def mouth_sharpness(bgr: np.ndarray, pts: np.ndarray) -> float:
    x0, y0, x1, y1 = mouth_box(pts, bgr.shape[1], bgr.shape[0])
    region = cv2.cvtColor(bgr[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    if region.size == 0:
        return 0.0
    return float(cv2.Laplacian(region, cv2.CV_64F).var())


def mouth_box(pts: np.ndarray, width: int, height: int) -> tuple[int, int, int, int]:
    """Nose tip to just under the chin, cheek to cheek, padded to 4:3."""
    top = pts[NOSE_TIP][1]
    bottom = pts[CHIN][1]
    left = pts[CHEEK_L][0]
    right = pts[CHEEK_R][0]
    face_h = bottom - pts[FOREHEAD][1]
    top -= 0.06 * face_h
    bottom += 0.06 * face_h
    cx = (left + right) / 2
    cy = (top + bottom) / 2
    h = bottom - top
    w = max(right - left, h * 4 / 3)
    h = max(h, w * 3 / 4)
    w = h * 4 / 3
    x0 = int(round(cx - w / 2))
    y0 = int(round(cy - h / 2))
    x1 = int(round(cx + w / 2))
    y1 = int(round(cy + h / 2))
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(width, x1), min(height, y1)
    return x0, y0, x1, y1


def aperture(pts: np.ndarray) -> float:
    eye_span = np.linalg.norm(pts[RIGHT_EYE_OUTER] - pts[LEFT_EYE_OUTER])
    return float(np.linalg.norm(pts[LOWER_LIP] - pts[UPPER_LIP]) / max(eye_span, 1e-6))


def judge_take(
    start: float,
    end: float,
    infos: list[FrameInfo],
    width: int,
    height: int,
    banner_top: float,
    duration: float,
) -> Take:
    ws = max(0.0, start - PRE_ROLL)
    we = min(duration, end + POST_ROLL)
    window = [f for f in infos if ws <= f.t <= we]
    faces = [f for f in window if f.pts is not None]
    rejected = None
    if not window or len(faces) < len(window):
        rejected = "face lost"
    yaw = float(np.mean([abs(f.yaw) for f in faces])) if faces else 90.0
    pitch = float(np.mean([abs(f.pitch) for f in faces])) if faces else 90.0
    apertures = [aperture(f.pts) for f in faces if f.pts is not None]
    ap_range = float(max(apertures) - min(apertures)) if apertures else 0.0
    sharp = float(np.median([f.sharpness for f in faces])) if faces else 0.0
    if faces:
        boxes = np.array([mouth_box(f.pts, width, height) for f in faces if f.pts is not None])
        crop = tuple(int(v) for v in np.median(boxes, axis=0))
    else:
        crop = (0, 0, width, height)
    if rejected is None and yaw > MAX_ABS_YAW:
        rejected = f"yaw {yaw:.0f}"
    if rejected is None and pitch > MAX_ABS_PITCH:
        rejected = f"pitch {pitch:.0f}"
    if rejected is None and ap_range < MIN_APERTURE_RANGE:
        rejected = f"mouth barely moves ({ap_range:.3f})"
    if rejected is None and sharp < MIN_SHARPNESS:
        rejected = f"soft ({sharp:.0f})"
    if rejected is None and crop[3] > banner_top * height:
        rejected = "crop reaches banner"
    score = (
        -yaw / MAX_ABS_YAW
        - pitch / MAX_ABS_PITCH
        + min(ap_range, 0.15) / 0.15
        + min(sharp, 400) / 400
    )
    return Take(ws, we, yaw, pitch, ap_range, sharp, len(faces), len(window), crop, score, rejected)


def encode(src: Path, out: Path, take: Take) -> None:
    x0, y0, x1, y1 = take.crop
    w, h = x1 - x0, y1 - y0
    vf = (
        f"crop={w}:{h}:{x0}:{y0},scale={OUT_W}:{OUT_H}:flags=lanczos,"
        f"tpad=start_duration={HOLD_START}:stop_duration={HOLD_END}"
        f":start_mode=clone:stop_mode=clone,format=yuv420p"
    )
    delay = int(HOLD_START * 1000)
    af = f"adelay={delay}|{delay},apad=pad_dur={HOLD_END}"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-ss", f"{take.start:.3f}", "-to", f"{take.end:.3f}", "-i", str(src),
            "-vf", vf, "-af", af,
            "-c:v", "libx264", "-profile:v", "main", "-preset", "slow", "-crf", "22",
            "-c:a", "aac", "-b:a", "48k", "-ac", "1",
            "-movflags", "+faststart", str(out),
        ],
        check=True,
    )  # fmt: skip


def cut(src: Path, out: Path, landmarker: Landmarker, banner_top: float) -> CutResult | None:
    rms, hop = audio_energy(src)
    segments = find_takes(rms, hop)
    if not segments:
        return None
    infos, width, height, fps = analyse_frames(src, landmarker)
    duration = len(infos) / fps
    takes = [judge_take(s, e, infos, width, height, banner_top, duration) for s, e in segments]
    usable = [t for t in takes if t.rejected is None]
    if not usable:
        return None
    best = max(usable, key=lambda t: t.score)
    encode(src, out, best)
    out.with_suffix(".json").write_text(
        json.dumps({"source": src.name, "take": asdict(best), "takes": [asdict(t) for t in takes]})
    )
    return CutResult(src, out, best, takes)
