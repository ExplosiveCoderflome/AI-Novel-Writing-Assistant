from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDER_DIR = REPO_ROOT / "desktop" / "builder"
PNG_SIZES = [32, 64, 128, 256, 512]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def lerp_color(left: tuple[int, int, int], right: tuple[int, int, int], progress: float) -> tuple[int, int, int]:
    return tuple(int(left[index] + (right[index] - left[index]) * progress) for index in range(3))


def scale_point(size: int, x: float, y: float) -> tuple[float, float]:
    factor = size / 96.0
    return (x * factor, y * factor)


def build_gradient_square(size: int) -> Image.Image:
    start = (26, 95, 122)
    end = (18, 32, 51)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(size):
      for x in range(size):
        progress = min(1.0, max(0.0, ((x / max(1, size - 1)) * 0.45) + ((y / max(1, size - 1)) * 0.55)))
        pixels[x, y] = (*lerp_color(start, end, progress), 255)
    return image


def create_brand_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient_square = build_gradient_square(size)
    square_mask = Image.new("L", (size, size), 0)
    square_draw = ImageDraw.Draw(square_mask)
    margin = int(size * (8 / 96))
    corner_radius = int(size * (24 / 96))
    square_draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=corner_radius,
        fill=255,
    )
    canvas.paste(gradient_square, (0, 0), square_mask)
    draw = ImageDraw.Draw(canvas)

    nib_points = [scale_point(size, x, y) for x, y in ((48, 18), (67, 37), (48, 78), (29, 37))]
    draw.polygon(nib_points, fill=(247, 243, 234, 255))

    hole_center = scale_point(size, 48, 44)
    hole_radius = size * (6 / 96)
    draw.ellipse(
        (
            hole_center[0] - hole_radius,
            hole_center[1] - hole_radius,
            hole_center[0] + hole_radius,
            hole_center[1] + hole_radius,
        ),
        fill=(19, 50, 70, 255),
    )

    draw.line(
        [scale_point(size, 38, 59), scale_point(size, 48, 67), scale_point(size, 58, 59)],
        fill=(19, 50, 70, 255),
        width=max(2, int(size * (5 / 96))),
        joint="curve",
    )

    spark_radius = size * (4.5 / 96)
    spark_center = scale_point(size, 69, 28)
    draw.ellipse(
        (
            spark_center[0] - spark_radius,
            spark_center[1] - spark_radius,
            spark_center[0] + spark_radius,
            spark_center[1] + spark_radius,
        ),
        fill=(118, 229, 255, 255),
    )
    draw.line(
        [scale_point(size, 63, 34), scale_point(size, 57, 39)],
        fill=(118, 229, 255, 255),
        width=max(2, int(size * (4 / 96))),
    )

    ember_radius = size * (3.5 / 96)
    ember_center = scale_point(size, 28, 65)
    draw.ellipse(
        (
            ember_center[0] - ember_radius,
            ember_center[1] - ember_radius,
            ember_center[0] + ember_radius,
            ember_center[1] + ember_radius,
        ),
        fill=(246, 178, 76, 255),
    )
    draw.line(
        [scale_point(size, 34, 60), scale_point(size, 39, 54)],
        fill=(246, 178, 76, 255),
        width=max(2, int(size * (4 / 96))),
    )

    return canvas


def main() -> None:
    BUILDER_DIR.mkdir(parents=True, exist_ok=True)
    generated_images: dict[int, Image.Image] = {}

    for size in PNG_SIZES:
        image = create_brand_icon(size)
        generated_images[size] = image
        image.save(BUILDER_DIR / f"app-icon-{size}.png")

    generated_images[512].save(BUILDER_DIR / "app-icon.png")
    generated_images[512].save(BUILDER_DIR / "app-icon.ico", sizes=ICO_SIZES)
    print(f"Generated desktop icon assets in {BUILDER_DIR}")


if __name__ == "__main__":
    main()
