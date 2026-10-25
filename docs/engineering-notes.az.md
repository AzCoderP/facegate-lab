# Texniki işin izahı: FaceGate Lab

## Nə hazırladım

Mövcud FastAPI/OpenCV tətbiqini genişləndirdim; idarə panelini yenidən qurmadım. Yerli giriş-yoxlama təcrübələrini, anonim müşahidəni, jest qarşılıqlı əlaqəsini və hadisə bildirişlərini ayrıca sessiya və məlumat sərhədləri olan modullara ayırdım.

Canlı müşahidədə kadrlar arasında müvəqqəti nömrələri qorumaq və ilk/son görünmə vaxtını qeyd etmək üçün həndəsi/hərəkət əsaslı izləmədən istifadə etdim. Obyekt hadisələri üçün seçimli YOLO detektoru və sonlu xətt keçidi qaydalarını inteqrasiya etdim. Telegram göndərişləri məhdud asinxron növbədə işləyir, beləliklə xarici xidmət model analizini bloklamır. Fasiləsiz izləmədə eyni insanın təkrar şəkli ən tez bir dəqiqədən sonra göndərilir; çıxış mesajı şəkilsizdir. Bot ayarları mövcud lokal vault ilə şifrələnir.

Jest modulunda MediaPipe əl nöqtələri, jest sabitləşdirməsi, rəsm və AR örtükləri üzərində işlədim. Telefon lövhəsi normallaşdırılmış xətt koordinatlarını həcmcə məhdud, yalnız sessiya yaddaşında olan lövhəyə ötürür. Qoşalaşdırma, kompüterdə təsdiq, sıra nömrəsi və lövhə versiyası icazəsiz yazını, təkrar paketləri və köhnə yeniləmələri məhdudlaşdırır. Telefon əməliyyat sisteminin idarəsini almır.

## Telefon kamera təcrübəsi və verilən qərar

Tailscale HTTPS, ayrıca telefon/kompüter xidmətləri, birdəfəlik kod və kompüterdə təsdiq ilə telefondan kamera baxışını prototipləşdirdim. İlkin JPEG sorğuları istifadədə gecikmə göstərdi. Sonra davamlı multipart JPEG axını, yalnız son kadrın saxlanması, ölçüsü məhdud parser, yenidən qoşulma və köhnə kadrın gizlədilməsini hazırladım. Lokal süni görüntü testləri ardıcıl kadr ötürülməsini və icazə ləğv ediləndə axının bağlanmasını yoxladı; bunlar mobil şəbəkə performans ölçməsi deyildi.

Daha sonra telefondan canlı kamera baxışını cari əhatədən çıxardım. Bu təcrübə aktiv funksiya kimi deyil, görülmüş texniki işin tarixçəsi kimi sənədləşdirilir. Yerli kamera analizi, Telegram hadisə bildirişləri və ayrıca icazəli telefon lövhəsi müstəqil modullar kimi qalır.

## Hələ ölçülməli məqamlar

- Etiketlənmiş, uyğun test dəstində aşkarlamanın precision/recall nəticələri.
- Örtülmə və yolların kəsişməsi zamanı izləmə nömrələrinin parçalanması və təkrar hadisə faizi.
- Xarici göndərişin qeyri-müəyyən nəticələri də daxil olmaqla hadisənin ümumi gecikməsi.
- Uzunmüddətli CPU/yaddaş istifadəsi və zəif cihazlarda davranış.
- Müxtəlif şəbəkə və brauzerlərdə real telefon lövhəsi sessiyaları.
- Autentifikasiya, bərpa və yerləşdirmə ayarlarının müstəqil yoxlanması.

Layihə inteqrasiya və mərhələli təkmilləşdirmə işini göstərir. Yeni tanıma alqoritmi, dünyada ilk olma, tam hücumdan qorunma və ya istehsal sertifikasiyası iddiası yoxdur.
