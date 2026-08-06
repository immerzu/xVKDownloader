#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""xVKDownloader — Token-Beschaffung per vkaudiotoken-python.

Beschafft einen "VK Audio Token" (Client-Emulation) für den optionalen
Token-Modus des Userscripts (Fallback, wenn der Session-Pfad nicht greift).

Ausgabe: JSON mit {token, user_agent} — auf der Konsole oder in --out-Datei.
Die Werte werden im Userscript unter "Einstellungen" eingetragen.

Hinweis: Login/Passwort werden nur lokal verarbeitet und nicht gespeichert.
"""
import argparse
import getpass
import json
import sys


def main():
    p = argparse.ArgumentParser(description='VK Audio Token beschaffen (vkaudiotoken-python)')
    p.add_argument('--login', help='Telefonnummer oder E-Mail des VK-Kontos')
    p.add_argument('--password', help='Passwort (wenn nicht angegeben: interaktiv)')
    p.add_argument('--app', choices=['kate', 'official'], default='kate',
                   help='Client-Emulation (Default: kate)')
    p.add_argument('--out', help='Ausgabedatei (JSON), optional')
    args = p.parse_args()

    login = args.login
    if not login:
        login = input('VK-Login (Telefonnummer/E-Mail): ').strip()
    password = args.password or getpass.getpass('Passwort: ')

    try:
        from vkaudiotoken import get_kate_token, get_vk_official_token
    except ImportError:
        print('FEHLER: Modul "vkaudiotoken" ist nicht installiert.', file=sys.stderr)
        print('Installation:  pip install vkaudiotoken', file=sys.stderr)
        sys.exit(2)

    getter = get_kate_token if args.app == 'kate' else get_vk_official_token
    print('Token wird beschafft (VK-Login; bei 2FA wird der SMS-Code abgefragt)…', file=sys.stderr)
    try:
        token, user_agent = getter(login, password)
    except Exception as e:  # noqa: BLE001 — Fehlerursache anzeigen
        print('FEHLER: %s' % e, file=sys.stderr)
        sys.exit(1)

    result = {'token': token, 'user_agent': user_agent, 'app': args.app, 'login': login}
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print('Token in %s geschrieben. Werte in die Userscript-Einstellungen übernehmen.' % args.out)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print('Hinweis: "token" und "user_agent" in den VK-Downloader-Einstellungen (Tampermonkey-Menü) eintragen.')


if __name__ == '__main__':
    main()
