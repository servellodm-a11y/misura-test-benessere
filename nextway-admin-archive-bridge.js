(function () {
  "use strict";

  // La console amministrativa non legge né modifica l'archivio Lead locale.
  // Fornisce soltanto l'interfaccia richiesta da nextway-cloud.js per la sessione.
  if (window.NEXTWAY_LOCAL_ARCHIVE) return;

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let activeUserId = null;

  window.NEXTWAY_LOCAL_ARCHIVE = {
    activate(userId) {
      if (typeof userId !== "string" || !UUID.test(userId)) {
        throw new Error("Profilo autenticato non valido.");
      }
      activeUserId = userId;
    },
    clear() {
      activeUserId = null;
    },
    getOwner() {
      return activeUserId;
    }
  };
})();
