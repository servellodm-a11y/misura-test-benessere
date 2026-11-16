# NEXTWAY — configurazione commerciale per workspace

## Obiettivo

Il motore NEXTWAY resta unico. Ogni workspace fornisce la propria configurazione commerciale tramite `nextway_workspaces.settings.commercial`. Zinzino è la prima configurazione; una seconda azienda dovrà richiedere soltanto nuovi dati di configurazione, non una copia del motore.

## Contratto JSON

La proprietà `settings.commercial` contiene:

```json
{
  "schema_version": 1,
  "company": {
    "id": "zinzino",
    "name": "Zinzino",
    "sector": ["benessere", "nutrizione", "integrazione alimentare", "vendita diretta"],
    "positioning": "Progetto commerciale nel settore benessere e nutrizione.",
    "country": "Italia",
    "language": "it"
  },
  "search_modifiers": {
    "customers": [["omega 3", "BalanceTest"]],
    "wellness_pro": ["nutrizione", "test acidi grassi"],
    "wellness_networker": ["network marketing wellness"],
    "new_networker": ["iniziare nel network marketing"],
    "other_networker": ["network marketing", "vendita diretta"],
    "exnetworker": ["esperienza network marketing"],
    "entrepreneur": ["imprenditore", "partnership"],
    "side_income": ["attività extra", "lavoro part-time"],
    "business_seeking": ["nuovo progetto imprenditoriale"]
  },
  "consultant_channels": {
    "general_website": {
      "url": "https://misura-test-benessere.netlify.app",
      "label": "Misura Test Benessere",
      "company_branding": "neutro",
      "use": "Primo approfondimento generale sul metodo."
    },
    "company_website": {
      "url": "https://www.zinzino.com/2017234122",
      "label": "Sito replica personale Zinzino",
      "company_branding": "Zinzino",
      "use": "Solo dopo interesse specifico verso Zinzino."
    }
  },
  "official_materials": {
    "product_catalogue": {"status": "da_caricare", "source": "Catalogo ufficiale Italia"},
    "compensation_plan": {"status": "da_caricare", "source": "Piano compensi ufficiale Italia"},
    "product_training": {"status": "da_caricare", "source": "Formazione ufficiale"},
    "compliance_guidelines": {"status": "da_caricare", "source": "Policy e claim autorizzati"},
    "brand_presentation": {"status": "da_caricare", "source": "Presentazione ufficiale"}
  },
  "guardrails": [
    "Non inventare prezzi, commissioni, qualifiche o risultati.",
    "Non formulare promesse di reddito o affermazioni mediche."
  ]
}
```

Il blocco JSON è un modello di struttura: non costituisce un caricamento né un'attivazione del workspace Zinzino.

## Lettura e autorizzazione

La migrazione candidata `20261116140000_nextway_workspace_commercial_config.sql` introduce la RPC read-only `nextway_get_workspace_commercial_config(uuid)`. La funzione:
- richiede un utente autenticato;
- restituisce solo workspace attivi;
- consente platform_admin oppure membership attiva con ruolo owner/admin/manager/member;
- non restituisce l'intero oggetto `settings`, ma soltanto `settings.commercial`;
- non crea o modifica workspace, membership o configurazioni.

Il browser normalizza la risposta tramite `nextway-workspace-commercial-config.js`. Una configurazione mancante o incompleta deve bloccare la ricerca, mai attivare silenziosamente la configurazione di un'altra azienda.

## Segmenti

Il contratto mantiene i nove segmenti già usati dal motore: clienti, professionisti wellness, networker wellness, nuovi networker, networker di altri settori, ex-networker, imprenditori, persone interessate a un'entrata extra e persone alla ricerca di un progetto imprenditoriale.

## Documentazione ufficiale

Catalogo, schede prodotto, test, piano compensi, prezzi, formazione e policy devono essere caricati con versione, mercato e data di validità. Fino a quel momento i materiali sono marcati `da_caricare`: l'AI non deve colmare le lacune con supposizioni.

## Stato e confini

- Migrazione candidata: non applicata.
- Nessun workspace o membership creati.
- Nessun dato Supabase modificato.
- Nessuna Edge Function o Netlify deployata.
- Nessuna ricerca Tavily eseguita e nessun credito consumato.
