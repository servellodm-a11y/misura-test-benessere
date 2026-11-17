-- NEXTWAY | IDENTIFICAZIONE REGISTRI - REPORT IN UNA SOLA CELLA
-- Solo metadati pg_catalog: non legge righe delle tabelle candidate.
-- Nessuna modifica al database.

WITH candidates(schema_name, table_name) AS (
    VALUES
      ('auth', 'schema_migrations'),
      ('realtime', 'schema_migrations'),
      ('storage', 'migrations')
),
details AS (
    SELECT
      c.schema_name,
      c.table_name,
      to_regclass(format('%I.%I', c.schema_name, c.table_name)) AS relation_oid,
      (
        SELECT string_agg(
          format('%s %s%s',
            a.attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod),
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
          ),
          ', ' ORDER BY a.attnum
        )
        FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = to_regclass(format('%I.%I', c.schema_name, c.table_name))
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS columns
    FROM candidates c
)
SELECT
  'NEXTWAY - STRUTTURA REGISTRI CANDIDATI' || E'\n\n' ||
  string_agg(
    schema_name || '.' || table_name || ': ' ||
    CASE
      WHEN relation_oid IS NULL THEN 'NON PRESENTE'
      ELSE 'PRESENTE; colonne: ' || COALESCE(columns, 'nessuna colonna leggibile')
    END,
    E'\n' ORDER BY schema_name, table_name
  ) || E'\n\n' ||
  'NOTA: sono stati letti solo metadati; nessuna riga delle tabelle è stata consultata.' AS report
FROM details;
