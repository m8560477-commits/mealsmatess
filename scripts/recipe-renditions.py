"""Rebuild bundled recipe renditions: python3 -m pip install Pillow==13.0.0 first."""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1] / 'src/assets/recipes'
sources = [p for p in root.glob('*.webp') if not p.stem.endswith(('-thumb', '-card'))]
sources += list((root / 'dishes').glob('*.jpg'))
original = thumb = card = 0
for source in sorted(sources):
    original += source.stat().st_size
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        for label, width in [('thumb', 256), ('card', 512)]:
            resized = image.copy()
            resized.thumbnail((width, width), Image.Resampling.LANCZOS)
            target = source.with_name(f'{source.stem}-{label}.webp')
            resized.save(target, 'WEBP', quality=84, method=6)
            if label == 'thumb': thumb += target.stat().st_size
            else: card += target.stat().st_size
print(f'{len(sources)} photos: original={original} bytes, thumb={thumb} bytes, card={card} bytes')
