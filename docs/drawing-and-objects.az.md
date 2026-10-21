# Sabit rəsm və real əşya analizi

## İki fərqli məsələ

Barmağı dəqiq izləmək və çəkilmiş xətti ideal həndəsəyə çevirmək ayrı işlərdir.
Əl nöqtələri MediaPipe neyron modelindən gəlir. Sonra koordinatlara sürətə uyğun
low-pass filtri və kiçik titrəmə zonası tətbiq olunur. Böyük sıçrayış əvvəlcə
rədd edilir; davamlı yeni mövqe alınarsa kursor yeni yerdən başlayır və iki yer
arasında uzun xətt çəkilmir. Pinch 90 ms saxlandıqdan sonra çəkmə başlayır.

Xətt buraxılanda vahid məsafələrlə nümunələnir və kodla təhlil olunur:

- Düz xətt: kovariasiya/PCA istiqaməti, xəttdən orta kvadratik məsafə və yolun
  düz olması. Nəticə bucaqdan asılı deyil.
- Dairə: ən kiçik kvadratlar ilə mərkəz, radius sapması, bağlanma və bucaq örtüyü.
- Düzbucaqlı: istiqamət axtarışı, sərhəddən məsafə, dörd tərəfin örtülməsi və
  perimetr uyğunluğu. Dönmüş düzbucaqlılar da yoxlanılır.

Zəif uyğunluqda orijinal sərbəst xətt saxlanılır. Göstərilən faiz uyğunlaşdırma
xətasıdır, obyektin düzgün tanınması ehtimalı deyil. **Sərbəst rəsm** seçimi
avtomatik düzəltməni söndürür. **Güclü** sabitləşdirmə titrəməni azalda bilər,
amma hərəkətdə əlavə gecikmə yaradır. Kamera, işıq və əl bucağı yenə əhəmiyyətlidir.

Bu, yalnız 2D lövhə həndəsəsidir. Fiziki uzunluq/sahə, kameraya məsafə və dəqiq
3D trayektoriya ölçülmür. Bunun üçün ayrıca kalibrasiya və uyğun dərinlik
məlumatı tələb oluna bilər. 3D fiqur rejimi əvvəlki kimi perspektiv vizuallaşdırmadır.

## Real əşya analizi

**Jest laboratoriyası → İş rejimi → Real əşya analizi** seç. Bu rejimdə jestlər
işləmir; eyni kamera obyektlər üçün istifadə olunur.

### Neyron şəbəkə

TensorFlow.js 4.22.0 və COCO-SSD 2.2.3 (lite MobileNet V2) lokal Web Worker-də CPU
üzərində işləyir. Nəticə obyekt adı, çərçivə və model balıdır. Minimum bal 0.60,
maksimum 6 nəticədir. CPU zəifdirsə emal gec ola bilər; yalnız bir kadr eyni anda
emal olunur. İnterfeys ayrıca axında qalır.

Modelin COCO sinifləri arasında kitab, telefon, fincan və başqa əşyalar var.
**Qələm və dəftər ayrıca sinif deyil.** Kitab nəticəsi dəftərlə qarışa bilər.
Bu əşyaları ayrıca etibarlı ayırmaq üçün uyğun etiketlənmiş verilənlər, ayrıca
öyrədilmiş model və müstəqil test dəsti lazımdır. "Nəticə yoxdur" görünməsi həmin
əşyaların yoxluğunu sübut etmir. Model balı kalibrasiya edilmiş zəmanət deyil.

Mövcud quraşdırmada:

```cmd
.venv\Scripts\python.exe scripts\download_objects.py
```

Təxminən 20 MB kitabxana və çəki faylı `web/object-assets/` altına yüklənir.
URL-lər və sabit SHA-256 dəyərləri `scripts/object-assets.json` faylındadır.
Fayllar rəsmi npm paketlərinin jsDelivr paylamasından və Google model anbarından
alınır; ilk yükləmədə hesablanmış hash bütövlük yoxlamasıdır, vendor imzası deyil.
İşləyərkən xarici model xidmətinə müraciət edilmir. Bu fayllar Git-ə daxil deyil.

### Modelsiz analiz

**Modelsiz — fon fərqi və forma** seç, kameranı aç, əşyasız fon qarşısında
**Boş fonu yadda saxla** düyməsini bas. Sonra əşyanı fonun qarşısına gətir.
Fonla RGB fərqi, bağlı piksel komponentləri, kovariasiya və doluluq əmsalı ilə
uzunsov, düzbucaqlıya bənzər, yumruya bənzər və qeyri-müntəzəm siluetlər ayrılır.

Bu üsul neyron şəbəkədən istifadə etmir, amma **əşyanın semantik adını müəyyən
etmir**. Uzunsov siluet qələm, barmaq və ya başqa bir şey ola bilər. Kölgə, fon
naxışı, kamera tərpənməsi və işıq dəyişməsi nəticəni poza bilər. Ayrı etiketlər
uydurulmur. Fonu yenidən çəkməklə kalibrasiyanı yenilə.

## Məxfilik və yoxlama

Əl/obyekt rejimləri və üz terminalı eyni kameranı paralel işlətmir. Kadrlar və
modelsiz rejimin fon nümunəsi yalnız brauzer/worker yaddaşındadır; çıxanda silinir,
serverə göndərilmir və bazaya yazılmır. Obyekt rejimində PNG ixracı gizlədilib.
Model COCO-nun "person" sinfini də qaytara bilər, amma şəxsiyyət tanımır.

2026-10-21: 10 JavaScript məntiq testi keçdi: titrək xətt, dairə/yarımdairə,
dönmüş düzbucaqlı, qaralama, filtr sıçrayışı, sintetik siluet və əvvəlki
jest/kalkulyator/həndəsə yoxlamaları. Brauzerdə COCO-SSD boş sintetik kadrla işə
düşdü və obyekt qaytarmadı. Xəttin düzəldilməsi və undo interfeysdə yoxlanıldı.
Real əl/kitab/qələm/dəftər dəqiqliyi bu testlərlə ölçülməyib.

Mənbələr:
- https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd
- https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts
- https://github.com/tensorflow/tfjs (Apache-2.0; model paylamasının şərtlərini də nəzərdən keçir)
