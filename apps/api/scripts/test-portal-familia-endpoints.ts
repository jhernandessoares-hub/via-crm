/**
 * Teste local (dev DB) do fluxo do portal de login das famílias (CPF + últimos 4 do telefone):
 *   1. Cria tenant/site/lead/família fixtures.
 *   2. PortalAuthService.login() com CPF+telefone corretos -> token.
 *   3. Login com telefone errado -> rejeitado (mensagem genérica).
 *   4. PortalDemandasService: criar/listar/detalhe (ownership) via família logada.
 *   5. Família de OUTRO tenant não acessa a demanda (ForbiddenException).
 *   6. Família com status INATIVA perde acesso ao login mesmo com CPF+telefone corretos.
 *   7. Cleanup de tudo.
 *
 * NÃO usa o tenant real do SP9 — banco de dev local não tem esse tenant.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { PortalAuthService } from '../src/pre-ocupacao/portal/portal-auth.service';
import { PortalDemandasService } from '../src/pre-ocupacao/portal/portal-demandas.service';
import { DemandasService } from '../src/pre-ocupacao/demandas.service';
import { FamiliasService } from '../src/pre-ocupacao/familias.service';

const prisma = new PrismaClient();

async function main() {
  console.log(`Conectando em: ${(process.env.DATABASE_URL || '').split('@')[1] ?? '(sem DATABASE_URL)'}`);

  const prismaService = prisma as unknown as PrismaService;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const audit = new AuditService(prismaService);
  const familiasService = new FamiliasService(prismaService, audit);
  const demandasService = new DemandasService(prismaService, audit, familiasService);
  const portalAuth = new PortalAuthService(prismaService, jwt, audit);
  const portalDemandas = new PortalDemandasService(prismaService, demandasService);

  const suffix = Date.now();
  const tenant = await prisma.tenant.create({ data: { nome: '[FIXTURE] Portal Familia Test', slug: `fixture-portal-${suffix}` } });
  const outroTenant = await prisma.tenant.create({ data: { nome: '[FIXTURE] Portal Familia Test B', slug: `fixture-portal-b-${suffix}` } });
  const site = await prisma.tenantSite.create({
    data: { tenantId: tenant.id, name: '[FIXTURE] Site Portal', slug: `fixture-site-portal-${suffix}`, siteType: 'INSTITUCIONAL', status: 'PUBLISHED', contentJson: {} },
  });
  console.log(`Tenant=${tenant.id} site.slug=${site.slug}`);

  const lead = await prisma.lead.create({
    data: { tenantId: tenant.id, nome: 'Familia Teste Portal', telefone: '5511999990000', telefoneKey: '511999990000', cpf: '123.456.789-00', dataNascimento: new Date('1990-05-15') },
  });
  const leadOutroTenant = await prisma.lead.create({
    data: { tenantId: outroTenant.id, nome: 'Familia Outro Tenant', telefone: '5511999990001', telefoneKey: '511999990001', cpf: '999.999.999-99', dataNascimento: new Date('1985-01-01') },
  });

  const familia = await familiasService.ativar(tenant.id, lead.id, 'script-teste');
  const familiaOutroTenant = await familiasService.ativar(outroTenant.id, leadOutroTenant.id, 'script-teste');
  console.log(`Familia ativada: numero=${familia.numero}`);

  // 1. Login com CPF+telefone corretos
  const loginOk = await portalAuth.login(site.slug, '12345678900', '0000', '127.0.0.1');
  console.log('Login OK:', JSON.stringify(loginOk));
  if (!loginOk.token) throw new Error('FALHA: login não retornou token');

  // 2. Login com telefone errado
  let rejeitou = false;
  try {
    await portalAuth.login(site.slug, '12345678900', '1234', '127.0.0.1');
  } catch (e: any) {
    rejeitou = true;
    console.log('OK — telefone errado rejeitado:', e.message);
  }
  if (!rejeitou) throw new Error('FALHA: telefone errado não foi rejeitado');

  // 3. Criar demanda como a família logada
  const demanda = await portalDemandas.criar(tenant.id, familia.id, 'Familia Teste Portal', { tipo: 'DUVIDA', observacoes: 'Teste via portal' });
  console.log('Demanda criada:', demanda.id, demanda.origem, demanda.familiaId);
  if (demanda.origem !== 'PORTAL_FAMILIA' || demanda.familiaId !== familia.id) throw new Error('FALHA: demanda não vinculada corretamente');

  // 4. Listar minhas demandas
  const minhas = await portalDemandas.listarMinhas(tenant.id, familia.id);
  console.log(`Demandas da família: ${minhas.length}`);
  if (minhas.length !== 1) throw new Error('FALHA: listarMinhas não retornou a demanda esperada');

  // 5. Detalhe (ownership OK)
  const detalhe = await portalDemandas.detalhe(tenant.id, familia.id, demanda.id);
  console.log('Detalhe OK:', detalhe.id);

  // 6. Família de outro tenant tentando acessar a demanda -> Forbidden
  let forbidden = false;
  try {
    await portalDemandas.detalhe(outroTenant.id, familiaOutroTenant.id, demanda.id);
  } catch (e: any) {
    forbidden = true;
    console.log('OK — acesso cross-tenant/ownership bloqueado:', e.message);
  }
  if (!forbidden) throw new Error('FALHA: outra família conseguiu acessar demanda alheia');

  // 7. Adicionar andamento
  const andamento = await portalDemandas.adicionarAndamento(tenant.id, familia.id, demanda.id, 'Obrigado pelo retorno!', 'Familia Teste Portal');
  console.log('Andamento adicionado:', andamento?.id);

  // 8. Família INATIVA perde acesso ao login
  await prisma.preOcupacaoFamilia.update({ where: { id: familia.id }, data: { status: 'INATIVA' } });
  let bloqueadoInativa = false;
  try {
    await portalAuth.login(site.slug, '12345678900', '0000', '127.0.0.1');
  } catch (e: any) {
    bloqueadoInativa = true;
    console.log('OK — família INATIVA não consegue logar:', e.message);
  }
  if (!bloqueadoInativa) throw new Error('FALHA: família INATIVA ainda consegue logar');

  // Cleanup
  await prisma.preOcupacaoOcorrenciaAndamento.deleteMany({ where: { ocorrencia: { tenantId: tenant.id } } });
  await prisma.preOcupacaoOcorrencia.deleteMany({ where: { tenantId: { in: [tenant.id, outroTenant.id] } } });
  await prisma.tenantPreOcupacaoDemandaCounter.deleteMany({ where: { tenantId: { in: [tenant.id, outroTenant.id] } } });
  await prisma.preOcupacaoFamiliaSession.deleteMany({ where: { familiaId: { in: [familia.id, familiaOutroTenant.id] } } });
  await prisma.preOcupacaoFamilia.deleteMany({ where: { tenantId: { in: [tenant.id, outroTenant.id] } } });
  await prisma.tenantPreOcupacaoFamiliaCounter.deleteMany({ where: { tenantId: { in: [tenant.id, outroTenant.id] } } });
  await prisma.tenantSite.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: [tenant.id, outroTenant.id] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, outroTenant.id] } } });
  console.log('Fixtures removidos. TUDO OK.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
