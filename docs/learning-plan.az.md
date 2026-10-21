# Layihə ilə öyrənmə planı

Hər məşğələ: 20 dəqiqə nəzəriyyə → 40 dəqiqə dəyişiklik → 15 dəqiqə sınaq və qeyd. Vaxtı öz sürətinə uyğunlaşdır.

| Məşğələ | Oxu | Et | Öz sözlərinlə cavablandır |
|---|---|---|---|
| 1 | Python funksiyası, dict, exception | `rules.py` və testlərini oxu | Üz tanınsa niyə giriş verilməyə bilər? |
| 2 | HTTP GET/POST/PATCH/DELETE, status kodları | Brauzerin Network bölməsində sorğunu izlə | 422, 409 və 503 nə ilə fərqlənir? |
| 3 | SQLite, primary key, transaction | Hadisənin necə yazıldığını izlə | Baza yazılmayanda niyə uğur göstərmirik? |
| 4 | Detection, alignment, embedding | `vision.py` ardıcıllığını izah et | Detection ilə recognition fərqi nədir? |
| 5 | Cosine similarity və threshold | Ayrı test nümunələri ilə hədləri müqayisə et | Həddi artıranda hansı səhvlər dəyişir? |
| 6 | Şəbəkə və tətbiq nasazlığı | Serveri dayandır, diaqnostikanı işə sal | TCP portunun açıq olması nəyi sübut etmir? |
| 7 | İcazə, saat qurşağı, gecə cədvəli | `22:00–06:00` sərhədlərini yoxla | Server vaxtı və lokal vaxt niyə fərqlənə bilər? |
| 8 | İdempotency | Təkrar sorğu testini oxu | Retry nə vaxt iki hadisə yarada bilər? |
| 9 | Biometrik məlumatların qorunması | `.gitignore` və silinmə axınını izlə | Embedding niyə məxfi məlumatdır? |
| 10 | Sənədləşdirmə | 3 dəqiqəlik demo və 3 nasazlıq hesabatı hazırla | Layihənin hansı məhdudiyyətləri var? |

## Ölçmə eksperimenti

Qeydiyyat çəkilişləri ilə test çəkilişlərini ayır. Threshold seçdiyin nümunələri son yoxlama üçün yenidən istifadə etmə.

- Hər şəraitdə ayrıca cəhd sayı yaz: normal işıq, zəif işıq, eynək, fərqli məsafə və üz bucağı.
- Kamera sabit qalsın; bir dəfə yalnız bir amili dəyiş.
- Eyni şəxs cəhdlərinin neçəsinin yanlış rədd edildiyini qeyd et.
- Fərqli şəxs cəhdləri yalnız razılıqla aparılsın. Yalnız öz üzünlə yanlış uyğunluq göstəricisini ölçmək mümkün deyil.
- “No face” və keyfiyyət rədlərini ayrıca göstər; onları itirib yalnız uğurlu nümunələri hesablama.
- Giriş qaydasının rəddini biometrik yanlış rədd kimi hesablama.
- Emal vaxtı serverdə ölçülür; kamera çəkilişi və şəbəkə müddəti daxil deyil.
- Kiçik laboratoriya nəticəsini universitet miqyasında təhlükəsizlik və ya dəqiqlik sübutu kimi təqdim etmə.

Hesabat cədvəli: şərait | threshold | həqiqi şəxs cəhdi | yanlış rədd | fərqli şəxs cəhdi | yanlış uyğunluq | görüntü rəddi | orta müddət.

## Növbəti GitHub issues

1. **Terminal heartbeat:** son əlaqə vaxtı və gecikmə göstəricisi; offline səbəbini avtomatik təxmin etmə.
2. **Qiymətləndirmə CLI-si:** şəxsi məlumatı çıxarmadan ölçmələri CSV-yə yaz.
3. **1:N identifikasiya:** naməlum şəxs qərarı və ən yaxın iki namizədin qeyri-müəyyənliyi.
4. **Administrator rolları:** mövcud lokal sessiya sisteminə operator/admin səlahiyyətlərini ayrıca təhlükə modeli və testlərlə əlavə et.
5. **Kontroller simulyatoru:** rele əmri əvəzinə vəziyyət maşını, timeout və nəticə təsdiqi.

PAD, real qapı inteqrasiyası və offline təhlükəsizlik siyasəti ayrıca tədqiqat mövzularıdır. Göz qırpma yoxlamasını etibarlı PAD kimi təqdim etmə.
