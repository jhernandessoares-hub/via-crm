import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinContratosService } from './contratos.service';
import { CreateContratoDto, UpdateContratoDto } from './dto/contratos.dto';

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinContratosController {
  constructor(private readonly service: FinContratosService) {}

  @Get('contratos')
  list(@Query('incluirInativos') incluirInativos?: string) {
    return this.service.list(incluirInativos === 'true');
  }

  @Get('contratos/:id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post('contratos')
  create(@Body() dto: CreateContratoDto) {
    return this.service.create(dto);
  }

  @Patch('contratos/:id')
  update(@Param('id') id: string, @Body() dto: UpdateContratoDto) {
    return this.service.update(id, dto);
  }

  @Delete('contratos/:id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
