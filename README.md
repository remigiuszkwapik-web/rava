# Rava

Persönliche Ausdaueranalyse für Rad & Lauf – als **offline-fähige Web-App (PWA)**.
Aus der Idee des Strava-Analyse-Prompts: einheitlich aufgebautes, datenbasiertes
Feedback zu jeder Einheit – aber mit fixem Interface, gespeicherten Dateien und
wischbaren Vergleichen.

## Features

- **FIT / GPX / TCX** parsen (inkl. `.gz`), komplett im Browser.
- **Strava-Voll-Import**: das Export-ZIP hochladen und die App direkt mit der
  Historie füllen (Duplikate werden übersprungen).
- **Dropbox-Auto-Import**: Wahoo lädt `.fit` nativ zu Dropbox → Rava holt neue
  Fahrten automatisch (OAuth PKCE, ohne Backend).
- **Upload mit Kontextfragen** (Allein/Gruppe, Art, RPE, Wetter) zur Verfeinerung.
- **Mehrere Athletenprofile** mit eigenen Vitalwerten (FTP, Gewicht, HFmax …),
  umschaltbar – jede Person nutzt ihre eigenen Werte.
- **Deterministische Kennzahlen**: NP, IF, TSS, VI, Leistungs-/HF-Zonen,
  Decoupling, VAM/Anstiege, W/kg, Höhenmeter, kcal.
- **Fixiertes Dashboard** (dunkles Telemetrie-Panel): Kacheln, annotierter
  Leistungs-/Puls-Verlauf mit FTP-Linie und Phasen-Bändern, Zonen-Balken,
  Offline-Streckenverlauf.
- **Regelbasiertes Feedback** in 6 Abschnitten – immer offline verfügbar.
- **Hybrid-Coach**: optionaler „Coach-Kommentar“ von Claude, direkt aus dem
  Browser mit eigenem, lokal gespeichertem API-Key.
- **Swipeable Feed** und **Vergleichsansicht** (zwei Einheiten überlagert).
- **PWA**: installierbar, funktioniert offline (Service-Worker + IndexedDB).

Alle Daten bleiben lokal auf dem Gerät (IndexedDB). Kein Server, keine Konten.

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Typecheck + Produktions-Build nach dist/
npm run preview  # dist/ lokal ausliefern
```

## Deployment

Statischer Build in `dist/` – z. B. per GitHub Pages ausliefern (relative
Asset-Pfade, funktioniert unter `/rava/`).

## Coach-Kommentar (optional)

Unter **Einstellungen** einen Anthropic-API-Key eintragen. Der Key wird nur
lokal gespeichert und direkt an die Anthropic-API gesendet
(`anthropic-dangerous-direct-browser-access`). Nur für die persönliche Nutzung
gedacht – keine geteilte Installation mit fremdem Key.

## Dropbox einrichten

1. Unter [dropbox.com/developers](https://www.dropbox.com/developers) eine
   Scoped-App anlegen, den **App-Key** kopieren und diese Seiten-URL als
   Redirect-URI ergänzen.
2. In Rava unter **Einstellungen → Dropbox** den App-Key eintragen, verbinden
   und den Wahoo-Upload-Ordner wählen.
3. In der Wahoo-App **Dropbox** als Upload-Ziel autorisieren – neue Fahrten
   landen dann automatisch in Rava.

## Farbkonzept

Vivider Royal-Blau/Indigo-Look mit **Coral als Signalfarbe** – umgesetzt als
Token-System in `src/styles.css` (`:root`). Vier Ebenen; die Bausteine sind die
Wahrheit, die Rollen-Tokens (`--accent`, `--attention` …) bilden darauf ab, und
UI-Regeln verwenden ausschließlich die Rollen.

**1) Marke – Indigo-Rampe**

| Token | Hex | Einsatz |
| --- | --- | --- |
| `--indigo-300` | `#9aa2ff` | Sekundär-Akzent, Lavendel-Labels (`--accent-soft`) |
| `--indigo-500` | `#4a54ff` | Primär, vivides Royal-Blau, Hero-Oberkante (`--accent`) |
| `--indigo-600` | `#3b41f5` | Primärflächen, Hero-Mitte |
| `--indigo-700` | `#2e33d6` | tief – Hero-Boden, gedrückter Zustand (`--accent-press`) |
| `--indigo-900` | `#1b1f4d` | Hintergrund-Wash oben |

**2) Signal – Coral** (`--attention`)

| Token | Hex | Einsatz |
| --- | --- | --- |
| `--coral` | `#ff5a2e` | Aufmerksamkeit/Rückgang: Fehlermeldungen, Drop-Hover |

**3) Neutral – Fläche & Text:** `--bg #0b0e17`, `--panel #171b33`,
`--line #2b3160`, `--text #eef1f8`, `--muted #9aa3b8`.

**4) Daten** (bewusst außerhalb der Marke, damit Werte lesbar bleiben):
Leistung `--power #f2a93b`, Puls `--hr #e5484d`, Zonen `--z1…--z7`. Die
Canvas-Diagramme in `src/ui/charts.ts` spiegeln dieselben Hex-Werte, da ein
`<canvas>` keine CSS-Variablen kennt – bei Änderungen beide Stellen anpassen.

Kernregel: **Marke = Indigo, Signal = Coral, Daten = eigene Skala.** Puls-Rot
und Coral werden nicht vermischt – so bleibt „Herzfrequenz“ vom UI-Signal
„Achtung“ unterscheidbar.

## Formate & Grenzen

- Screenshots/OCR und eine echte Kartenkachel-Ansicht sind bewusst nicht
  enthalten (Streckenverlauf wird offline als Polyline gezeichnet – eine echte
  Basiskarte lässt sich später nachrüsten).
- Vollautomatische Strava-Webhook-Sync bräuchte ein Backend und ist nicht Teil
  dieser reinen Client-App.
