-- AlterTable ai_agents
ALTER TABLE "ai_agents" ADD COLUMN "templateId" TEXT;
ALTER TABLE "ai_agents" ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_agents" ADD COLUMN "syncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ai_agents_templateId_idx" ON "ai_agents"("templateId");

-- CreateTable agent_templates
CREATE TABLE "agent_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "prompt" TEXT NOT NULL,
    "exampleOutput" TEXT,
    "mode" "AiAgentMode" NOT NULL DEFAULT 'COPILOT',
    "audience" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "isOrchestrator" BOOLEAN NOT NULL DEFAULT false,
    "routingKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_templates_slug_key" ON "agent_templates"("slug");

-- CreateTable agent_template_tools
CREATE TABLE "agent_template_tools" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "AgentToolType" NOT NULL DEFAULT 'WEBHOOK',
    "webhookUrl" TEXT,
    "webhookMethod" TEXT NOT NULL DEFAULT 'POST',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_template_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_template_tools_templateId_idx" ON "agent_template_tools"("templateId");

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "agent_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_template_tools" ADD CONSTRAINT "agent_template_tools_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "agent_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
