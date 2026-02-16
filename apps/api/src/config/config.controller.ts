import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from './config.service';

@UseGuards(AuthGuard('jwt'))
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  private tenantIdOrThrow(req: any) {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new UnauthorizedException('Unauthorized');
    return tenantId;
  }

  @Get('manager-reasons')
  async list(@Req() req: any) {
    const tenantId = this.tenantIdOrThrow(req);
    return this.configService.listManagerReasons(tenantId);
  }

  @Post('manager-reasons')
  async create(
    @Req() req: any,
    @Body() body: { label: string; sortOrder?: number },
  ) {
    const tenantId = this.tenantIdOrThrow(req);
    return this.configService.createManagerReason(
      tenantId,
      body.label,
      body.sortOrder ?? 0,
    );
  }

  @Patch('manager-reasons/:id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      label?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    const tenantId = this.tenantIdOrThrow(req);
    return this.configService.updateManagerReason(tenantId, id, body);
  }
}
