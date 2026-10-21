# Jest laboratoriyası

Bu bölmə üz doğrulamasından ayrı təcrübədir; giriş icazəsi vermir. MediaPipe
Hand Landmarker 0.10.21 ilə 21 əl nöqtəsi çıxarılır. Jestlər bu nöqtələrdən sadə
həndəsi qaydalarla hesablanır; xüsusi jest modeli öyrədilməyib.

## Quraşdırma

`setup.ps1` əl modelini də quraşdırır. Mövcud quraşdırmada:

```powershell
.\.venv\Scripts\python.exe scripts\download_gestures.py
```

Təxminən 27 MB fayl jsDelivr-in versiyası sabitlənmiş npm paketindən və Google-un
model anbarından endirilir. SHA-256 dəyərləri `scripts/gesture-assets.json` ilə
yoxlanılır. Bunlar ilk yükləmədən hesablanmış sabit bütövlük yoxlamalarıdır,
vendor imzası deyil. `web/gesture-assets/` Git-ə daxil edilmir. Model və WASM
quraşdırıldıqdan sonra işləmə zamanı CDN bağlantısı lazım deyil.

## İstifadə

Administrator daxil olduqdan sonra **Jest laboratoriyası** bölməsini seç.
Kameranı yalnız əlinə yönəlt; üz göstərmək lazım deyil. **Əl kamerasını aç**
düyməsi modelin yüklənməsindən sonra kamera icazəsi istəyir. Chrome/Edge istifadə et.

- Şəhadət barmağı: kursor. Baş və şəhadəti birləşdir: rəsm çək / düymə seç / döndər.
- İki barmaq: rəsm rejimində silgi. Açıq ovuc: qələmi qaldır.
- Yumruğu bir saniyə saxla: son xətti geri al (hər yumruqda bir dəfə).
- Rəsm: rəng və qalınlıq, 16 addımlıq geri alma, təmizləmə, PNG ixracı.
- Riyaziyyat: lövhə kalkulyator düymələrinə çevrilir. Barmaqla yönəlt, pinch ilə
  bir dəfə seç; növbəti seçim üçün barmaqları ayır. Mətn və klaviatura da işləyir.
  `+ - * / ^`, mötərizə və `sqrt()` dəstəklənir. `eval` işlədilmir.
- 3D: kub, piramida və kürə. Pinch edib hərəkət etdirərək döndər, slider ilə
  ölçünü dəyiş. Native Canvas perspektiv proyeksiyasıdır; Three.js tələb etmir.
- Kamera bağlı olanda lövhə siçan və toxunuşla da işləyir.

Əl yazısı/OCR, tənlik həlli, çəkilmiş rəsmdən avtomatik 3D model yaratmaq və
əməliyyat sisteminin kursorunu idarə etmək bu versiyada yoxdur.

## Məxfilik və resurslar

Kamera görüntüsü və əl nöqtələri brauzerdə ayrıca Web Worker-də emal olunur;
bu modul serverə şəkil göndərmir, bazaya və localStorage-a yazmır. PNG yalnız
istifadəçi ixrac düyməsinə basanda endirilir və kamera görüntüsünü daxil etmir.
Brauzerdə video önizləməsi göstərilir; kamera fiziki olaraq nə görürsə həmin
kadrda ola bilər. Kamera bucağını uyğunlaşdır.

Bölmədən çıxanda, çıxış edəndə, səhifə arxa plana keçəndə və ya səhifə bağlananda
kamera və worker dayandırılır. Üz kamerası ilə eyni vaxtda işlədilmir. CSP yalnız
lokal skriptlərə icazə verir və MediaPipe üçün `wasm-unsafe-eval` əlavə olunub;
JavaScript `unsafe-eval` və xarici domenlər açılmayıb.

## Yoxlama

2026-10-21 lokal yoxlaması: 48 Python testi, JavaScript məntiq testləri,
lint/format və sintaksis yoxlamaları keçdi. Brauzerdə həqiqi MediaPipe/WASM
boş sintetik kadrla işlədildi və əl tapılmadı. Siçanla xətt, PNG endirmə,
`(12+8)*3/2 = 30` və kubun sürüşdürülməsi yoxlanıldı. Canlı kamera/əl dəqiqliyi
bu yoxlamalara daxil deyil.

`npm run check` kalkulyatorun sintaksisini, kod icrasının rəddini, pinch
histerezisini və 3D həndəsəni yoxlayır. Bunlar canlı jest dəqiqliyi testi deyil.
Canlı sınaqda işıq, sol/sağ əl, əl itməsi, pinch buraxma, kamera icazəsinin rəddi,
bölmədən çıxarkən kameranın sönməsi və zəif kompüterdə gecikmə ayrıca yoxlanmalıdır.

Rəsmi mənbələr:
- https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21
- https://github.com/google-ai-edge/mediapipe (Apache-2.0; model mənbəyinin lisenziya şərtlərinə də bax)
