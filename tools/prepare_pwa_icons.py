#!/usr/bin/env python3
"""
VAULT-TEC GYM · недостающие иконки для манифеста.

Источник: готовые иконки в assets/icons, рисунок не меняется.
Существующие файлы не перезаписываются, скрипт только достраивает отсутствующие:
    icon-180.png, icon-192.png, icon-512.png   из icon-512.png
    icon-512-maskable.png                      картинка 80 процентов в центре, поле из размытого продолжения,
                                               тем же способом, что в prepare_icons.py
    icon-192-maskable.png                      уменьшенная icon-512-maskable.png, те же поля

Маскируемая иконка: система обрезает её по своей форме, гарантированно видна середина
диаметром 80 процентов кадра. Поэтому картинка занимает 80 процентов, а поле вокруг
закрывает обрезку без пустых углов.

Запуск из корня проекта:
    python tools/prepare_pwa_icons.py
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ICONS = Path("assets/icons")
SOURCE = ICONS / "icon-512.png"
SIZES = (180, 192, 512)
MASKABLE = (512, 192)   # сначала 512: 192 получается из неё
SAFE = 0.8              # доля кадра под картинку в маскируемой иконке
FIELD_BLUR = 24         # размытие поля, как в prepare_icons.py
FEATHER = 6             # мягкость перехода от картинки к полю


def maskable_from(src: Image.Image, size: int) -> Image.Image:
    inner = round(size * SAFE)
    offset = (size - inner) // 2
    field = src.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(FIELD_BLUR))
    fade = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(fade).rectangle([FEATHER * 2, FEATHER * 2, inner - FEATHER * 2 - 1, inner - FEATHER * 2 - 1], fill=255)
    fade = fade.filter(ImageFilter.GaussianBlur(FEATHER))
    field.paste(src.resize((inner, inner), Image.LANCZOS), (offset, offset), fade)
    return field


def main() -> None:
    # Консоль Windows по умолчанию не в UTF-8, отчёт на русском иначе не печатается
    sys.stdout.reconfigure(encoding="utf-8")
    if not SOURCE.exists():
        raise FileNotFoundError(f"нет исходной иконки {SOURCE}")
    src = Image.open(SOURCE).convert("RGB")
    made = []

    for n in SIZES:
        out = ICONS / f"icon-{n}.png"
        if not out.exists():
            src.resize((n, n), Image.LANCZOS).save(out, optimize=True)
            made.append(out.name)

    for n in MASKABLE:
        out = ICONS / f"icon-{n}-maskable.png"
        if out.exists():
            continue
        big = ICONS / "icon-512-maskable.png"
        if n != 512 and big.exists():
            Image.open(big).convert("RGB").resize((n, n), Image.LANCZOS).save(out, optimize=True)
        else:
            maskable_from(src, n).save(out, optimize=True)
        made.append(out.name)

    print("Созданы:", ", ".join(made) if made else "ничего, все файлы уже есть")
    for f in sorted(ICONS.glob("icon-*.png")):
        im = Image.open(f)
        print(f"{f.name}: {im.size[0]}×{im.size[1]}, {im.mode}, {f.stat().st_size / 1024:.0f} КБ")


if __name__ == "__main__":
    main()
