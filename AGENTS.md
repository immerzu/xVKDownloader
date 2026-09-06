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
