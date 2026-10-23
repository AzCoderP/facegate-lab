# Canlı insan və obyekt izləmə → Telegram

Menyudan **Obyekt keçidi / Telegram** və ya **Canlı müşahidə → İnsan sayı və vaxtını Telegram-a bildir** seç.

## Quraşdırma

1. Telegram-da @BotFather üçün `/newbot` göndər, sonra yaratdığın botda `/start` yaz.
2. Bot tokenini yalnız lokal Telegram ayarlarına daxil et və saxla. Tokeni GitHub-a və ya söhbətlərə göndərmə.
3. **Chat ID-ləri tap** seç, öz söhbətini seç, bildirişləri aktivləşdir və saxla.
4. Test mesajı ilə əlaqəni yoxla. Test mesajı şəkilsizdir.
5. `pip install -r requirements-yolo.txt` ilə YOLO asılılığını qur; `models/yolo11n.pt` çəkiləri lokal olmalıdır. Modelin lisenziyasını ayrıca nəzərə al.

## İş rejimləri

- **İnsan sayı və görünmə vaxtı:** YOLO insan aşkarlaması; iki ardıcıl analizlə təsdiq, müvəqqəti həndəsi izləmə nömrəsi, say və Bakı vaxtı ilə ilk/son görünmə.
- Yeni insan üçün ilk bildiriş dərhal yaranır. Fasiləsiz izləmə zamanı hər insan üçün növbəti şəkil ən tez **60 saniyə** sonra göndərilir. Digər yeni insanın bildirişi ayrıca yaranır.
- İnsan 3 saniyə görünməyəndə çıxış mesajı şəkilsiz göndərilir. Bu, fiziki qapı giriş/çıxış təsdiqi deyil.
- **Obyektin xətti keçməsi:** kamerada iki nöqtə seç; təsdiqlənmiş sonlu xətt keçidi mesaj yaradır. Eyni izləmə üçün 5 saniyə fasilə var.
- **Kamera şəklini Telegram-a göndər:** aktivdirsə hadisə anının tam kadrı göndərilir. Video göndərilmir. Bu seçim söndürüləndə yalnız mətn göndərilir.

## Saxlama və məhdudiyyətlər

Token və Chat ID mövcud lokal vault vasitəsilə `data/telegram.enc` faylında şifrələnir. Şəkillər diskə yazılmır; ən çox 20 göndəriş növbədə RAM-da qalır. Son 200 hadisə metadatası RAM-da saxlanır. Telegram-a göndərilən şəkillər həmin söhbətdə qalır; tətbiq onları avtomatik silmir.

İzləmə üz tanıma və ya şəxsiyyət müqayisəsi etmir. Örtülmə, sürətli hərəkət və 3 saniyədən uzun itmə yeni nömrə və əlavə ilkin bildiriş yarada bilər. Sessiya/server yenidən başlayanda nömrələr və fasilələr sıfırlanır. Səhifə bağlananda və ya gizlənəndə kamera dayanır; bu, fon xidməti deyil.

Göndəriş asinxrondur. Hadisə `queued`, `sent`, `failed`, `queue_full`, `cancelled`, `disabled` və ya `not_configured` vəziyyətini göstərir. Şəbəkə xətası avtomatik təkrarlanmır; vaxt aşımı zamanı Telegram mesajı qəbul etmiş də ola bilər. Növbə server restartında qorunmur.

## Yoxlama

- Test mesajı, token və Chat ID saxlanması.
- Bir insan: ilk şəkil; 60 saniyədən əvvəl təkrar şəkil yoxdur; sonra yeni şəkil.
- İkinci insan: ayrıca ilkin şəkil və yenilənmiş say.
- 3 saniyə itmə: şəkilsiz çıxış, düzgün son görünmə vaxtı.
- Şəkil seçimi bağlı: yalnız mətn; xətt rejimi də işləyir.
- `python -m pytest -q`, `npm run check`.

Avtomatik testlər Telegram transportunu imitasiya edir; real bot və kamerada ayrıca yoxlama apar.
