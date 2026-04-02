import { Body, Controller, Delete, Get, Param, Put, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private service: ChannelsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user.tenantId);
  }

  @Get('stats')
  getStats(@Req() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  @Put(':type')
  upsert(
    @Req() req: any,
    @Param('type') type: string,
    @Body() body: { active?: boolean; config?: any; monthlyBudget?: number | null },
  ) {
    return this.service.upsert(req.user.tenantId, type, body);
  }

  @Post(':type/fetch-cost')
  async fetchCost(@Req() req: any, @Param('type') type: string) {
    const channels = await this.service.list(req.user.tenantId);
    const ch = channels.find((c) => c.type === type);
    if (!ch?.id) return { cost: null };

    let cost: number | null = null;
    if (type === 'META_ADS') cost = await this.service.fetchMetaCost(ch.id);
    else if (type === 'GOOGLE_ADS' || type === 'YOUTUBE') cost = await this.service.fetchGoogleCost(ch.id);

    return { cost };
  }

  @Delete(':type')
  remove(@Req() req: any, @Param('type') type: string) {
    return this.service.remove(req.user.tenantId, type);
  }
}
