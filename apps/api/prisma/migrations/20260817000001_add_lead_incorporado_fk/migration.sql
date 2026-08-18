-- AlterTable: leads — adiciona FK self-referencial para "incorporação de chat"
-- Um lead absorvido por outro recebe incorporadoEmLeadId apontando para o lead pai.
ALTER TABLE "leads" ADD COLUMN "incorporadoEmLeadId" TEXT;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_incorporadoEmLeadId_fkey"
  FOREIGN KEY ("incorporadoEmLeadId")
  REFERENCES "leads"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "leads_incorporadoEmLeadId_idx"
  ON "leads"("incorporadoEmLeadId");
