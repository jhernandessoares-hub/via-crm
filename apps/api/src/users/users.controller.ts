import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    const user = req.user as any;
    return this.usersService.listByTenant(user.tenantId);
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
}
