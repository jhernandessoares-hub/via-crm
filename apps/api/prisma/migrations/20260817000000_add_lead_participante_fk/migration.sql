-- AlterTable: lead_events — adiciona FK opcional para lead_participantes
ALTER TABLE "lead_events" ADD COLUMN "leadParticipanteId" TEXT;

ALTER TABLE "lead_events"
  ADD CONSTRAINT "lead_events_leadParticipanteId_fkey"
  FOREIGN KEY ("leadParticipanteId")
  REFERENCES "lead_participantes"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "lead_events_leadParticipanteId_idx"
  ON "lead_events"("leadParticipanteId");

-- AlterTable: lead_documents — adiciona FK opcional para lead_participantes
ALTER TABLE "lead_documents" ADD COLUMN "leadParticipanteId" TEXT;

ALTER TABLE "lead_documents"
  ADD CONSTRAINT "lead_documents_leadParticipanteId_fkey"
  FOREIGN KEY ("leadParticipanteId")
  REFERENCES "lead_participantes"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "lead_documents_leadParticipanteId_idx"
  ON "lead_documents"("leadParticipanteId");
