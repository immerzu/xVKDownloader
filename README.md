# xVKDownloader

Tampermonkey-Userscript, das auf VK-Audio-Seiten (vk.com / vk.ru) einen
**Download-Button pro Track** einfügt, den HLS-Stream vollständig herunterlädt,
entschlüsselt und als **echte MP3-Datei** (`Künstler - Titel.mp3`) lokal speichert.

Kompatibel mit **Tampermonkey 5.5.0** (Chrome/Edge/Brave). Läuft auf allen
VK-Audio-Oberflächen: Suche, eigene Audios, Playlists, Empfehlungen.

---

## Funktionen

- **Download-Button** (⬇) pro Track in `[data-testid="MusicTrackRow"]`-Zeilen
- Vollständige Pipeline: m3u8-Playlist → Segmente (AES-128-Entschlüsselung) →
  Konkatenation → TS-Demux → **echtes MP3** (kein Container-Umbenennen)
- Korrekter Dateiname: `Künstler - Titel.mp3` (Sonderzeichen bereinigt)
- Fortschrittsanzeige im Tooltip (`Segment 3/11`, `speichere…`, `gespeichert`)
- Funktioniert auf Suche, eigenen Audios, Playlists, Empfehlungen (SPA-navigationssicher)
- Optionaler **Token-Modus** (api.vk.com-Fallback) über die Einstellungen
- Keine Daten an Dritte: Login/Token bleiben lokal im Browser (GM-Storage)

---

## Installation

1. **Tampermonkey** installieren (falls noch nicht vorhanden):
   - Chrome: https://www.tampermonkey.net/index.php?ext=dhdg&version=5.5.0
2. Tampermonkey-Menü → **Dashboard** → **`+` (Neues Skript)**
3. Skript-Editor öffnen, **gesamten Inhalt von `dist/xvkdownloader.user.js`**
   einfügen, mit **Datei → Speichern** (Strg+S) sichern.
   - Alternativ: Skript-Datei per Drag & Drop auf die `chrome://extensions`-Seite
     oder die `.user.js`-Datei direkt öffnen → Tampermonkey bietet Installation an.
4. Das Userscript erscheint in der Liste und ist **aktiv**.

> Hinweis: Das Skript ist ein **unverändertes Build-Artefakt** aus `src/`.
> Nach Änderungen an `src/` neu bauen: `node scripts/build.mjs`.

---

## Nutzung

1. **Bei VK angemeldet sein** (Session-Cookie erforderlich — das Userscript nutzt
   den normalen eingeloggten Zustand, **kein** separates Token nötig).
2. Audio-Seite öffnen, z. B.:
   `https://vk.ru/audio?performer=1&q=Chris%20Lake%2C%20ATRIP`
3. Bei jeder Track-Zeile erscheint rechts ein **⬇-Button**.
4. **Klick auf ⬇** lädt den Track:
   - Tooltip zeigt den Fortschritt.
   - Die MP3-Datei wird in den Standard-Download-Ordner gespeichert
     (`Künstler - Titel.mp3`).
5. Mehrere Tracks nacheinander herunterladen — jeder Klick startet einen eigenen
   Download.

---

## Konfiguration (optional)

Tampermonkey-Menü → **xVKDownloader: Einstellungen** öffnet ein Dialogfenster:

| Feld | Bedeutung |
|---|---|
| **Token** | Optionaler VK-Audio-Token für den api.vk.com-Fallback (siehe unten). Leer = Session-Modus. |
| **User-Agent** | Zum Token gehörender User-Agent (vkaudiotoken-python liefert beide). |
| **Bitrate** | MP3-Bitrate bei Transkodierung (128/192/256/320, Default 320). |
| **AAC→MP3 transkodieren** | Experimentell; benötigt `dist/vendor/ffmpeg/` (siehe unten). |
| **ffmpeg-core-URL** | Alternative Quelle für ffmpeg.wasm (Default: jsDelivr). |

Alle Werte werden **nur lokal** im Browser gespeichert (GM-Speicher).

---

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

---

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

---

## Projektstruktur

```
VK_Downloader/
├── dist/
│   └── xvkdownloader.user.js      ← INSTALLIERBARES Userscript (gebaut)
├── src/
│   ├── main.js                    ← UI, Resolution, Download-Pipeline
│   └── shared/
│       ├── vk-decoder.js          ← audio_api_unavailable-Decoder (v/r/s/i/x)
│       ├── m3u8.js                ← HLS-Parser (Master/Media, Key-Status)
│       ├── ts-demux.js            ← MPEG-TS → Elementary Stream
│       ├── assemble.js            ← Codec-Erkennung, Konkatenation, Dateinamen
│       ├── aes.js                 ← AES-128-CBC + IV (WebCrypto)
│       ├── gm-net.js              ← GM_xmlhttpRequest-Wrapper (+ fetch-Fallback)
│       └── settings.js            ← GM-Speicher-Einstellungen
├── scripts/
│   ├── build.mjs                  ← baut dist/xvkdownloader.user.js
│   ├── get_token.py               ← vkaudiotoken-python-Wrapper (Token-Fallback)
│   └── fetch-ffmpeg-wasm.mjs      ← lädt ffmpeg.wasm (optional, AAC→MP3)
└── test/
    ├── run-tests.mjs              ← 24 Node-Unit-Tests
    ├── fixtures.mjs               ← synthetische MP3/TS/ADTS/fMP4-Fixtures
    ├── fixture-server.mjs         ← VK-Simulator für Browser-E2E
    ├── cdp-check.mjs              ← CDP-Diagnose: Login-Status + Buttons (Port 9222)
    ├── cdp-analyze.mjs            ← CDP-Live-Analyse: Klick + Netzwerk/Konsole/Fehler
    ├── cdp-live.mjs               ← CDP-E2E: Klick, 40 s mitschneiden, MP3-Ordner prüfen
    ├── netlog-analyze.mjs         ← NetLog-Analyse: Audio-Requests (Status/Fehler)
    ├── netlog-stream.mjs          ← NetLog-Detail: m3u8-/Stream-Events
    └── netlog-timeline.mjs        ← NetLog-Timeline: Stream-Events mit Zeiten
```

---

## Tests

```bash
node test/run-tests.mjs        # 24 Unit-Tests (Decoder, m3u8, TS, Assemble, AES)
node scripts/build.mjs         # Userscript bauen
node test/fixture-server.mjs   # VK-Fixture-Server (Port 8765) für Browser-E2E
node test/cdp-check.mjs        # Live-Diagnose am Browser (CDP, Port 9222): Login + Buttons
node test/cdp-analyze.mjs      # Klick auf .vkd-btn + 25 s Netzwerk/Konsole/Fehler mitschneiden
```

Der Browser-E2E lädt das echte Userscript (alle `src/`-Module) in eine
VK-nachgebildete Seite (GM-APIs gestubbt) und prüft: Button-Injektion,
al_audio.php-Resolution, AES-Entschlüsselung, MP3-Assembly (byte-identisch
mit dem Quell-MP3) und Dateinamen.

---

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

---

## Lizenz

MIT — nur private Nutzung. Keine Veröffentlichung in App-Stores.
