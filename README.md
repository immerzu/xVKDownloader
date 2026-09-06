# xVKDownloader

## English 🇬🇧

Tampermonkey userscript that adds a **download button per track** on VK Audio pages (vk.com / vk.ru). It downloads the complete HLS stream, decrypts it, demuxes it and saves a **real MP3 file** (`Artist - Title.mp3`) locally.

Compatible with **Tampermonkey 5.5.0** (Chrome/Edge/Brave). Works on all VK Audio surfaces: search, your own audios, playlists and recommendations.

**Features:**
- Download button (⬇) per track in `[data-testid="MusicTrackRow"]` rows
- Full pipeline: m3u8 playlist → segments (AES-128 decryption) → concatenation → TS demux → **real MP3** (no container renaming)
- Correct filenames: `Artist - Title.mp3` (special characters cleaned)
- Progress in the tooltip (`Segment 3/11`, `saving…`, `saved`)
- Works on search, own audios, playlists, recommendations (SPA-safe)
- Optional **token mode** (api.vk.com fallback) via the settings
- No data to third parties: login/token stay local in the browser (GM storage)

**Installation:**
1. Install **Tampermonkey** (if not already): https://www.tampermonkey.net/index.php?ext=dhdg&version=5.5.0
2. Tampermonkey menu → **Dashboard** → **`+` (New script)**
3. Open the script editor and paste the **entire content of `dist/xvkdownloader.user.js`**, then save (**File → Save**, Ctrl+S).
   - Alternative: open the `.user.js` file directly in the browser — Tampermonkey offers to install it.
4. The userscript appears in the list and is **active**.

**Usage:**
1. **Log in to VK** (session cookie required — the userscript uses your normal logged-in state, **no** separate token needed).
2. Open an audio page, e.g. `https://vk.ru/audio?performer=1&q=Chris%20Lake%2C%20ATRIP`.
3. Each track row shows a **⬇-button** on the right.
4. **Click ⬇** to download the track: the tooltip shows progress, the MP3 is saved to your default download folder (`Artist - Title.mp3`).
5. Download multiple tracks one after another — each click starts its own download.

---

## Deutsch 🇩🇪

Tampermonkey-Userscript, das auf VK-Audio-Seiten (vk.com / vk.ru) einen **Download-Button pro Track** einfügt, den HLS-Stream vollständig herunterlädt, entschlüsselt und als **echte MP3-Datei** (`Künstler - Titel.mp3`) lokal speichert.

Kompatibel mit **Tampermonkey 5.5.0** (Chrome/Edge/Brave). Läuft auf allen VK-Audio-Oberflächen: Suche, eigene Audios, Playlists, Empfehlungen.

**Funktionen:**
- **Download-Button** (⬇) pro Track in `[data-testid="MusicTrackRow"]`-Zeilen
- Vollständige Pipeline: m3u8-Playlist → Segmente (AES-128-Entschlüsselung) → Konkatenation → TS-Demux → **echtes MP3** (kein Container-Umbenennen)
- Korrekter Dateiname: `Künstler - Titel.mp3` (Sonderzeichen bereinigt)
- Fortschrittsanzeige im Tooltip (`Segment 3/11`, `speichere…`, `gespeichert`)
- Funktioniert auf Suche, eigenen Audios, Playlists, Empfehlungen (SPA-navigationssicher)
- Optionaler **Token-Modus** (api.vk.com-Fallback) über die Einstellungen
- Keine Daten an Dritte: Login/Token bleiben lokal im Browser (GM-Storage)

**Installation:**
1. **Tampermonkey** installieren (falls noch nicht vorhanden): https://www.tampermonkey.net/index.php?ext=dhdg&version=5.5.0
2. Tampermonkey-Menü → **Dashboard** → **`+` (Neues Skript)**
3. Skript-Editor öffnen, **gesamten Inhalt von `dist/xvkdownloader.user.js`** einfügen, mit **Datei → Speichern** (Strg+S) sichern.
   - Alternativ: Die `.user.js`-Datei direkt im Browser öffnen — Tampermonkey bietet die Installation an.
4. Das Userscript erscheint in der Liste und ist **aktiv**.

**Nutzung:**
1. **Bei VK angemeldet sein** (Session-Cookie erforderlich — das Userscript nutzt den normalen eingeloggten Zustand, **kein** separates Token nötig).
2. Audio-Seite öffnen, z. B. `https://vk.ru/audio?performer=1&q=Chris%20Lake%2C%20ATRIP`.
3. Bei jeder Track-Zeile erscheint rechts ein **⬇-Button**.
4. **Klick auf ⬇** lädt den Track: Der Tooltip zeigt den Fortschritt, die MP3-Datei wird in den Standard-Download-Ordner gespeichert (`Künstler - Titel.mp3`).
5. Mehrere Tracks nacheinander herunterladen — jeder Klick startet einen eigenen Download.

---

## Русский 🇷🇺

Tampermonkey-юзерскрипт, который добавляет **кнопку загрузки для каждого трека** на страницах VK Audio (vk.com / vk.ru). Он полностью загружает HLS-поток, расшифровывает его и сохраняет **настоящий файл MP3** (`Исполнитель - Название.mp3`) локально.

Совместим с **Tampermonkey 5.5.0** (Chrome/Edge/Brave). Работает на всех разделах VK Audio: поиск, свои аудиозаписи, плейлисты, рекомендации.

**Возможности:**
- **Кнопка загрузки** (⬇) для каждого трека в строках `[data-testid="MusicTrackRow"]`
- Полный конвейер: плейлист m3u8 → сегменты (расшифровка AES-128) → конкатенация → TS-демультиплексирование → **настоящий MP3** (без переименования контейнера)
- Правильные имена файлов: `Исполнитель - Название.mp3` (спецсимволы очищаются)
- Индикатор прогресса в подсказке (`Segment 3/11`, `сохранение…`, `сохранено`)
- Работает в поиске, своих аудиозаписях, плейлистах, рекомендациях (устойчиво к SPA-навигации)
- Необязательный **режим токена** (фолбэк api.vk.com) через настройки
- Данные не передаются третьим лицам: логин/токен остаются локально в браузере (GM-хранилище)

**Установка:**
1. Установите **Tampermonkey** (если ещё нет): https://www.tampermonkey.net/index.php?ext=dhdg&version=5.5.0
2. Меню Tampermonkey → **Dashboard** → **`+` (Новый скрипт)**
3. Откройте редактор скриптов и вставьте **всё содержимое `dist/xvkdownloader.user.js`**, сохраните (**Файл → Сохранить**, Ctrl+S).
   - Альтернатива: откройте файл `.user.js` прямо в браузере — Tampermonkey предложит установку.
4. Юзерскрипт появится в списке и будет **активен**.

**Использование:**
1. **Войдите в VK** (требуется сессионный cookie — юзерскрипт использует обычный авторизованный режим, **отдельный токен не нужен**).
2. Откройте страницу аудио, например `https://vk.ru/audio?performer=1&q=Chris%20Lake%2C%20ATRIP`.
3. В каждой строке трека справа появится **кнопка ⬇**.
4. **Нажмите ⬇**, чтобы скачать трек: подсказка показывает прогресс, файл MP3 сохраняется в стандартную папку загрузок (`Исполнитель - Название.mp3`).
5. Скачивайте несколько треков подряд — каждый клик запускает отдельную загрузку.

---

# Developer documentation (technische Details)

## Konfiguration (optional)

Tampermonkey-Menü → **xVKDownloader: Einstellungen** öffnet ein Dialogfenster:

| Feld | Bedeutung |
|---|---|
| **Token** | Optionaler VK-Audio-Token für den api.vk.com-Fallback (siehe unten). Leer = Session-Modus. |
| **User-Agent** | Zum Token gehörender User-Agent (vkaudiotoken-python liefert beide). |
| **Bitrate** | MP3-Bitrate bei Transkodierung (128/192/256/320, Default 320). |
| **AAC→MP3 transkodieren** | Experimentell; benötigt `dist/vendor/ffmpeg/` (erzeugen: `node scripts/fetch-ffmpeg-wasm.mjs`). |
| **ffmpeg-core-URL** | Alternative Quelle für ffmpeg.wasm (Default: jsDelivr). |

Alle Werte werden **nur lokal** im Browser gespeichert (GM-Speicher).
Die Segment-Parallelität ist fest auf **3** gesetzt (`settings.js`, `concurrency`) und
nicht über das Dialogfenster änderbar.

## Token-Beschaffung (nur für den Fallback-Modus)

Der Standardweg (Session-Modus) braucht **keinen** Token. Nur wenn der
Session-Pfad einmal nicht greifen sollte, kann ein VK-Audio-Token hinterlegt
werden (Client-Emulation, wie von `vkaudiotoken-python` erzeugt):

```bash
# 1) Abhängigkeit installieren
pip install vkaudiotoken

# 2) Token beschaffen (Passwort wird sicher abgefragt; Login-Daten werden
#    nicht gespeichert)
python3 scripts/get_token.py --login +491234567890 --out token.json
#   oder:  python3 scripts/get_token.py   (interaktiv)

# 3) token + user_agent aus token.json in die Userscript-Einstellungen übernehmen
```

> Hinweis: `get_token.py` führt den VK-Login lokal aus (2FA wird unterstützt)
> und gibt `{token, user_agent}` aus. Das Token ist für die Nutzung der
> api.vk.com-Methoden (`audio.getById`) gedacht und sollte wie ein Passwort
> behandelt werden.

## Technischer Hintergrund (Netzwerkanalyse, August 2026)

Der aktuelle VK-Audio-Fluss (live im Browser beobachtet):

1. **Track-Daten**: Die Seite lädt Tracks über
   `POST https://vk.ru/al_audio.php?act=reload_audios` mit
   `al=1&audio_ids=<owner>_<id>_` (kommagetrennt, nachgestellter Unterstrich).
   Antwort: `{"payload":[0,[[<track>,…]]]}` — pro Track ein Feld-Array mit der
   obfuskierten Stream-URL bei **Index 2** (`https://vk.ru/mp3/audio_api_unavailable.mp3?extra=…#…`).
   Zusätzlich steckt im React-Fiber (`apiAudio`) bereits eine direkte m3u8-URL.
2. **Obfuskation**: Die `audio_api_unavailable`-URL wird mit dem klassischen
   v/r/s/i/x-Algorithmus (Base64-Daten + Op-Liste) entschlüsselt → echte
   m3u8-URL auf `*.vkuseraudio.net`.
3. **Playlist**: Media-Playlist (selten Master), Segment-URIs `seg-XX-a2.ts?siren=1`.
4. **Verschlüsselung**: `#EXT-X-KEY:METHOD=AES-128` mit Schlüssel unter
   `…/key.pub?siren=1` (**16-Byte-Rohschlüssel**); IV = Media-Sequence-Nummer
   (Big-Endian, 16 Byte). Entschlüsselung per WebCrypto (`AES-CBC`).
5. **Container**: Die Segmente sind MPEG-TS mit **MP3** (stream_type `0x03`,
   meist 320 kbps/44,1 kHz). Das Userscript demuxt PAT/PMT/PES und fügt die
   Elementary Streams zu einer validen MP3-Datei zusammen.

Beobachtete API-Methoden (weitere): `web.api.vk.ru/method/catalog.getAudioSearch`
(v=5.282, client_id=6287487) — verlangt Login (error 28 ohne Session).

## Projektstruktur

```
xVKDownloader/
├── dist/
│   ├── xvkdownloader.user.js      ← INSTALLIERBARES Userscript (gebaut; aktuell v1.0.13)
│   └── vendor/ffmpeg/             ← ffmpeg.wasm (optional; gitignored, per fetch-ffmpeg-wasm.mjs)
├── src/
│   ├── main.js                    ← UI, Resolution, Download-Pipeline
│   └── shared/
│       ├── vk-decoder.js          ← audio_api_unavailable-Decoder (v/r/s/i/x)
│       ├── m3u8.js                ← HLS-Parser (Master/Media, Key-Status, Variantenwahl)
│       ├── ts-demux.js            ← MPEG-TS → Elementary Stream
│       ├── assemble.js            ← Codec-Erkennung, Konkatenation, Dateinamen
│       ├── aes.js                 ← AES-128-CBC + IV (WebCrypto)
│       ├── gm-net.js              ← GM_xmlhttpRequest-Wrapper (+ fetch-Fallback)
│       └── settings.js            ← GM-Speicher-Einstellungen
├── scripts/
│   ├── build.mjs                  ← baut dist/xvkdownloader.user.js (Header + Konkatenation)
│   ├── get_token.py               ← vkaudiotoken-python-Wrapper (Token-Fallback)
│   └── fetch-ffmpeg-wasm.mjs      ← lädt ffmpeg.wasm (optional, AAC→MP3)
├── test/
│   ├── run-tests.mjs              ← 24 Node-Unit-Tests
│   ├── fixtures.mjs               ← synthetische MP3/TS/ADTS/fMP4-Fixtures
│   ├── fixture-server.mjs         ← VK-Simulator für Browser-E2E
│   ├── cdp-check.mjs              ← CDP-Diagnose: Login-Status + Buttons (Port 9222)
│   ├── cdp-analyze.mjs            ← CDP-Live-Analyse: Klick + Netzwerk/Konsole/Fehler
│   ├── cdp-live.mjs               ← CDP-E2E: Klick, 40 s mitschneiden, MP3-Ordner prüfen
│   ├── netlog-analyze.mjs         ← NetLog-Analyse: Audio-Requests (Status/Fehler)
│   ├── netlog-stream.mjs          ← NetLog-Detail: m3u8-/Stream-Events
│   └── netlog-timeline.mjs        ← NetLog-Timeline: Stream-Events mit Zeiten
├── description.md                 ← Kurzbeschreibung für Greasy Fork (DE → RU → EN)
└── Ausgabe/                       ← lokales Release-Archiv (gitignored; versionierte .user.js, bis v1.0.13)
```

> **Hinweis Build-Version:** Die Versionsnummer wird **ausschließlich** im Header von
> `scripts/build.mjs` gepflegt (Stand: **v1.0.13**) und beim Build in den Metablock von
> `dist/xvkdownloader.user.js` übernommen. `node scripts/build.mjs` reproduziert das
> veröffentlichte Artefakt byte-identisch.

## Architektur

Alle `src/`-Module sind klassische IIFEs, die sich am gemeinsamen Namensraum
`globalThis.__VKD` registrieren (z. B. `NS.m3u8`, `NS.aes`, `NS.decoder`). Dadurch
laufen **dieselben Dateien** unverändert in der Tampermonkey-Sandbox und unter Node
(die Tests laden sie per `require` und nutzen `node:crypto` als WebCrypto-Polyfill).

`scripts/build.mjs` ist bewusst **kein Bundler**: Es konkateniert die Module in fester
Reihenfolge (`vk-decoder → m3u8 → ts-demux → assemble → aes → gm-net → settings →
main`) in einen Userscript-Header + IIFE-Wrapper. Netzwerk läuft ausschließlich über
`gm-net.js` (`GM_xmlhttpRequest`, fetch-Fallback), Downloads über `NS.gm.download`
(Fallback: `<a download>`).

## Tests

```bash
node test/run-tests.mjs        # 24 Unit-Tests (Decoder, m3u8, TS, Assemble, AES)
node scripts/build.mjs         # Userscript bauen (Achtung: setzt Header-Version aus build.mjs, s. o.)
node test/fixture-server.mjs   # VK-Fixture-Server (Port 8765) für Browser-E2E
node test/cdp-check.mjs        # Live-Diagnose am Browser (CDP, Port 9222): Login + Buttons
node test/cdp-analyze.mjs      # Klick auf .vkd-btn + 25 s Netzwerk/Konsole/Fehler mitschneiden
node test/cdp-live.mjs         # CDP-E2E: Tab öffnen, Klick, 40 s mitschneiden, Download-Ordner prüfen
node test/netlog-analyze.mjs   # NetLog analysieren: Audio-Requests (Status/Fehler)
node test/netlog-stream.mjs    # NetLog-Detail: m3u8-/Stream-Events
node test/netlog-timeline.mjs  # NetLog-Timeline: Stream-Events mit Zeiten
```

- Die CDP-Skripte (`cdp-*.mjs`) benötigen einen Browser mit Remote-Debugging auf
  Port 9222 sowie **Node ≥ 21** (globales `WebSocket`).
- `netlog-*.mjs` analysieren einen Chrome-NetLog (`chrome-net-export-log.json`,
  Default-Pfad im jeweiligen Skript hinterlegt).
- `VKD_TEST_FAILKEY=N` als Env-Variable beim `fixture-server.mjs` lässt die ersten N
  Key-Requests mit HTTP 500 fehlschlagen — reproduziert den transienten
  Key-Fehlerpfad inkl. Retry/Key-Cache.

Der Browser-E2E lädt das echte Userscript (alle `src/`-Module) in eine
VK-nachgebildete Seite (GM-APIs gestubbt) und prüft: Button-Injektion,
al_audio.php-Resolution, AES-Entschlüsselung, MP3-Assembly (byte-identisch
mit dem Quell-MP3) und Dateinamen.

## Bekannte Einschränkungen & Risiken

- **VK kann den Schutz jederzeit ändern** (Obfuskation, Verschlüsselung, DOM).
  Der Decoder und die Endpunkte sind Stand August 2026 live verifiziert.
- Falls VK Streams mit **AAC** statt MP3 ausliefert, speichert das Script den
  nativen Container (`.m4a`/`.aac`); für echtes MP3 dann die experimentelle
  ffmpeg.wasm-Transkodierung aktivieren (`scripts/fetch-ffmpeg-wasm.mjs`).
- Verschlüsselte Streams mit abweichendem IV-/Padding-Schema würden den
  Download abbrechen (Fehlermeldung im Tooltip).
- **Rechtlicher Hinweis:** Nur für Inhalte verwenden, deren Download du
  rechtlich gestattet ist (z. B. eigene Uploads). Private Nutzung.
- Keine Garantie, dass VK den Zugriff nicht unterbindet; Token können
  an Gültigkeit verlieren.

## Versionshistorie

| Version | Inhalt |
|---|---|
| 1.0.13 | Download-Pfeil (⬇-Button) grün eingefärbt (Standard `#2e7d32`, Hover `#1b5e20`); Fehlerzustand bleibt rot |
| 1.0.12 | Kurzbeschreibung dreisprachig in `@description` (DE/EN/RU); `:de`/`:ru`-Zeilen entfernt; `description.md` auf DE → RU → EN vereinheitlicht |
| 1.0.11 | Metablock-Beschreibungen auf GF-i18n-Format vereinheitlicht |
| 1.0.10 | Fix: AES-Key-Cache verwirft abgelehnte Promises (Retry lädt Key neu) |
| 1.0.9 | Rebranding VK Downloader → xVKDownloader (Name, Namespace, Build-Output, README) |
| 1.0.8 | Userscript + Tooling + Tests |
| 1.0.7 | Vorgängerversion („VK Downloader“) — nur noch als Archiv in `Ausgabe/` |

## Lizenz

MIT — nur private Nutzung. Keine Veröffentlichung in App-Stores.
