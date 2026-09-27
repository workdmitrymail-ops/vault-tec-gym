#!/usr/bin/env python3
"""
VAULT-TEC GYM · нарезка иконки приложения.

Берёт app_icon/app_icon 1.png и кладёт в assets/icons:
    icon-180.png            apple-touch-icon
    icon-192.png, icon-512.png
    icon-512-maskable.png   картинка 80 процентов в центре, поле 10 процентов с каждой стороны
                            заполнено размытым продолжением картинки, переход мягкий

Запуск:
    pip install pillow numpy
    python tools/prepare_icons.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SRC = Path("app_icon")
OUT = Path("assets/icons")
SIZES = (180, 192, 512)
MASKABLE = 512
SAFE = 0.8          # доля кадра под картинку в маскируемой иконке
FIELD_BLUR = 24     # размытие поля вокруг картинки
FEATHER = 6         # мягкость перехода от картинки к полю


def find() -> Path:
    for candidate in (SRC / "app_icon.png", SRC / "app_icon 1.png"):
        if candidate.exists():
            return candidate
    raise FileNotFoundError("нет файла app_icon")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(find()).convert("RGB")
    for n in SIZES:
        src.resize((n, n), Image.LANCZOS).save(OUT / f"icon-{n}.png", optimize=True)

    inner = round(MASKABLE * SAFE)
    offset = (MASKABLE - inner) // 2
    field = src.resize((MASKABLE, MASKABLE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(FIELD_BLUR))
    fade = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(fade).rectangle([FEATHER * 2, FEATHER * 2, inner - FEATHER * 2 - 1, inner - FEATHER * 2 - 1], fill=255)
    fade = fade.filter(ImageFilter.GaussianBlur(FEATHER))
    field.paste(src.resize((inner, inner), Image.LANCZOS), (offset, offset), fade)
    field.save(OUT / f"icon-{MASKABLE}-maskable.png", optimize=True)

    for f in sorted(OUT.glob("icon-*.png")):
        print(f"{f.name}: {Image.open(f).size[0]} px, {f.stat().st_size / 1024:.0f} КБ")


if __name__ == "__main__":
    main()
