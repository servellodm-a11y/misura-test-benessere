# Estrazione locale DDL core NEXTWAY

## Scopo

Questo passaggio estrae dal dump SQL già presente sul Mac soltanto le definizioni DDL pertinenti alle tabelle core NEXTWAY. Lo script non si collega a Supabase e non esegue SQL. Non seleziona sezioni COPY o dati applicativi.

## Prima di iniziare

- Il dump deve essere il file testuale `/tmp/nextway-public-schema.sql` già creato in precedenza.
- Eseguire i comandi dalla cartella principale del repository `misura-test-benessere`, sul branch `fix/nextway-password-recovery`.
- Non occorre avviare Docker, Supabase o PostgreSQL.

## Esecuzione

Aprire Terminale, entrare nella cartella del repository e aggiornare il branch:

```bash
cd ~/Documents/GitHub/misura-test-benessere
git pull --ff-only
python3 scripts/extract-nextway-core-ddl.py
```

Se il dump è in un percorso diverso, indicarlo come primo argomento:

```bash
python3 scripts/extract-nextway-core-ddl.py "/percorso/del/dump.sql"
```

## File prodotto

Lo script crea `/tmp/nextway-core-ddl-extract.sql`.

Mostra a terminale il numero di sezioni e righe estratte. Condividere soltanto questo estratto, non il dump completo. Se il numero di righe è molto elevato, non incollarlo in chat: allegare il file, se possibile.

## Perimetro incluso

- Definizioni e DDL collegata a `profiles`, `partner_details`, `clients`, `nextway_leads`, `nextway_setter_conversations`, `nextway_setter_messages`.
- Alcune tabelle di richiesta/audit core, se presenti nello snapshot.
- Un elenco ristretto di funzioni centrali di amministrazione, audit e conversione.

## Limiti e sicurezza

- Lo script lavora su un dump testuale `pg_dump`; non converte file custom `.dump` o `.backup`.
- Legge solo il file locale e scrive un nuovo file temporaneo. Non modifica il dump originale.
- Non esporta righe di `auth.users`, `storage.objects` o tabelle applicative.
- L’estratto rappresenta lo schema corrente, non una baseline storica. Sarà confrontato con le migrazioni per ricostruire e verificare le definizioni originarie.
- Se il formato non è riconosciuto o non trova oggetti, si ferma senza alterare il dump.