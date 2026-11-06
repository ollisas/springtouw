// Foutmeldingen voor de camera, in gewone taal.
export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return (
        'Geen toegang tot de camera. Zet de camera aan voor Chrome: Instellingen › Apps › Chrome › Rechten › ' +
        'Camera. Of tik in Chrome op het icoontje links van het adres.'
      );
    case 'NotReadableError':
    case 'AbortError':
      return 'De camera wordt al door een andere app gebruikt. Sluit die app en tik opnieuw op Start camera.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Geen camera gevonden op dit toestel.';
    default:
      return 'De camera starten lukt niet. Tik opnieuw op Start camera om het nog eens te proberen.';
  }
}
