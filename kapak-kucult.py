# Kapak küçük kopyaları — vitrin-uret.mjs çağırır, elle de çalışır.
#
# Storage'daki kapaklar telefondan ham geldi (~4,5 MB, 4000 px). Burada her biri
# bir kez indirilip 800 px / ~60 KB kopyaya çevrilir ve kapak/<uuid>.jpg olarak
# GitHub Pages'ten servis edilir. Var olan dosya atlanır, yani yalnız yeniler iner.
#
# Girdi: stdin'den JSON URL listesi. Bağımlılık: Pillow.
import io, json, re, sys, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

HEDEF = Path(__file__).parent / 'kapak'
DESEN = re.compile(r'/kitap-kapaklari/([0-9a-f-]{36})\.(?:jpg|png|webp)$')


def main():
    HEDEF.mkdir(exist_ok=True)
    yeni = 0
    for url in json.load(sys.stdin):
        m = DESEN.search(url or '')
        if not m:
            continue
        cikti = HEDEF / f'{m[1]}.jpg'
        if cikti.exists():
            continue
        try:
            with urllib.request.urlopen(url, timeout=60) as cevap:
                im = Image.open(io.BytesIO(cevap.read()))
            im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((800, 800))
            im.save(cikti, 'JPEG', quality=75, optimize=True, progressive=True)
            yeni += 1
        except Exception as h:  # tek bozuk kapak üretimi durdurmasın; sayfa orijinale düşer
            print(f'Kapak atlandı: {url} ({h})', file=sys.stderr)
    print(f'Kapak kopyaları: {yeni} yeni.')


if __name__ == '__main__':
    main()
