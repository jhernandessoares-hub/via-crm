import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinCadastrosService } from './cadastros.service';
import {
  CreateCategoriaDto,
  CreateContaBancariaDto,
  CreateContatoDto,
  UpdateCategoriaDto,
  UpdateContaBancariaDto,
  UpdateContatoDto,
} from './dto/cadastros.dto';

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinCadastrosController {
  constructor(private readonly service: FinCadastrosService) {}

  // ---------- Categorias ----------

  @Get('categorias')
  listCategorias(@Query('incluirInativas') incluirInativas?: string) {
    return this.service.listCategorias(incluirInativas === 'true');
  }

  @Post('categorias')
  createCategoria(@Body() dto: CreateCategoriaDto) {
    return this.service.createCategoria(dto);
  }

  @Patch('categorias/:id')
  updateCategoria(@Param('id') id: string, @Body() dto: UpdateCategoriaDto) {
    return this.service.updateCategoria(id, dto);
  }

  @Delete('categorias/:id')
  deleteCategoria(@Param('id') id: string) {
    return this.service.deleteCategoria(id);
  }

  // ---------- Contas bancárias ----------

  @Get('contas-bancarias')
  listContas(@Query('incluirInativas') incluirInativas?: string) {
    return this.service.listContasBancarias(incluirInativas === 'true');
  }

  @Post('contas-bancarias')
  createConta(@Body() dto: CreateContaBancariaDto) {
    return this.service.createContaBancaria(dto);
  }

  @Patch('contas-bancarias/:id')
  updateConta(@Param('id') id: string, @Body() dto: UpdateContaBancariaDto) {
    return this.service.updateContaBancaria(id, dto);
  }

  @Delete('contas-bancarias/:id')
  deleteConta(@Param('id') id: string) {
    return this.service.deleteContaBancaria(id);
  }

  // ---------- Contatos ----------

  @Get('contatos')
  listContatos(@Query('incluirInativos') incluirInativos?: string) {
    return this.service.listContatos(incluirInativos === 'true');
  }

  @Post('contatos')
  createContato(@Body() dto: CreateContatoDto) {
    return this.service.createContato(dto);
  }

  @Patch('contatos/:id')
  updateContato(@Param('id') id: string, @Body() dto: UpdateContatoDto) {
    return this.service.updateContato(id, dto);
  }

  @Delete('contatos/:id')
  deleteContato(@Param('id') id: string) {
    return this.service.deleteContato(id);
  }
}
