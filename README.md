# Wegpunkt – dein eigener Routenplaner

Ein einfacher Multi-Stopp-Routenplaner für dein Handy, ganz ähnlich wie
Spoke/Circuit: Adressen sammeln, Reihenfolge automatisch optimieren,
zur Navigation an Google/Apple Maps übergeben.

**Kosten: 0 €.** Kein Konto, kein API-Schlüssel, kein eigener Server.
Genutzt werden ausschließlich kostenlose, offene Dienste:

- **Karte:** OpenStreetMap
- **Adresssuche:** Photon (komoot, OSM-Daten)
- **Routen-Optimierung:** OSRM (öffentlicher Demo-Server)
- **Speicherung:** nur lokal auf deinem Handy (localStorage) – es gibt
  keinen eigenen Server, der deine Adressen sieht oder speichert.

> Hinweis: Ursprünglich wurde Nominatim für die Adresssuche genutzt.
> Dessen Nutzungsbedingungen schließen inzwischen ausdrücklich Apps aus,
> die von KI-Assistenten generiert wurden – deshalb läuft die Suche jetzt
> über Photon, das dieselben OpenStreetMap-Daten liefert, aber ohne diese
> Einschränkung nutzbar ist.

## Funktionen

- Adressen per Suche oder durch Antippen der Karte hinzufügen
- Stopps per Pfeil-Buttons neu sortieren, abhaken oder löschen
- "Route optimieren" berechnet die schnellste Reihenfolge
- "Von meinem Standort starten" nutzt den aktuellen Standort als Startpunkt
- "Zum Start zurückkehren" für Rundtouren (an/aus)
- Pro Stopp: Direkter "Navigieren"-Button, der Google Maps (Android) bzw.
  Apple Maps (iPhone) mit Turn-by-Turn-Navigation öffnet
- "Route öffnen" übergibt die komplette optimierte Route an Google Maps
- Funktioniert offline weiter für die Bedienoberfläche (Karte, Suche und
  Optimierung brauchen weiterhin Internet)

## So nutzt du sie sofort auf dem Handy (schnellster Weg)

1. Diesen Ordner (bzw. die ZIP-Datei) auf dein Handy übertragen, z. B.
   per AirDrop, Google Drive, iCloud oder USB.
2. `index.html` mit dem Browser öffnen (Safari bzw. Chrome).
3. Im Browsermenü **„Zum Home-Bildschirm“** wählen.
4. Fertig – das Icon liegt jetzt auf deinem Startbildschirm.

Das funktioniert sofort, aber ohne Offline-Zwischenspeicherung der
Programmoberfläche, da diese nur bei Aufruf über eine echte Webadresse
(https) aktiviert wird.

## Empfohlener Weg: als „richtige“ installierbare App (kostenlos, 5 Minuten)

Für die volle App-Erfahrung (eigenes Icon, Vollbild ohne Browserleiste,
schnelleres Laden) einmalig kostenlos über GitHub Pages hosten:

1. Kostenloses Konto auf github.com anlegen (falls noch nicht vorhanden).
2. Neues, öffentliches Repository erstellen, z. B. `wegpunkt`.
3. Alle Dateien aus diesem Ordner in das Repository hochladen
   („Add file → Upload files“, dann committen).
4. Im Repository unter **Settings → Pages** als Quelle den `main`-Branch
   auswählen und speichern.
5. Nach ca. 1 Minute ist die App unter
   `https://DEIN-BENUTZERNAME.github.io/wegpunkt/` erreichbar.
6. Diesen Link auf dem Handy öffnen und **„Zum Home-Bildschirm“** wählen –
   jetzt startet die App im Vollbild wie eine echte App, inklusive
   Offline-Grundgerüst.

Sag mir gern Bescheid, wenn du dabei Unterstützung möchtest – dann gehe
ich die Schritte mit dir gemeinsam durch.

## Wichtig zu wissen

- Der öffentliche OSRM-Server ist ein kostenloses Angebot ohne Garantie.
  Für den persönlichen Gebrauch (ein paar Routen am Tag) reicht das
  problemlos. Sollte er mal überlastet sein, einfach kurz später erneut
  versuchen.
- Es gibt keine gesprochene Turn-by-Turn-Navigation *innerhalb* der App –
  dafür wird bewusst an Google Maps/Apple Maps übergeben, die das
  zuverlässig können.
- Die Google-Maps-Route mit vielen Wegpunkten funktioniert zuverlässig
  bis ca. 20–23 Stopps auf einmal.

## Dateien

```
index.html   – Aufbau der App
style.css    – Design
app.js       – gesamte Funktionslogik
manifest.json, sw.js, icons/ – für die Installation als App
```
