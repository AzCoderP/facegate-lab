# Lokal başlatma və Cloudflare

## Bu kompüterdə açmaq

Layihə qovluğu:

```text
C:\Users\cavid\Documents\Codex\2026-10-19\az-rbaycan-texniki-universitetind-aztu-yeni\outputs\facegate-lab
```

Qovluqdakı `start.cmd` faylına iki dəfə kliklə. Terminaldakı administrator
açarını lokal səhifədə daxil et. Terminalı açıq saxla.

CMD ilə eyni əməliyyat:

```cmd
cd /d "C:\Users\cavid\Documents\Codex\2026-10-19\az-rbaycan-texniki-universitetind-aztu-yeni\outputs\facegate-lab"
start.cmd
```

Sonra brauzerdə http://127.0.0.1:8000/ aç. Server artıq işləyirsə ikinci nüsxəni
başlatma. `address already in use` / WinError 10048 portun tutulduğunu göstərir.
Serveri öz terminalında Ctrl+C ilə dayandır.

Yalnız açarı yenidən göstərmək üçün layihə qovluğunda:

```cmd
.venv\Scripts\python.exe scripts\admin_key.py
```

Açarı paylaşma və GitHub-a əlavə etmə.

## GitHub-dan yeni kompüterə quraşdırma

Python 3.12 və ya 3.13 quraşdır. Private repo kodunu endir, terminalı layihə
qovluğunda aç. PowerShell-də:

```powershell
.\setup.ps1
.\start.cmd
```

İlkin quraşdırma paketləri, üz modellərini və əl modeli/WASM fayllarını internetdən
endirir. Hər kompüterin `.venv` mühiti yenidən qurulur. Mövcud quraşdırmada yalnız
əl faylları çatışmırsa:

```cmd
.venv\Scripts\python.exe scripts\download_gestures.py
```

Jest və əşya analizi üçün repodakı yeni mənbə faylları ilə yanaşı müvafiq lokal
model faylları da lazımdır. `setup.ps1` bunları endirir; model çəkiləri GitHub-da saxlanmır.

## Cloudflare-də sayt

- Hesab/panel: https://dash.cloudflare.com/
- Pages Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Python Workers / FastAPI: https://developers.cloudflare.com/workers/languages/python/packages/fastapi/
- Tunnel haqqında: https://developers.cloudflare.com/tunnel/get-started/

Cloudflare Pages-in statik yerləşdirməsinə bu layihə qovluğunu bütöv yükləməklə
hazır FaceGate backend-i işə düşmür. Tətbiq lokal FastAPI, OpenCV, SQLite, açar
faylları və localhost host/origin qaydalarına əsaslanır. Cloudflare Python Workers
FastAPI-ni dəstəkləyir, amma mövcud tətbiqin model, kitabxana, saxlama və giriş
qaydaları Workers mühitinə ayrıca uyğunlaşdırılmalıdır.

Təqdimat üçün daha kiçik variant: Jest laboratoriyasının müstəqil statik demosunu
hazırlayıb Pages-də yerləşdirmək. Mövcud modulda `/static/` yolları və administrator
panelinə bağlılıq var; əvvəl bunlar ayrıca demo üçün düzəldilməlidir. Bu demo
üz bazası və giriş nəzarəti backend-i olmadan işləyə bilər.

Cloudflare Tunnel kompüterdə işləyən xidməti linklə əlçatan edir; onu daimi
hostinqə çevirmir. Hazır FaceGate naməlum Host/origin dəyərlərini rədd etdiyinə
görə tunel onun üçün hazır yerləşdirmə üsulu deyil. Şəbəkəyə açılacaq versiya üçün
HTTPS sessiya parametrləri, etibarlı host/origin siyasəti və giriş qorunması
ayrıca hazırlanmalıdır. Heç bir tunel bu sənədin hazırlanması zamanı açılmayıb.

Hazırda bu layihənin Cloudflare-də yayımlanmış ünvanı yoxdur.
