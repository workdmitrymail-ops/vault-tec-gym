#!/usr/bin/env python3
"""
VAULT-TEC GYM · подготовка мышечной карты. Версия 2.

Важно: в масках зона подсвечена НЕ чистым красным, а светло зелёной заливкой
со свечением поверх серой фигуры. Решение пользователя, принято в ходе генерации.
Поэтому зона ищется по приросту зелёности относительно базы, а не по чистому цвету
и не по общей разнице.

Что делает:
1. Берёт базы и маски из папки muscle_map.
2. Считает зелёность каждого пикселя: G минус среднее из R и B.
3. Зона это пиксели, где зелёность в маске выше, чем в базе, на GREEN_GAIN.
4. Чистит результат: убирает мусор, заливает дыры между штрихами, сжимает край,
   чтобы убрать свечение.
5. Сохраняет зоны в assets/map/zones белой фигурой на прозрачном фоне
   и базы без фона в assets/map.

Запуск:
    pip install pillow numpy
    python tools/build_muscle_map.py
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = Path("muscle_map")
OUT = Path("assets/map")
ZONES = OUT / "zones"
CHECK = OUT / "_check"

WIDTH = 700          # ширина результата
GREEN_GAIN = 6       # насколько зелёность зоны выше зелёности базы
BG_THRESHOLD = 110   # отделение синего фона от фигуры
ERODE = 2            # сжатие края, чтобы убрать свечение, в пикселях
SILHOUETTE_TRIM = 2  # на сколько пикселей ужать силуэт перед пересечением
MIN_SHARE = 0.3      # ожидаемая площадь зоны, проценты кадра
MAX_SHARE = 12.0

MASKS = {
    "mask_front_chest":      "front_chest",
    "mask_front_front_delt": "front_delts",
    "mask_front_biceps":     "front_biceps",
    "mask_front_forearms":   "front_forearms",
    "mask_front_abs":        "front_abs",
    "mask_front_quads":      "front_quads",
    "mask_back_rear_delt":   "back_delts",
    "mask_back_traps":       "back_traps",
    "mask_back_lats":        "back_lats",
    "mask_back_triceps":     "back_triceps",
    "mask_back_lower_back":  "back_lower_back",
    "mask_back_glutes":      "back_glutes",
    "mask_back_hamstrings":  "back_hamstrings",
    "mask_back_calves":      "back_calves",
}
VIEW_OF = {n: ("front" if n.startswith("mask_front") else "back") for n in MASKS}


def find(stem: str) -> Path:
    for candidate in (SRC / f"{stem}.png", SRC / f"{stem} 1.png"):
        if candidate.exists():
            return candidate
    matches = sorted(SRC.glob(f"{stem}*.png"))
    if not matches:
        raise FileNotFoundError(f"нет файла для {stem}")
    return matches[0]


def load(stem: str, size=None) -> np.ndarray:
    img = Image.open(find(stem)).convert("RGB")
    if size and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    return np.asarray(img).astype(np.int16)


def greenness(a: np.ndarray) -> np.ndarray:
    """Насколько пиксель зеленее своего же серого уровня."""
    return a[:, :, 1] - (a[:, :, 0] + a[:, :, 2]) / 2.0


def to_image(arr: np.ndarray) -> Image.Image:
    """Pillow 12 отдаёт изображение только для чтения, поэтому копия."""
    return Image.fromarray(np.ascontiguousarray(arr.astype(np.uint8)).copy(), mode="L")


def zone_png(mask: Image.Image) -> Image.Image:
    """Зона для CSS mask-image по альфа каналу: белая фигура, прозрачный фон.
    Маска по яркости не везде работает одинаково, в Safari в том числе."""
    rgba = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    rgba.putalpha(mask)
    return rgba


def fill_holes(mask: Image.Image) -> Image.Image:
    """Заливает промежутки между штрихами внутри зоны."""
    w, h = mask.size
    canvas = Image.new("L", (w + 2, h + 2), 0)
    canvas.paste(mask, (1, 1))
    outside = canvas.copy()
    ImageDraw.floodfill(outside, (0, 0), 255, thresh=0)
    holes = np.asarray(outside) == 0
    filled = np.asarray(canvas).copy()
    filled[holes] = 255
    return Image.fromarray(filled[1:-1, 1:-1], mode="L")


def cleanup(mask: Image.Image) -> Image.Image:
    mask = mask.filter(ImageFilter.MedianFilter(5))      # убрать точечный мусор
    mask = mask.filter(ImageFilter.MaxFilter(7))         # сомкнуть штрихи
    mask = fill_holes(mask)
    for _ in range(ERODE):
        mask = mask.filter(ImageFilter.MinFilter(3))     # убрать свечение по краю
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    return mask.point(lambda v: 255 if v > 128 else 0)


def silhouette(arr: np.ndarray) -> Image.Image:
    """Белым там, где фигура, чёрным там, где синий фон."""
    blue = (arr[:, :, 2] - np.maximum(arr[:, :, 0], arr[:, :, 1])) > BG_THRESHOLD
    body = to_image(np.where(blue, 0, 255))
    body = body.filter(ImageFilter.MedianFilter(5))
    body = fill_holes(body.point(lambda v: 255 if v > 128 else 0))
    for _ in range(SILHOUETTE_TRIM):
        body = body.filter(ImageFilter.MinFilter(3))
    return body.point(lambda v: 255 if v > 128 else 0)


def strip_background(arr: np.ndarray) -> Image.Image:
    blue = (arr[:, :, 2] - np.maximum(arr[:, :, 0], arr[:, :, 1])) > BG_THRESHOLD
    rgba = Image.fromarray(arr.astype(np.uint8), mode="RGB").convert("RGBA")
    alpha = to_image(np.where(blue, 0, 255))
    alpha = alpha.filter(ImageFilter.MedianFilter(3)).point(lambda v: 255 if v > 128 else 0)
    rgba.putalpha(alpha)
    return rgba


def main() -> None:
    ZONES.mkdir(parents=True, exist_ok=True)
    CHECK.mkdir(parents=True, exist_ok=True)

    bases, sizes, bodies = {}, {}, {}
    for view in ("front", "back"):
        img = Image.open(find(f"base_{view}")).convert("RGB")
        size = (WIDTH, round(img.height * WIDTH / img.width))
        arr = np.asarray(img.resize(size, Image.LANCZOS)).astype(np.int16)
        bases[view], sizes[view] = arr, size
        bodies[view] = silhouette(arr)
        strip_background(arr).save(OUT / f"base_{view}.png")
        print(f"база {view}: {size[0]}x{size[1]}")

    print()
    bad = []
    for stem, zone in MASKS.items():
        view = VIEW_OF[stem]
        base = bases[view]
        mask = load(stem, size=sizes[view])
        gain = greenness(mask) - greenness(base)
        binary = (gain > GREEN_GAIN).astype(np.uint8) * 255
        raw_share = round(float((binary > 0).mean()) * 100, 2)
        out = cleanup(to_image(binary))
        # свечение вокруг фигуры даёт зелёный ореол на синем фоне,
        # поэтому зона обрезается по силуэту базы
        before = float((np.asarray(out) > 0).mean())
        out = Image.fromarray(
            np.minimum(np.asarray(out), np.asarray(bodies[view])).astype(np.uint8), mode="L")
        after = float((np.asarray(out) > 0).mean())
        outside = round((before - after) / before * 100, 1) if before else 0.0
        zone_png(out).save(ZONES / f"{zone}.png")

        share = round(float((np.asarray(out) > 0).mean()) * 100, 2)
        flag = "" if MIN_SHARE <= share <= MAX_SHARE else "  <-- проверить"
        if flag:
            bad.append(zone)
        print(f"зона {zone}: до очистки {raw_share}, после {share} процента кадра, "
              f"срезано за контуром {outside} процента{flag}")

        # предпросмотр: база серым, зона зелёным поверх
        prev = Image.fromarray(base.astype(np.uint8), mode="RGB").convert("RGBA")
        paint = Image.new("RGBA", prev.size, (0, 176, 60, 255))
        prev = Image.composite(paint, prev, out.point(lambda v: 160 if v > 0 else 0))
        prev.convert("RGB").save(CHECK / f"{zone}.jpg", quality=80)

    print("\nПодозрительные зоны:", ", ".join(bad) if bad else "нет")
    print("Предпросмотры лежат в", CHECK)
    print("Если зона получилась слишком большой, поднимите GREEN_GAIN или ERODE,")
    print("если слишком маленькой или рваной, опустите GREEN_GAIN.")


if __name__ == "__main__":
    main()
