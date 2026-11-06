# Springtouwteller

Telt je sprongen met touwtjespringen via de voorcamera van je telefoon. Je staat groot in beeld met het
aantal erdoorheen, plus klokje, tempo (sprongen per minuut) en je beste reeks.

**Openen:** https://ollisas.github.io/springtouw/ in Chrome op je telefoon. Sta de camera toe, en kies in het
menu ⋮ "Toevoegen aan startscherm" voor een eigen icoontje.

**Opstelling:** telefoon rechtop, 2 à 3 meter weg, helemaal in beeld (ook je voeten).

Alles draait op de telefoon zelf: het camerabeeld wordt niet opgeslagen of verstuurd. De lichaamsherkenning
(MediaPipe Pose Landmarker, lite) wordt de eerste keer van internet geladen.

## Voor ontwikkelaars

- `counter.js` — telregels: lichaamspunten → sprongen
- `session.js` — telling, klokje, tempo, beste reeks (localStorage `springtouw.best`)
- `app.js` — camera, MediaPipe en het scherm
- Tests: `npm test` (Node 24, geen afhankelijkheden)
- Lokaal proberen: `python -m http.server 5173` en open http://localhost:5173 (camera werkt alleen op
  localhost of https)
- Ontwerp en plan: `docs/`
