#!/usr/bin/env python3
"""Write toolbar icons: cream square, ink letter a."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

INK = (26, 20, 16, 255)
CREAM = (255, 248, 232, 255)
PINK = (255, 79, 134, 255)


def png(width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", ihdr),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def draw(size: int) -> bytes:
    pixels: list[tuple[int, int, int, int]] = []
    margin = max(1, size // 16)
    radius = size * 0.22
    stroke = max(1, size // 12)
    for y in range(size):
        for x in range(size):
            if x < margin or y < margin or x >= size - margin or y >= size - margin:
                pixels.append((0, 0, 0, 0))
                continue
            lx, ly = x + 0.5, y + 0.5
            dx = min(lx - margin, size - margin - lx)
            dy = min(ly - margin, size - margin - ly)
            if dx < 0 or dy < 0:
                pixels.append((0, 0, 0, 0))
                continue
            if dx < radius and dy < radius and (dx - radius) ** 2 + (dy - radius) ** 2 > radius**2:
                pixels.append((0, 0, 0, 0))
                continue
            pixels.append(letter_pixel(size, x, y, stroke))
    return png(size, size, pixels)


def letter_pixel(size: int, x: int, y: int, stroke: int) -> tuple[int, int, int, int]:
    nx = x / size
    ny = y / size
    # bowl of a lowercase a
    cx, cy, r = 0.54, 0.56, 0.22
    dist = ((nx - cx) ** 2 + (ny - cy) ** 2) ** 0.5
    ring = abs(dist - r) * size
    stem_x = abs(nx - 0.72) * size
    stem = 0.38 < ny < 0.78 and stem_x < stroke
    ear = 0.42 < nx < 0.74 and 0.30 < ny < 0.42 and abs(ny - (0.72 - nx * 0.4)) * size < stroke
    if ring < stroke or stem or ear:
        return INK if ny > 0.28 else PINK
    return CREAM


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 48, 128):
        (out / f"icon{size}.png").write_bytes(draw(size))


if __name__ == "__main__":
    main()
