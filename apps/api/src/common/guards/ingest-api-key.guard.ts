import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IngestApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const apiKey = req.headers['x-api-key'];

    const expected = this.config.get<string>('INGEST_API_KEY_FORMS');
    if (!expected) throw new UnauthorizedException('Server missing INGEST_API_KEY_FORMS');

    if (!apiKey || apiKey !== expected) {
      throw new UnauthorizedException('Invalid x-api-key');
    }

    return true;
  }
}
