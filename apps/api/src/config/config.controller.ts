import {
  Controller,
  UnauthorizedException,
  UseGuards,
  Req,
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
}
