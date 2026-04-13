import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "./users.service";

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    const user = req.user as any;
    return this.usersService.listByTenant(user.tenantId);
  }

  // ── Team management (OWNER only) ────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('team')
  async inviteMember(@Req() req: any, @Body() body: {
    nome: string;
    email: string;
    senha: string;
    role?: string;
    branchId?: string | null;
  }) {
    requireOwner(req);
    return this.usersService.inviteTeamMember(req.user.tenantId, req.user.sub || req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('team/:id')
  async updateMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { nome?: string; role?: string; ativo?: boolean; branchId?: string | null; senha?: string },
  ) {
    requireOwner(req);
    return this.usersService.updateTeamMember(req.user.tenantId, req.user.sub || req.user.id, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('team/:id')
  async removeMember(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.usersService.removeTeamMember(req.user.tenantId, req.user.sub || req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('branches')
  async listBranches(@Req() req: any) {
    return this.usersService.listBranches(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async getMe(@Req() req: any) {
    return this.usersService.getMe(
      req.user.sub || req.user.id,
      req.user.tenantId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  async updateMe(
    @Req() req: any,
    @Body() body: {
      whatsappNumber?: string | null;
      secretaryName?: string | null;
      secretaryBotName?: string | null;
      secretaryGender?: string;
    },
  ) {
    return this.usersService.updateMe(
      req.user.sub || req.user.id,
      req.user.tenantId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/notifications")
  async getNotifications(@Req() req: any) {
    return this.usersService.getNotificationSettings(
      req.user.sub || req.user.id,
      req.user.tenantId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me/notifications")
  async updateNotifications(
    @Req() req: any,
    @Body() body: { events: string[]; stages: string[] },
  ) {
    return this.usersService.updateNotificationSettings(
      req.user.sub || req.user.id,
      req.user.tenantId,
      body,
    );
  }
}
