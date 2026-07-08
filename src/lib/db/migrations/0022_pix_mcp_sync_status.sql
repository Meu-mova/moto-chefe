CREATE TABLE "pix_mcp_sync_status" (
  "grupo_id"             uuid PRIMARY KEY REFERENCES "grupos"("id"),
  "ultima_sincronizacao" timestamp with time zone NOT NULL
);
