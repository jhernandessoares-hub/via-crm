import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestApiKeyGuard } from '../common/guards/ingest-api-key.guard';

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @UseGuards(IngestApiKeyGuard)
  @Post('/ingest/form')
  async ingestForm(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    if (!tenantId) {
      return { ok: false, message: 'Faltou header x-tenant-id' };
    }

    const result = await this.ingestService.ingestLead({
      tenantId,
      channel: 'form',
      payload: body,
    });

    return { ok: true, result };
  }

  @UseGuards(IngestApiKeyGuard)
  @Post('/ingest/site')
  async ingestSite(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    if (!tenantId) {
      return { ok: false, message: 'Faltou header x-tenant-id' };
    }

    const result = await this.ingestService.ingestLead({
      tenantId,
      channel: 'site',
      payload: body,
    });

    return { ok: true, result };
  }

  @UseGuards(IngestApiKeyGuard)
  @Post('/webhooks/meta/leads')
  async ingestMetaLeads(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    if (!tenantId) {
      return { ok: false, message: 'Faltou header x-tenant-id' };
    }

    const result = await this.ingestService.ingestLead({
      tenantId,
      channel: 'meta_leads',
      payload: body,
    });

    return { ok: true, result };
  }

  @UseGuards(IngestApiKeyGuard)
  @Post('/webhooks/whatsapp')
  async ingestWhatsapp(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    if (!tenantId) {
      return { ok: false, message: 'Faltou header x-tenant-id' };
    }

    const result = await this.ingestService.ingestLead({
      tenantId,
      channel: 'whatsapp',
      payload: body,
    });

    return { ok: true, result };
  }
}
