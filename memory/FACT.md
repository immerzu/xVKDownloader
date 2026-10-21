# xVKDownloader — FACT SHEET (Stand: v1.0.17, 2026-10-21)

Dauerhaftes Projektwissen zum xVKDownloader-Userscript (VK Audio → echtes MP3, Tampermonkey).
Bei jeder Änderung die Stand-Zeile oben + JOURNAL.jsonl aktualisieren. Kurz-Regeln (bindend):
`AGENTS.md` im Repo-Root.

## Kerndaten
- **Projekt-Root:** `F:\001_Coding_Projekte\xVKDownloader\`
- **Architektur:** Quellen in `src/` (IIFE-Module, Namensraum `globalThis.__VKD`); Build
  `scripts/build.mjs` ist **kein Bundler** (Konkatenation in fester Reihenfolge
  `vk-decoder → m3u8 → ts-demux → assemble → aes → gm-net → settings → main` + Header) →
  `dist/xvkdownloader.user.js`.
- **Versionsnummer:** wird **ausschließlich** im Header von `scripts/build.mjs` gepflegt.
- **Versionsarchive:** `Ausgabe\xvkdownloader-<version>.user.js` — gitignored, NIE committen
  (Regel des Nutzers: nach jedem Build dorthin kopieren!).
- **Tests:** `node test/run-tests.mjs` (24 Unit-Tests) — nach jedem Build laufen lassen.
- **Git-Repo:** `immerzu/xVKDownloader` (Branch `main`); Greasy Fork: Skript **590156**
  (`590156-xvkdownloader`), Account `immerzu`.
- **GF-Sync (Webhook, verifiziert funktionierend):** Push auf `main` → GF zieht
  `raw.githubusercontent.com/immerzu/xVKDownloader/main/dist/xvkdownloader.user.js`
  automatisch (i. d. R. < 1 Min, KEIN manueller Upload nötig).
- **Install-Link:** `https://update.greasyfork.org/scripts/590156/xVKDownloader.user.js`
- **description.md:** GF „Zusätzliche Informationen", Format DE → RU → EN (unverändert gepflegt).

## Versionshistorie (relevant fürs Verständnis)
- **v1.0.8/1.0.9** – Userscript + Tooling/Tests; Rebranding VK Downloader → xVKDownloader.
- **v1.0.10** – Fix: AES-Key-Cache verwirft abgelehnte Promises (Retry lädt Key neu).
- **v1.0.11/1.0.12** – Metablock-Beschreibungs-Experimente (GF-i18n → zurück zu einzeilig).
- **v1.0.13** – Download-Pfeil grün (Standard `#2e7d32`, Hover `#1b5e20`); Fehler bleibt rot.
- **v1.0.14** – Download-Pfeil **leuchtendes Signalgrün `#00c853`** (Wunsch des Nutzers:
  „richtig leuchtend", gut sichtbar auf hellem UND dunklem VK-Theme; Hover: nur grüner Ring
  `rgba(0,200,83,.18)`, Icon-Farbe bleibt; `.vkd-err` bleibt rot).
  - Farbe technisch: Icon = SVG mit `stroke="currentColor"` → Farbe über CSS `.vkd-btn{color:…}`
    in `src/main.js` (`STYLES`-Konstante). Zentral an einer Stelle änderbar.
- **v1.0.15** – Kurzbeschreibung LOKALISIERT (siehe Erkenntnis 2) — Auffindbarkeit in allen
  Sprach-Suchen.
- **v1.0.16** (2026-10-21) – **VK-Formatwechsel**: `apiAudio.url` im React-Fiber liefert eine
  **direkte MP3-Datei** (`…/v1/acmp/<id>.mp3?siren=1`, `audio/mpeg`, ~7,2 MB, 320 kbps/44,1 kHz),
  keine HLS-Playlist mehr. v1.0.15 lud sie als Playlist-Text → jede Folge-URL kaputt
  (`HTTP 400 …/acmp/ID3%04…`, Tooltip rot). Fix: `fetchAndAssemble` lädt die erste Antwort als
  **Bytes**; nur bei Kopf `#EXTM3U` läuft die Segment-Pipeline, sonst `assemble.concatSegments([raw])`
  (Codec-/Extension-Erkennung) und direkt speichern. Zweiter Fix: **Einzel-Audio-Seiten**
  (`/audio<owner>_<id>_<access>`, `data-testid="MusicAudio_TrackBlock"`) bekamen nie einen Button —
  Row-Regex + `findMount` (`MusicAudio_ActionsGroup`) + Track-Extraktion (IDs aus `location.pathname`,
  Titel aus `AudioAudioPage_Title`, Interpret aus `MusicAudio_Author`) erweitert.
- **v1.0.17** (2026-10-21) – **Button-Position** (Wunsch des Nutzers nach Screenshot): lag mitten in
  der Hover-Iconreihe (vor `MusicAudio_OpenSnippet`). Neu: `findMount` hängt ihn in die
  **Grid-Zellenzeile** (`vkit-6jgEbc`, enthält `MusicTrackRow_Info` und die Dauer) und das CSS setzt
  `justify-self:end` → er steht **rechts in der Zeile, direkt links neben der Dauer**, immer
  sichtbar; beim Hover erscheinen die Icons rechts davon (kein Auseinanderreißen, kein Springen).
  Belegt im Testprofil: ohne Hover Button 790–818 px, Dauer 830–857 px; mit Hover Button 641–669 px,
  Actions 669–861 px. Gäste-Fall: Grid hat feste Spalten (`52px 101px 199px 43px`) — ohne
  `justify-self:end` landet der Button in der breiten Titel-Spalte (verworfen).

## WICHTIGE Erkenntnisse (Session 2026-09-06)

1. **Release-Workflow (Regel des Nutzers, „Merken!"):** Jede Änderung am Userscript → neue
   Version (Patch-Bump, z. B. 1.0.14 → 1.0.15) in `scripts/build.mjs` → `node scripts/build.mjs`
   → Kopie nach `Ausgabe\xvkdownloader-<version>.user.js` → `node test/run-tests.mjs` → README
   (Historie + Versionsstand) → Commit + Push. Nie dieselbe Version zweimal.

2. **GF-Sprachfilter / lokalisierte Beschreibung (Kern-Erkenntnis, Quellcode-belegt):**
   - Greasy Fork filtert die **Suche** standardmäßig nach Sprache („Es werden nur Ergebnisse in
     Deutsch/… angezeigt", `filter_locale`). Jedes Skript hat genau EINE feste Skript-Locale
     (`script.locale`, beim Erst-Upload per detectlanguage.com gesetzt, danach **fix**).
   - Eine kombinierte „DE / EN / RU"-Zeile in EINEM `@description` erzeugt **keine**
     en-/ru-Lokalisierung → Skript nur in EINER Sprach-Suche auffindbar (xVKDownloader war nur
     auf `/de/` sichtbar, nicht auf `/en/` oder `/ru/`).
   - **Lösung (ab v1.0.15):** `@description` = **deutsche** Kurzbeschreibung (Default; entspricht
     GF-Skript-Locale `de` von xVKDownloader) + `@description:en` + `@description:ru` (je eine
     Zeile) → GF speichert drei Lokalisierungen → Skript erscheint in der Suche unter
     DE/EN/RU (live verifiziert 2026-09-06).
   - Regeln: KEIN `@description:de` (wird bei Skript-Locale `de` von GF ignoriert), KEINE
     Mischtext-Zeilen, KEINE `@name:xx`-Zeilen ohne passendes `@description:xx`
     (GF-Validierung „can't be blank"), jede Zeile ≤ 500 Zeichen. Anzeige: Nutzer sehen die
     Beschreibung in ihrer Sprache (kein Mischtext mehr).
   - Belege: greasyfork-org/greasyfork `script.rb:175-186` (`set_locale` nur bei `locale.nil?`),
     `script.rb:800-844` (`update_localized_attribute`, Suffix-Skip bei == Skript-Locale),
     `script_indexing.rb:131` (Suchfeld `locale`), `script_listings.rb:312-336` (`filter_locale`).
   - **Gilt für ALLE immerzu-GF-Skripte:** xVK/xLoader Locale `de` (DE-Default), xYT Locale `en`
     (EN-Default); zentrale Referenz = globaler Skill `userscript-beschreibungen-immerzu`.

3. **Verifikation nach Push (Standard):** GF-Versionsseite
   (`https://greasyfork.org/de/scripts/590156-xvkdownloader/versions`) + **Suchbarkeit** über
   `https://greasyfork.org/<de|en|ru>/scripts?q=xvkdownloader` (Skript muss jeweils erscheinen,
   Beschreibung in der Suchsprache) + Anzeige auf der Skriptseite.

4. **Globale Skills (2026-09-06 angelegt/aktualisiert):** Neuer Skill
   `userscript-beschreibungen-immerzu` (Konvention + Wortlaute aller drei Skripte);
   `greasy-fork-publish` und `github-immerzu` auf die lokalisierte Konvention korrigiert.

5. **VK liefert MP3 statt HLS (live belegt 2026-10-21, anonym bei vk.ru):**
   - Fiber-URL im Track (`apiAudio.url`, bei anonymen Aufrufen auch `audio.getById` über
     `web.api.vk.ru`): `https://cs1-77v4.vkuseraudio.ru/s/v1/acmp/<hash>.mp3?siren=1` →
     `206 audio/mpeg`, `Content-Range: bytes 0-2047/7127084`, ID3-Kopf, `analyzeMp3`:
     320 kbps/44,1 kHz, 180 s, `frameCoverage 1` → **kein 30-s-Preview**.
   - `al_audio.php?act=reload_audios` **existiert weiter** und liefert für `audio_ids=<owner>_<id>_`
     ein Feld-Array (32 Felder, URL bei Index 2), obfuskiert als
     `https://vk.ru/mp3/audio_api_unavailable.mp3?extra=…#…`; der eigene Decoder löst sie zu einer
     **m3u8** (`…/s/v1/acs/<hash>/index.m3u8?siren=1`) auf, Playlist unverändert AES-128 +
     `seg-XX-a2.ts` (anonym nur ~31 s Inhalte). Der HLS-Weg bleibt also gültig — beide Wege müssen
     im Skript funktionieren.
   - Fehlerbild vor dem Fix: Tooltip `HTTP 400 für https://cs1-…/acmp/ID3%04…` (Binärdaten wurden
     als Playlist-Text geparst und als Basis-URL verwendet).

6. **Tampermonkey 5.5.1 benennt Blob-Downloads falsch (belegt 2026-10-21):**
   `GM_download({url: <blob:>, name: 'GM Testname 42.mp3'})` → Datei heißt
   `<uuid>.mp3` (UUID der Object-URL), der `name` wird ignoriert. Gleicher Blob per
   `a.download = 'xVKD Testname 1.mp3'` → korrekter Name. Betrifft `saveResult` in `src/main.js`
   (v1.0.16 noch unverändert, d. h. UUID-Dateinamen sind derzeit zu erwarten) — Workaround wäre
   `anchorFallback` zuerst. Nicht beauftragt, nur festgehalten.

## Aktuelle GF-Kurzbeschreibung (Wortlaut v1.0.15)
- DE (Default): `Download-Button pro Track auf VK Audio-Seiten (vk.com/vk.ru); lädt den HLS-Stream und speichert MP3 lokal. Tampermonkey-kompatibel.`
- EN: `Download button for each track on VK Audio pages (vk.com/vk.ru); loads the HLS stream and saves MP3 locally. Tampermonkey-compatible.`
- RU: `Кнопка загрузки для каждого трека на страницах VK Audio (vk.com/vk.ru); загружает HLS-поток и сохраняет MP3 локально. Совместимо с Tampermonkey.`

## Technischer Hintergrund (Netzwerkanalyse, August 2026 — Details im README)
VK-Audio-Fluss: `al_audio.php?act=reload_audios` (Session) bzw. React-Fiber `apiAudio` →
obfuskierte URL (`audio_api_unavailable`) → v/r/s/i/x-Decoder → m3u8 auf `*.vkuseraudio.net`
→ Segmente `seg-XX-a2.ts?siren=1`, AES-128 (16-Byte-Rohkey, IV = Media-Sequence Big-Endian,
WebCrypto AES-CBC) → MPEG-TS-Demux (stream_type 0x03, MP3) → echtes MP3.
Segment-Parallelität fest 3 (`settings.js`, nicht im Dialog änderbar).

## Bekannte Grenzen
- VK kann Schutz jederzeit ändern (Stand Aug 2026 verifiziert); AAC-Streams → `.m4a/.aac`
  (echtes MP3 nur mit experimenteller ffmpeg.wasm-Transkodierung); nur Inhalte mit
  Download-Berechtigung (rechtlicher Hinweis).

