# Telefonun paylaşılan rəsm lövhəsi

Telefondan canlı kamera baxışı ləğv edilib. Bu xidmət yalnız ayrıca lövhədə yazı/rəsm koordinatlarını ötürür. Kamera, mikrofon, kompüter ekranı, klaviatura, siçan və shell əmrləri yoxdur.

1. Layihə qovluğunda `start-control.cmd` işə sal.
2. Kompüterdə `http://127.0.0.1:8011/` aç və mövcud FaceGate administrator açarı ilə daxil ol.
3. **2 dəqiqəlik kod yarat** bas.
4. Telefonunda Tailscale qoşulu halda özəl HTTPS ünvanını aç, kodu daxil et.
5. Kompüterdə **Telefona yazı icazəsi ver** bas.
6. Telefonda barmağınla lövhəyə yaz və çək. Xətlər həm 8011 panelində, həm FaceGate-in **Telefon lövhəsi** bölməsində görünür.

Uzaq bağlantı üçün yalnız 8010 telefon xidmətini özəl Tailscale Serve ilə paylaşmaq olar. 8011 administrator portunu və əsas FaceGate portunu paylaşma. Əvvəl saxlanmış `data/control-origin.txt` ünvanı launcher tərəfindən oxunur; özəl ünvan repoya daxil edilmir.

Lövhə RAM-da saxlanır: ən çox 128 xətt, hər xəttdə ən çox 1024 nöqtə. Köhnə hadisə jurnalı məhduddur. Yeni qoşalaşdırma, sessiyanın ləğvi, müddətinin bitməsi və server restartı lövhəni sıfırlayır. Telefon səhifəsini yeniləmək yenidən qoşulma tələb edir. Bu, əl yazısını mətnə çevirən OCR deyil; xətlər eyni formada göstərilir.

Kod 120 saniyə və bir istifadə üçün etibarlıdır; ən çox 5 səhv cəhd qəbul edilir. Bir telefon sessiyası 30 dəqiqə, boş qalma müddəti 30 saniyədir. Telefon açarı səhifə yaddaşındadır. Müvəqqəti bağlantı xətasında eyni paketin təkrarı xətti iki dəfə əlavə etmir. Əlaqə uzunca kəsilərsə ekrandakı sinxronizasiya mesajını yoxla.

Yoxlama: `python -m pytest -q` və `npm run check`. Real telefon, brauzer və şəbəkədə ayrıca sınaq tələb olunur.
