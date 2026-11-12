# Elite Systems • Digital Signage Live-Speisekarten

> ## ⚡ Aktueller Stand (Oktober 2026)
> Teile dieser README beschreiben noch den ursprünglichen Firebase-Aufbau. Gültig ist:
>
> - **Kein Firebase mehr.** Ein eigener kleiner Server stellt die Endpunkte unter `/api/…` bereit; `server/server.mjs` (Node) ist die Fassung zum lokalen Testen.
> - **Anordnung:** TV 1 hängt ganz links, TV 6 ganz rechts. Alle 2 Minuten läuft eine Figur von TV 1 nach TV 6, im Wechsel Goku, Ruffy, SpongeBob und Gon (`src/runner-engine.js`; Goku/Ruffy laufen von TV 1 nach TV 6, SpongeBob erscheint klein unten rechts auf TV 6, Gon unten mittig auf TV 4; alle einzeln im Handy-Admin testbar), Schneefall auf allen gleichzeitig (der frühere Glanz-Effekt ist entfernt). Der Übersicht-Knopf im Vollbild erscheint nur kurz nach Eingaben über Fernbedienung oder Maus.
> - **Neue Versionen** laden die TVs innerhalb einer Minute selbst (`src/version-check.js`). Was sich geändert hat, steht in `CHANGELOG.md`.
> - **Diagnose:** `GET /api/clients` mit Admin-PIN zeigt jeden TV mit Nummer, Version und Uhr-Abweichung.

Eine hochperformante, webbasierte Digital-Signage-Lösung für **6 nebeneinander installierte Smart TVs** (optimiert für Hisense VIDAA OS, Tizen, webOS) mit **Firebase Modular SDK v10+** Echtzeit-Synchronisation und einem integrierten **Smartphone-Admin-Panel** im originalgetreuen **Apple Light Mode** (Apple Human Interface Guidelines & Liquid Glass).

---

## 📺 Physischer Aufbau über der Theke
Die 6 Smart TVs hängen horizontal nebeneinander im Querformat (16:9). Die Anordnung ist von links nach rechts:
```text
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Bildschirm 6│ │ Bildschirm 5│ │ Bildschirm 4│ │ Bildschirm 3│ │ Bildschirm 2│ │ Bildschirm 1│
│ (Ganz links)│ │(Position 5) │ │(Position 4) │ │(Position 3) │ │(Position 2) │ │(Ganz rechts)│
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
  ▲                                                                                         │
  └────────────────────────── Welle von Rechts nach Links ──────────────────────────────────┘
```

---

## ✨ Features & Highlights

1. **Apple Human Interface Guidelines Design:**
   - **Apple Light Mode:** Reines Hellgrau (`#F5F5F7`) mit sanftem, warmen Orange-Glow Mesh-Hintergrund, abgestimmt auf das Markenlogo (`#F0820C`).
   - **Liquid Glass Surfaces:** Frosted Glass mit `backdrop-filter: blur(24px) saturate(140%)`, hauchfeinen Rändern und Tiefenschatten.
   - **tvOS Remote Focus Model:** 4-Wege-Steuerkreuz-Navigation (D-Pad) mit weichen Spring-Animationen, Scale-Up und edlem Apple-tvOS-Fokus-Halo.
   - **iOS Components:** Originalgetreue iOS-Schieberegler (Toggle Switch) und iOS-PIN-Sperrbildschirm mit Ziffernblock und Haptik-Feedback.

2. **Synchroner „Schein-Effekt“ (Rechts nach Links):**
   - Zu jeder vollen Minute (exakt bei Sekunde `:00`) gleitet ein edler Glanzstreifen nahtlos über alle 6 Bildschirme.
   - **Timing-Formel für Bildschirm $N$ (1 bis 6):**  
     $$\text{Startzeit} = (N - 1) \times x \text{ Sekunden}$$
     (Standard: $x = 1.5\,\text{s}$, Dauer = $1.5\,\text{s}$).  
     Verlässt der Schein Bildschirm 1 links bei $t = 1.5\,\text{s}$, tritt er nahtlos rechts bei Bildschirm 2 ein.
   - **Globale Zeitsynchronisation:** Automatischer Latenzabgleich via Server-Time-Offset für zehntelsekundengenaue Parallelität.

3. **Smart TV Ansicht & Auto-Boot (Persistenz):**
   - Zentriertes **3x2 Kachel-Grid** für die Bildschirme 1 bis 6.
   - Klick / Enter auf eine Kachel öffnet die Speisekarte im **100% randlosen Vollbild-Modus** (`100vw x 100vh`).
   - Die ausgewählte TV-Nummer wird im `localStorage` gespeichert. Startet der Fernseher neu oder lädt die Seite neu, öffnet sich sofort automatisch der zugewiesene Vollbild-Modus!
   - Erneutes Drücken von **OK / Enter** kehrt in die Übersicht zurück.

4. **TV-Sperre & QR-Code Handoff:**
   - Am TV selbst wird nichts eingestellt. Welchen Bildschirm ein TV zeigt, wählt man in der Übersicht per Kachel. Unter „Optionen“ steht nur der **QR-Code** fürs Smartphone, dort laufen Effekte, Fotos und Videos.

5. **Mobile Smartphone Admin (PIN-geschützt):**
   - Erkennt Smartphones automatisch (< 768px oder `?mode=mobile`).
   - **PIN-Schutz:** Authentischer iOS-Sperrbildschirm, die PIN liegt nur auf dem Server.
   - **Client-Side Image Optimizer:** Fotos vom Smartphone werden direkt im Browser verlustfrei auf gestochen scharfes Full-HD (1920x1080) herunterskaliert.
   - **Live-Cloud-Upload:** Mit Fortschrittsanzeige und sofortiger Aktualisierung auf den Smart TVs ohne Neuladen.
   - **Ehrliche Fehlermeldung:** Klappt ein Upload nicht (zu groß, kein Netz, PIN abgelaufen), steht das auf dem Handy. Gespeichert wird nur, was auf dem Server liegt, damit alle 6 TVs es sehen.

---

## 🚀 Schnellstart (Entwicklungsserver)

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Entwicklungsserver starten
```bash
npm run dev
```
Der Server startet standardmäßig unter:
- **Smart TV Ansicht:** `http://localhost:5173/` (oder `http://<lokale-ip>:5173/?mode=tv`)
- **Smartphone Admin:** `http://localhost:5173/?mode=mobile` (PIN beim lokalen Server über `ADMIN_PIN` selbst festlegen)

---

## ⚙️ Firebase Konfiguration eintragen

Öffne die Datei [`src/firebase-config.js`](file:///Users/leardmucolli/Desktop/LUANA/Elite%20TV%20Systems/src/firebase-config.js) und trage deine Firebase-Projektdaten ein:

```javascript
export const firebaseConfig = {
  apiKey: "DEINE_FIREBASE_API_KEY",
  authDomain: "dein-projekt.firebaseapp.com",
  projectId: "dein-projekt",
  storageBucket: "dein-projekt.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

> 💡 **Demo- & Fallback-Modus:** Solange du die Platzhalter in `src/firebase-config.js` stehen lässt, schaltet die WebApp automatisch in den integrierten Offline-/Lokal-Modus (`localStorage` + `BroadcastChannel`). Du kannst sofort im Browser testen, Screens auswählen und Bilder hochladen!

---

## 🛠️ Dateistruktur

```text
├── public/
│   ├── logo.png               # Das eingebundene Markenlogo von Elite Systems
│   └── default-menus/         # 6 hochauflösende 16:9 SVG-Speisekarten
│       ├── menu-1.svg         # TV 1: Desserts & Coffee (Ganz rechts)
│       ├── menu-2.svg         # TV 2: Pizza & Pasta
│       ├── menu-3.svg         # TV 3: Gourmet Burgers & Fries
│       ├── menu-4.svg         # TV 4: Bowls & Greens
│       ├── menu-5.svg         # TV 5: Grill & Steaks
│       └── menu-6.svg         # TV 6: Cocktails & Drinks (Ganz links)
├── src/
│   ├── assets/                # Goku, Ruffy, SpongeBob, Gon (Build hängt Versionsstempel an)
│   ├── firebase-config.js     # Firebase Initialisierung & Fallback-Erkennung
│   ├── state-manager.js       # Firestore onSnapshot & globale Zeitsynchronisation
│   ├── shine-engine.js        # GPU-beschleunigte Schein-Welle (Rechts nach Links)
│   ├── tv-navigation.js       # Smart TV Fernbedienungs-Steuerkreuz (D-Pad & tvOS Focus)
│   ├── tv-dashboard.js        # 3x2 Grid, Vollbild-Manager & TV-Settings-Modal
│   ├── mobile-admin.js        # iOS-PIN-Sperre & Smartphone Upload-Panel
│   ├── image-compressor.js    # Clientseitige Canvas-Bildoptimierung (1920x1080)
│   └── main.js                # App-Bootstrapper & Viewport-Router
├── index.html                 # PWA- und Smart-TV-optimiertes HTML5
├── style.css                  # Apple Design System & Liquid Glass Stylesheet
└── package.json
```
