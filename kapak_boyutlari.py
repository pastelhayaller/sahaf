"""Existing JPEG covers -> responsive WebP copies; preserves original photographs."""
from pathlib import Path
from PIL import Image

def uret():
    count = 0
    for source in sorted((Path(__file__).parent / 'kapak').glob('*.jpg')):
        with Image.open(source) as image:
            for width in (160, 320, 480):
                target = source.with_name(f'{source.stem}-{width}.webp')
                if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
                    continue
                if image.width < width:
                    continue
                size = (width, round(image.height * width / image.width))
                image.resize(size, Image.Resampling.LANCZOS).save(target, 'WEBP', quality=75, method=6)
                count += 1
    print(f'Responsive kapak: {count} dosya uretildi.')

if __name__ == '__main__':
    uret()
