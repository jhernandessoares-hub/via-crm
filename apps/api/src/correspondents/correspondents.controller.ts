import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { CorrespondentAuthGuard } from './correspondent-auth.guard';
import { CorrespondentsService } from './correspondents.service';

// ── Platform Admin: gerencia correspondentes ──────────────────────────────────

@Controller('admin/correspondents')
@UseGuards(PlatformAdminGuard)
export class AdminCorrespondentsController {
  constructor(private readonly svc: CorrespondentsService) {}

  @Get()    list()                                { return this.svc.list(); }
  @Get(':id') findOne(@Param('id') id: string)  { return this.svc.findOne(id); }
  @Post()   create(@Body() body: any)            { return this.svc.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}

// ── Auth do correspondente ────────────────────────────────────────────────────

@Controller('correspondent/auth')
export class CorrespondentAuthController {
  constructor(private readonly svc: CorrespondentsService) {}

  @Post('login')
  login(@Body() body: { email: string; senha: string }) {
    return this.svc.login(body.email, body.senha);
  }

  @Get('me')
  @UseGuards(CorrespondentAuthGuard)
  me(@Req() req: any) {
    return this.svc.me(req.correspondent.sub);
  }
}

// ── Tenant: lista correspondentes disponíveis para enviar lead ────────────────

@Controller('correspondents')
@UseGuards(JwtAuthGuard)
export class TenantCorrespondentsController {
  constructor(private readonly svc: CorrespondentsService) {}

  @Get()
  listActive() {
    return this.svc.list().then((list) => list.filter((c) => c.ativo));
  }
}
