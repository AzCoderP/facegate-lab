# Nasazlıq laboratoriyası

v0.2-də əvvəl lokal administrator açarı ilə daxil ol. API mutasiyaları sessiya və CSRF tokeni tələb edir. `AUTH_REQUIRED` sessiyanın bitməsi, `CSRF_INVALID` sessiya sorğusunun təsdiqlənməməsi, `RATE_LIMITED` sorğu həddinin keçilməsi deməkdir. `TEMPLATE_UNAVAILABLE` olduqda uyğunluq həddini azaltma: açar/nümunə bütövlüyünü araşdır.

Hər sınaqda bu formatı doldur: **Əlamət → ehtimal → ölçmə → əsas səbəb → həll → təkrar sınaq**. Dəyişiklikləri yalnız öz lokal laboratoriyanda et. İlk sınaqda bir dəyişən dəyişdir.

## 1. Üz uyğun gəlir, giriş verilmir

- Özünü qeydiyyata al, normal doğrulamanı yoxla.
- İstifadəçilər cədvəlində “İcazəni dəyiş” ilə hesabı deaktiv et.
- Öz üzünlə yenidən yoxla.
- Gözlənilən: `DENIED / USER_DISABLED`. Oxşarlıq yüksək qala bilər.
- Aktiv et, yenidən yoxla. Bu, tanınma ilə icazə fərqidir.

## 2. Yanlış giriş nöqtəsi

- İcazəli giriş `Main-Gate` qalsın.
- Doğrulama formasında `Lab-A` yaz.
- Gözlənilən: `DOOR_NOT_ALLOWED`.
- İcazəni və təqdim edilən giriş adını müqayisə et; üz həddini azaltmaq həll deyil.

## 3. Saat cədvəli

- İcazəni `09:00–18:00` et.
- Qayda sınağında Bakı vaxtı ilə `08:59`, `09:00`, `17:59`, `18:00` yoxla.
- Başlanğıc daxildir, son daxil deyil. Gözlənilən: rədd, icazə, icazə, rədd.
- `22:00–06:00` cədvəlində gecəni keçən intervalı araşdır.
- Qayda sınağı üzü yoxlamır və hadisə yaratmır. Real doğrulamada serverin cari vaxtı istifadə edilir.

## 4. Kamera / görüntü

- Kamera qapalıykən doğrulama et: aydın xəbərdarlıq olmalıdır.
- Kameranı aç, üzü kadrdan çıxar: `FACE_NOT_DETECTED`.
- Kameradan uzaqlaş: `FACE_TOO_SMALL` yarana bilər.
- Zəif işıq və hərəkətlə bulanıqlığı sına. Keyfiyyət yoxlamaları heuristikadır, hər pis görüntünü tutmaya bilər.
- Razılıq verən ikinci şəxs varsa iki üzlə `MULTIPLE_FACES` sına.

## 5. Server dayandırılıb

- Server terminalında `Ctrl+C` bas.
- Səhifədə yenilə düyməsini bas; uğurlu nəticə göstərilməməlidir.
- Ayrı terminalda diaqnostika işə sal:

```powershell
.\.venv\Scripts\python.exe scripts\diagnose.py --admin
Test-NetConnection 127.0.0.1 -Port 8000
```

- Serveri yenidən başlat. Əlaqənin bərpa olunduğunu yoxla.
- TCP xətası təkbaşına firewall problemini sübut etmir: proses işləməyə və ya başqa portda ola bilər.

## 6. Təkrar sorğu / baza xətası

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_lab.py -q
```

`test_retry_idempotency_and_payload_conflict`: eyni ID və eyni məzmun → bir hadisə. Eyni ID, başqa məzmun → 409.

Təkrar cavab `replayed: true` göstərir; yeni giriş deyil. Şəbəkə vaxt aşımında UI son cəhdi iki dəqiqəyədək yaddaşda saxlayır ki, təkrar düymə eyni hadisəni yenidən soruşsun. Kamera bağlananda və ya ID dəyişəndə bu yaddaş təmizlənir.

`test_database_write_failure_does_not_return_grant`: baza yazma xətası → 503, uğurlu giriş cavabı yoxdur. Bu sınaqlar deterministik üz mühərriki istifadə edir; biometrik dəqiqlik sınağı deyil.

## Hesabat nümunəsi

| Sahə | Qeyd |
|---|---|
| Əlamət | Üz uyğun gəlir, `Main-Gate` girişi rədd edilir |
| Ehtimal | İcazə qrupu və ya saat səhvdir |
| Ölçmə | Hadisə kodu `USER_DISABLED`, hesab statusu deaktiv |
| Səbəb | Hesab sınaq üçün deaktiv edilmişdi |
| Həll | Hesabı yenidən aktiv etdim |
| Təkrar yoxlama | Eyni şəraitdə `GRANTED` alındı |
