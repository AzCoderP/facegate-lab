# CCNA şəbəkə məşqi

Bu sənəd Packet Tracer-də özün quracağın əlavə məşqdir. Hazır `.pkt` faylı və real kontroller inteqrasiyası daxil deyil. Kompüter ikonları terminalın yalnız şəbəkə tərəfini təmsil edir; üz tanımır.

## Topologiya

```text
Terminal-1 ─┐ VLAN 20 192.168.20.0/24
Terminal-2 ─┴─ Switch ─ trunk ─ Router
Server ─────── Switch   VLAN 30 192.168.30.0/24
Admin-PC ───── Switch   VLAN 10 192.168.10.0/24
```

| Cihaz | Ünvan | Gateway |
|---|---|---|
| Terminal-1 | 192.168.20.11/24 | 192.168.20.1 |
| Terminal-2 | 192.168.20.12/24 | 192.168.20.1 |
| İdarəetmə serveri | 192.168.30.10/24 | 192.168.30.1 |
| Admin-PC | 192.168.10.10/24 | 192.168.10.1 |

## Tapşırıqlar

1. Üç VLAN yarat və access portlarını təyin et.
2. Router-on-a-stick və 802.1Q ilə VLAN-lararası əlaqəni qur.
3. Əvvəl marşrutlaşdırmanı yoxla, sonra siyasət əlavə et.
4. ACL dizaynında terminal şəbəkəsindən yalnız serverin zəruri xidmətlərinə icazə ver. Admin trafikini ayrıca düşün.
5. PT HTTP xidməti ilə tətbiq trafiki nümayiş etdir; onun portunu real FastAPI serverinin 8000 portu ilə qarışdırma.
6. IP planı, konfiqurasiya və paket axınını sənədləşdir.

## Qəsdən yaradılan nasazlıqlar

- Terminal portunu yanlış VLAN-a keçir.
- Gateway-i yanlış yaz.
- Trunk-da VLAN 20-ni çıxar.
- ACL-də tətbiq trafikinə icazəni aradan qaldır.

Hər birində yalnız bir dəyişiklik et. `show vlan brief`, `show interfaces trunk`, `show ip interface brief`, `show ip route`, `show access-lists` ilə fərziyyəni yoxla. Uğurlu ping ilə işlək tətbiq bağlantısının eyni olmadığını izah et.

## Hazır tətbiqin sərhədi

FaceGate Lab hazırda yalnız localhost üçün hazırlanıb; loopback-dən kənar müştəriləri rədd edir. Packet Tracer dizaynını yoxlamaq üçün tətbiqi LAN-a açmaq lazım deyil. Mövcud lokal administrator sessiyası LAN üçün hazırlanmış giriş sistemi deyil. LAN/real terminallara inteqrasiya üçün ayrıca autentifikasiya arxitekturası, TLS, səlahiyyət modeli və cihaz protokolu hazırlanmalıdır.
