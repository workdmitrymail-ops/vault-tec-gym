#!/usr/bin/env python3
"""
VAULT-TEC GYM · подготовка маскота.

Что делает:
1. Берёт семь кадров из папки mascot, суффикс " 1" в именах учтён.
2. Убирает ровный тёмный фон (около #212121) и делает его прозрачным.
3. Уменьшает до SIZE по длинной стороне и кладёт в assets/mascot под именами без суффикса.

Почему не простой порог: обводка персонажа всего на 3…9 единиц яркости темнее фона,
порог съедает её вместе с фоном. Поэтому:
- ядро фона ищется строгим допуском и заливкой от края кадра;
- крупные замкнутые области фона (просвет между рукой и корпусом) тоже считаются фоном;
- в узкой полосе у края прозрачность считается как смесь цвета обводки и фона.

Запуск:
    pip install pillow numpy
    python tools/prepare_mascot.py
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = Path("mascot")
OUT = Path("assets/mascot")
SIZE = 600           # длинная сторона результата, показ максимум 200 px
BG_TOL = 3           # допуск по каналу от цвета фона для ядра фона
HOLE_SHARE = 0.0015  # замкнутая область фона крупнее этой доли кадра считается просветом
BAND = 11            # ширина полосы у края, где прозрачность считается смешиванием
SEED_STEP = 97       # шаг выборки затравок при поиске областей, мелкие области не нужны

NAMES = ["avatar", "card_main", "empty", "finish", "tile_exercises", "tile_program", "tile_stats"]


def find(stem: str) -> Path:
    for candidate in (SRC / f"{stem}.png", SRC / f"{stem} 1.png"):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"нет файла для {stem}")


def to_image(arr: np.ndarray) -> Image.Image:
    """Pillow 12 отдаёт изображение только для чтения, поэтому копия."""
    return Image.fromarray(np.ascontiguousarray(arr.astype(np.uint8)), mode="L").copy()


def bg_color(a: np.ndarray) -> np.ndarray:
    """Цвет фона по ровным угловым участкам, где фигура не касается края."""
    h, w = a.shape[:2]
    patches = [a[:16, :16], a[:16, -16:], a[-16:, :16], a[-16:, -16:], a[:16, w // 2 - 8:w // 2 + 8]]
    flat = [p.reshape(-1, 3).mean(0) for p in patches if p.reshape(-1, 3).std(0).max() < 3]
    return np.median(flat, axis=0)


def regions(binary: np.ndarray) -> list:
    """Связные области белого в binary (0/255)."""
    m = to_image(binary)
    px = m.load()
    found = []
    ys, xs = np.nonzero(binary)
    for y, x in zip(ys[::SEED_STEP], xs[::SEED_STEP]):
        if px[int(x), int(y)] != 255:
            continue
        ImageDraw.floodfill(m, (int(x), int(y)), 254)
        comp = np.asarray(m) == 254
        found.append(comp.copy())
        m.paste(0, mask=to_image(comp * 255))
    return found


def cut(path: Path) -> tuple:
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    bg = bg_color(a)
    lum, bg_lum = a.mean(axis=2), bg.mean()

    cand = (np.abs(a - bg).max(axis=2) <= BG_TOL).astype(np.uint8) * 255
    cand = np.asarray(to_image(cand).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)))
    h, w = cand.shape
    core = np.zeros(cand.shape, bool)
    for comp in regions(cand):
        touches = comp[0].any() or comp[-1].any() or comp[:, 0].any() or comp[:, -1].any()
        if touches or comp.sum() > h * w * HOLE_SHARE:
            core |= comp

    band = (np.asarray(to_image(core * 255).filter(ImageFilter.MaxFilter(BAND))) > 0) & ~core
    dark = lum[band & (lum < bg_lum - 3)]
    outline = np.percentile(dark, 20) if dark.size else 0

    alpha = np.ones_like(lum)
    alpha[core] = 0
    mix = np.clip((bg_lum - lum) / max(bg_lum - outline, 1), 0, 1)
    mix[lum > bg_lum + 6] = 1
    alpha[band] = mix[band]
    rgb = a.copy()
    rgb[band & (alpha < 1) & (lum <= bg_lum + 6)] = outline

    rgba = Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    scale = SIZE / max(rgba.size)
    rgba = rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.LANCZOS)
    return rgba, bg_lum, outline, (alpha == 0).mean() * 100


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in NAMES:
        rgba, bg_lum, outline, clear = cut(find(name))
        dest = OUT / f"{name}.png"
        rgba.save(dest, optimize=True)
        kb = dest.stat().st_size / 1024
        total += kb
        print(f"{name}.png: {rgba.width}x{rgba.height}, фон L={bg_lum:.0f}, обводка L={outline:.0f}, "
              f"прозрачно {clear:.1f}%, {kb:.0f} КБ")
    print(f"\nИтого {total:.0f} КБ")


if __name__ == "__main__":
    main()
