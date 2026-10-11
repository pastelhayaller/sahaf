# Kapak küçük kopyaları — vitrin-uret.mjs çağırır, elle de çalışır.
#
# Storage'daki kapaklar telefondan ham geldi (~4,5 MB, 4000 px). Burada 800 px
# JPEG detay kopyası ve 480 px WebP liste kopyası olarak GitHub Pages'ten servis edilir.
#
# Girdi: stdin'den JSON URL listesi. Bağımlılık: Pillow.
import io, json, re, sys, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

HEDEF = Path(__file__).parent / 'kapak'
DESEN = re.compile(r'/kitap-kapaklari/([0-9a-f-]{36})\.(?:jpg|png|webp)$')


def main():
    HEDEF.mkdir(exist_ok=True)
    jpg_yeni = 0
    webp_yeni = 0
    for url in json.load(sys.stdin):
        m = DESEN.search(url or '')
        if not m:
            continue
        cikti = HEDEF / f'{m[1]}.jpg'
        webp = HEDEF / f'{m[1]}.webp'
        try:
            if not cikti.exists():
                with urllib.request.urlopen(url, timeout=60) as cevap:
                    im = Image.open(io.BytesIO(cevap.read()))
                im = ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail((800, 800))
                im.save(cikti, 'JPEG', quality=75, optimize=True, progressive=True)
                jpg_yeni += 1
            if not webp.exists() or webp.stat().st_mtime < cikti.stat().st_mtime:
                with Image.open(cikti) as im:
                    im = ImageOps.exif_transpose(im).convert('RGB')
                    im.thumbnail((480, 480))
                    im.save(webp, 'WEBP', quality=78, method=6)
                webp_yeni += 1
        except Exception as h:  # tek bozuk kapak üretimi durdurmasın; sayfa orijinale düşer
            print(f'Kapak atlandı: {url} ({h})', file=sys.stderr)
    print(f'Kapak kopyaları: {jpg_yeni} yeni JPEG, {webp_yeni} yeni/güncel WebP.')


if __name__ == '__main__':
    main()
