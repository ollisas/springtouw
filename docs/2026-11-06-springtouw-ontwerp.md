# Springtouwteller — ontwerp

Datum: 2026-11-06 · Eigenaar: Olivier · Status: ontwerp goedgekeurd in de chat, wacht op review van dit document

## Doel

Een kleine webapp voor Oliviers Android-telefoon die met de voorcamera meekijkt tijdens touwtjespringen
en de sprongen telt. Olivier staat groot in beeld (gespiegeld, schermvullend) met het aantal er groot
doorheen.

Geslaagd als: bij een rustige reeks van ongeveer 50 sprongen wijkt de telling hooguit een paar sprongen af.

## Wat Olivier zei

- Lokaal, op zijn eigen apparaat; uiteindelijk zijn Android-telefoon.
- Camera telt de sprongen; hijzelf groot in beeld met het aantal erdoorheen.
- Extra's: klokje, tempo (sprongen per minuut), beste reeks bewaard (keuze 2).
- Publiceren via GitHub Pages onder ollisas (keuze 1).

## Aannames (in de chat bevestigd met "ja klopt")

- Telefoon staat rechtop, 2 à 3 meter weg, voorcamera naar hem toe, hij staat er van top tot teen op.
- Alles gebeurt op de telefoon zelf. Er wordt geen beeld opgeslagen of verstuurd.

## Scherm

- Camerabeeld vult het scherm, gespiegeld.
- Midden: groot getal, wit met zwarte rand (leesbaar op elke achtergrond).
- Boven links: klokje (m:ss). Boven rechts: tempo "N per min".
- Onder links: "Beste: N". Onder rechts: knop "Opnieuw".
- Melding "Ga iets verder weg staan" als hij niet helemaal in beeld is.
- Startscherm met knop "Start camera" (Chrome vraagt de camera pas na een tik) en een korte uitleg van de opstelling.
- Scherm blijft aan (Wake Lock) zolang de app open staat.

## Tellen

- Lichaamsherkenning: MediaPipe Pose Landmarker (lite-model) in de browser, via CDN; het model wordt bij de
  eerste start gedownload (internet nodig).
- Signaal: de gemiddelde hoogte van schouders en heupen, gedeeld door de romplengte (schouder–heup), zodat
  de afstand tot de camera niet uitmaakt. Licht afgevlakt.
- Een sprong = het signaal gaat duidelijk omhoog en daarna weer omlaag. De drempel past zich aan de
  recente beweging aan, met een vaste ondergrens zodat ademen of wiebelen niet telt.
- Minimaal 0,2 s tussen twee sprongen (max 300 per minuut), zodat één sprong nooit dubbel telt.
- Er wordt alleen geteld als schouders, heupen en enkels goed zichtbaar zijn. Naar de telefoon lopen telt
  dus niet.
- Dubbele doorhalingen (double unders) tellen als één sprong: de app telt sprongen, niet touwslagen.

## Klokje, tempo, beste

- Het getal loopt door tot "Opnieuw". Even stilstaan zet het getal niet op nul.
- Klokje loopt vanaf de eerste sprong en pauzeert na 3 s zonder sprong; loopt weer verder bij de volgende.
- Tempo: berekend uit de laatste sprongen (ongeveer de laatste 5 seconden); toont "–" als hij stilstaat.
- Beste: het hoogste getal ooit bereikt, bewaard op de telefoon (localStorage). "Opnieuw" zet getal en
  klokje op nul, de beste blijft.

## Opbouw

Map `C:\Server\springtouw`, eigen repository `ollisas/springtouw`, gepubliceerd via GitHub Pages
(`https://ollisas.github.io/springtouw`). Geen bouwstap: losse bestanden.

| Bestand | Taak |
|---|---|
| `index.html` | het scherm (camerabeeld, getallen, knoppen) |
| `style.css` | opmaak |
| `app.js` | camera starten, MediaPipe per beeldje draaien, scherm bijwerken, Wake Lock, localStorage |
| `counter.js` | de telregels, los van camera en scherm (alleen getallen in, telling uit) |
| `session.js` | klokje, tempo, beste (los testbaar, krijgt tijden binnen) |
| `manifest.webmanifest` + icoon | "Toevoegen aan startscherm" |
| `test/*.test.js` | tests met `node --test` |

## Foutgevallen

- Geen camera-toestemming: duidelijke melding hoe hij het in Chrome alsnog toestaat.
- Model laadt niet (geen internet): melding "Kan het herkenningsmodel niet laden. Controleer je internet."
- GPU niet beschikbaar: automatisch terugvallen op CPU.

## Testen

- `counter.js` en `session.js` met nagebootste bewegingen: rustige reeks van 50, snelle reeks, stilstaan,
  ademen/wiebelen (mag niet tellen), uit beeld lopen, ruis in het signaal, verschillende afstanden.
- Pagina openen in het Browser-paneel op de server (geen camera daar): controleren dat het startscherm en de
  foutmelding netjes verschijnen en er geen fouten in de console staan.
- De echte proef doet Olivier op zijn telefoon; daarna stellen we de drempels bij.

## Buiten scope

Geluid, doelen, geschiedenis van trainingen, offline werken zonder eerste download, een echte Android-app.
