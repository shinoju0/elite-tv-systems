# Changelog – Elite TV Systems

Was sich an den 6 Speisekarten-TVs von Eliteburger Bremen geändert hat, neueste Einträge oben.
Das Admin-Panel öffnet sich auf dem Handy unter derselben Adresse wie die TVs.

**Wie neue Versionen live gehen:** Das Deploy-Skript baut das Paket und spielt es auf dem Server aus, die TVs laden innerhalb einer Minute selbst neu. Danach kommt der Stand auch hierher.

---

## 05.11.2026 – Weihnachten

- 🎄 Neuer Effekt **Weihnachten** auf allen 6 TVs (`src/christmas-engine.js`):
  - Christbaumkugeln hängen in den oberen Ecken, goldene Glocken oben, unten Tannenbaum, Schneemann oder Zuckerstange
  - 12 verschiedene Geschenke, verteilt über den unteren Rand, auf keinem TV ein Motiv doppelt
  - dauerhafter Schneefall, gleiche Flocken wie beim Schnee-Effekt
  - alles an Stellen ohne Text, an jedem TV einzeln geprüft (TV 3 auch bei der längsten Überschrift „Double Chili Cheeseburger Menü“)
- Die Deko besteht aus Standbildern (zusammen 164 KB), die sich nicht bewegen. So haben die TV-Prozessoren nur den Schnee und das Video zu tun.
- Quelle: Animationen von LottieFiles (Lottie Simple License, kommerziell nutzbar, ohne Namensnennung), als PNG gerendert in `src/assets/weihnachten/`.
- Neuer Schalter **„🎄 Weihnachten“** ganz oben im Handy-Admin, steht anfangs auf **aus**. Aus = wieder nur Goku & Co.

## 29.10.2026 – Halloween

- 🎃 Neuer Effekt **Halloween** auf allen 6 TVs (`src/halloween-engine.js`):
  - dauerhaft Spinnennetze in den oberen Ecken und glühende Pixel-Kürbisse, je TV an Stellen ohne Text
  - jede Minute ab Sekunde :00: zwei Spinnen krabbeln von TV 1 bis TV 6, ab :03 hüpft auf jedem TV ein großer Kürbis ins Bild, ab :12 seilt sich eine Spinne ab
  - nach ca. 23 s ist alles vorbei, Goku & Co. starten weiterhin bei :30
- Neuer Schalter **„🎃 Halloween“** ganz oben im Handy-Admin. Aus = wieder nur Goku & Co.
- Admin-Panel: Schalter werden bei langen Beschreibungen nicht mehr aus der Karte gedrückt.
- Hinweis: Die Kürbis-/Netz-Positionen sind auf die aktuellen Karten-Videos abgestimmt. Bei neuen Videos prüfen, ob Text verdeckt wird (`DECO` in `src/halloween-engine.js`).

## 26.10.2026 – Dauerbetrieb

- Alle Server-Abfragen der TVs haben ein Zeitlimit von 10 s, damit ein hängender Abruf nichts blockiert.
- Die TVs laden sich jede Nacht zwischen 0 und 1 Uhr einmal neu (nur wenn der Server erreichbar ist und die Seite schon 2 h läuft). Öffnungszeiten 12–23 Uhr bleiben unberührt.

## 25.10.2026 – Animationen und Videos

- Videos werden am Handy beim Hochladen automatisch umgewandelt (H.264, 1080p, 30 fps, ohne Ton), damit sie auf den TVs flüssig laufen.
- Videos werden direkt gestreamt (Wiedergabe aus dem Speicher wurde wieder entfernt, damit blieb das Bild auf TV 2–6 schwarz).
- Animationen im Wechsel alle 2 Minuten ab :30, nie zwei gleichzeitig:
  - **Goku** und **Ruffy** laufen von TV 1 bis TV 6
  - **SpongeBob** taucht klein unten rechts auf TV 6 auf
  - **Gon** erscheint unten in der Mitte von TV 4
- Handy-Admin: alle TVs auf einmal neu laden, PIN-Bildschirm „Elite Systems Login“ mit Logo.
- Mauszeiger und Übersicht-Knopf blenden sich im Vollbild aus, solange niemand die Fernbedienung benutzt.
- Standardbild der Speisekarte mit Titel „Elite Systems“ und Logo.
- Diverse Fehler aus einer Durchsicht behoben.

## 24.10.2026 – Eigener Server

- Firebase ersetzt durch einen eigenen kleinen Server (`server/server.mjs` für lokal).
- **Schneefall** auf allen TVs gleichzeitig (alle 5 Minuten 20 s, im Admin schaltbar).
- Eigenes Hosting mit automatischer Auslieferung neuer Versionen.
- Videos (MP4) können direkt vom Handy hochgeladen werden und laufen in Endlosschleife.

## 24.10.2026 – Ausgangsstand

- Ursprüngliche Version von zemerini01: Digital Signage für 6 TVs, Goku-Lauf über alle Bildschirme, Google-Drive-Videos.
