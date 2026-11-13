-- NEXTWAY: identificazione read-only dei registri candidati
-- Eseguire nel SQL Editor di nextway-platform.
-- Legge esclusivamente i cataloghi PostgreSQL: nessuna lettura di righe applicative,
-- nessuna DDL/DML, nessuna modifica a schema o dati.

WITH candidates(schema_name, relation_name) AS (
    VALUES
        ('auth'::text, 'schema_migrations'::text),
        ('realtime'::text, 'schema_migrations'::text),
        ('storage'::text, 'migrations'::text)
)
SELECT
    c.schema_name,
    c.relation_name,
    CASE
        WHEN cls.oid IS NULL THEN 'NOT FOUND'
        ELSE 'FOUND'
    END AS relation_status,
    a.attnum AS column_position,
    a.attname AS column_name,
    CASE
        WHEN a.attnum IS NULL THEN NULL
        ELSE pg_catalog.format_type(a.atttypid, a.atttypmod)
    END AS column_type,
    a.attnotnull AS not_null
FROM candidates c
LEFT JOIN pg_catalog.pg_namespace ns
    ON ns.nspname = c.schema_name
LEFT JOIN pg_catalog.pg_class cls
    ON cls.relnamespace = ns.oid
   AND cls.relname = c.relation_name
   AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = cls.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
ORDER BY
    c.schema_name,
    c.relation_name,
    a.attnum;
