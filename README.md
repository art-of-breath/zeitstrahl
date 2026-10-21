# Zeitstrahl

Ein interaktiver Lebens-Zeitstrahl für die Sessions von Daniel Alan. Geburtsdatum eingeben, die
Linie zeichnet sich bis heute, dann schöne und schwere Momente eintragen.

- Statische Web-App (PWA): HTML, CSS und JS-Module, kein Build-Schritt.
- Alle Einträge bleiben im Browser des Geräts (IndexedDB). Kein Server, keine Konten, kein Tracking.
- Gerätewechsel über „Als Datei sichern“ und „Datei laden“ im Menü.

Live: https://art-of-breath.github.io/zeitstrahl/

Lokal starten: `python3 -m http.server 4190` in diesem Ordner, dann http://localhost:4190.
Nicht als `file://` öffnen, Module und Service Worker brauchen http.

Schriften: Playfair Display und Raleway, SIL Open Font License (siehe `fonts/`).
