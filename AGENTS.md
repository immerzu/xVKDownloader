# Projektregeln — xVKDownloader

## Release-Workflow (dauerhafte Regel des Nutzers)

- Jede Änderung am Userscript wird als neues Release gebaut, **die Version wird dabei
  immer leicht angehoben** (Patch-Bump, z. B. 1.0.13 → 1.0.14).
- Die Versionsnummer wird **ausschließlich** im Header von `scripts/build.mjs` gepflegt
  und beim Build in `dist/xvkdownloader.user.js` übernommen.
- **Jedes gebaute Script wird zusätzlich hier abgelegt:**
  `Ausgabe/xvkdownloader-<version>.user.js`
  (z. B. `Ausgabe/xvkdownloader-1.0.13.user.js`) — lokales Release-Archiv (gitignored).
  Diese Kopie nach jedem Build nicht vergessen!
- Nach dem Build die Unit-Tests laufen lassen (`node test/run-tests.mjs`, 24 Tests)
  und die README (Versionshistorie + Versionsstand) aktualisieren.

## Beschreibungs-/Sprach-Konvention (Greasy Fork, dauerhafte Regel)

Die GF-Suche filtert standardmäßig nach Sprache; eine kombinierte „DE / EN / RU"-Zeile
in EINEM `@description` macht das Skript nur in EINER Sprache auffindbar (GF ordnet
jedem Skript genau eine feste Locale zu). Deshalb gilt für den Metablock (Header in
`scripts/build.mjs`):

- `@description` = deutsche Kurzbeschreibung (Default; xVKDownloader wird bei GF als
  deutsch geführt — die Default-Beschreibung muss der GF-Skript-Locale entsprechen).
- Zusätzlich `@description:en` und `@description:ru` (je eine Zeile) — dadurch ist das
  Skript in der GF-Suche unter DE/EN/RU auffindbar.
- Kein `@description:de` (würde bei Locale `de` von GF ignoriert), keine kombinierten
  Mischtext-Zeilen, keine `@name:xx`-Zeilen ohne passendes `@description:xx`
  (GF-Validierungsfehler). `description.md` (Zusatzinfos auf GF) bleibt DE → RU → EN.
- Nach einem Beschreibungs-/Versions-Update synchronisiert GF automatisch (Webhook);
  die Auffindbarkeit danach mit Such-URLs `…/de|en|ru/scripts?q=…` gegenprüfen.
