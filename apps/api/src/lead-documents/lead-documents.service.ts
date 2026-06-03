import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import Anthropic from '@anthropic-ai/sdk';
import { resolveAiModel } from '../ai/resolve-ai-model';

@Injectable()
export class LeadDocumentsService {
  private readonly logger = new Logger('LeadDocumentsService');

  constructor(private readonly prisma: PrismaService) {}

  // =========================================
  // ENDPOINTS PÚBLICOS — Documentos do lead
  // =========================================

  async listDocuments(tenantId: string, leadId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    return this.prisma.leadDocument.findMany({
      where: { leadId, tenantId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async createDocument(
    tenantId: string,
    leadId: string,
    data: {
      tipo: string;
      nome: string;
      participanteNome?: string;
      participanteClassificacao?: string;
      observacao?: string;
    },
    userId: string,
  ) {
    await this.assertLeadAccess(tenantId, leadId);
    const createData: any = {
      leadId,
      tenantId,
      tipo: data.tipo,
      nome: data.nome,
      participanteNome: data.participanteNome ?? null,
      participanteClassificacao: data.participanteClassificacao ?? null,
      observacao: data.observacao ?? null,
      requestedBy: userId,
      processingStatus: 'MANUAL',
      processingStep: 'Documento criado manualmente',
    };
    return this.prisma.leadDocument.create({ data: createData });
  }

  /** Atualiza tipo/participante de doc pendente de revisão */
  async updateDocument(
    tenantId: string,
    leadId: string,
    docId: string,
    data: {
      tipo?: string;
      nome?: string;
      participanteNome?: string | null;
      observacao?: string | null;
      pendingReview?: boolean;
    },
  ) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const upd: any = {};
    if (data.tipo !== undefined) upd.tipo = data.tipo;
    if (data.nome !== undefined) upd.nome = data.nome;
    if ('participanteNome' in data) upd.participanteNome = data.participanteNome ?? null;
    if ('observacao' in data) upd.observacao = data.observacao ?? null;
    if (data.pendingReview !== undefined) {
      upd.pendingReview = data.pendingReview;
      upd.processingStatus = data.pendingReview ? 'PENDENTE_REVISAO' : 'CONCLUIDO';
      upd.processingStep = data.pendingReview ? 'Aguardando revisão humana' : 'Classificação revisada';
    }
    return this.prisma.leadDocument.update({ where: { id: docId }, data: upd });
  }

  // participanteNome null = lead principal; string = participante adicional
  async toggleNaoAplicavel(
    tenantId: string,
    leadId: string,
    tipo: string,
    naoAplicavel: boolean,
    participanteNome: string | null = null,
  ) {
    await this.assertLeadAccess(tenantId, leadId);
    const filter: any = { leadId, tenantId, tipo, participanteNome };
    const existing = await this.prisma.leadDocument.findFirst({ where: filter });
    if (existing) {
      return this.prisma.leadDocument.update({
        where: { id: existing.id },
        data: { naoAplicavel },
      });
    }
    return this.prisma.leadDocument.create({
      data: { leadId, tenantId, tipo, nome: tipo, participanteNome, naoAplicavel },
    });
  }

  async uploadDocument(tenantId: string, leadId: string, docId: string, file: any) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    this.ensureCloudinaryConfigured();

    // Se já tinha arquivo, deleta o antigo
    if (doc.publicId) {
      const rt = doc.mimeType?.startsWith('image/') ? 'image' : 'raw';
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: rt, invalidate: true }).catch(() => {});
    }

    const isImage = file.mimetype.startsWith('image/');
    const result: any = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `via-crm/lead-documents/${tenantId}`,
          resource_type: isImage ? 'image' : 'raw',
          type: 'authenticated', // 🔒 privado — só acessível via URL assinada pelo backend
          use_filename: false,
          unique_filename: true,
        },
        (err, res) => { if (err) return reject(err); resolve(res); },
      ).end(file.buffer);
    });

    return this.prisma.leadDocument.update({
      where: { id: docId },
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        filename: file.originalname,
        mimeType: file.mimetype,
        tamanho: file.size,
        status: 'ENVIADO',
        processingStatus: doc.classificadoPorIA ? doc.processingStatus : 'MANUAL',
        processingStep: doc.classificadoPorIA ? doc.processingStep : 'Upload manual concluído',
      },
    });
  }

  async viewDocument(tenantId: string, leadId: string, docId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({
      where: { id: docId, leadId, tenantId },
      select: { url: true, publicId: true, mimeType: true, filename: true, nome: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado ou sem arquivo');

    const mimeType = doc.mimeType || 'application/octet-stream';
    const rawName = doc.filename || doc.nome || 'documento';
    const filename = this.safeFilename(rawName, mimeType.split('/')[1] || 'bin');

    // Candidatos de URL, em ordem de preferência. O backend baixa e faz streaming,
    // então a URL nunca chega ao cliente — usar a secure_url salva é seguro.
    const candidates: string[] = [];
    if (doc.publicId) {
      const isImage = mimeType.startsWith('image/');
      const resourceType = isImage ? 'image' : 'raw';
      const ext = rawName.includes('.') ? rawName.split('.').pop()! : (mimeType.split('/')[1] || 'bin');
      candidates.push(this.buildSignedCloudinaryDownloadUrl({ publicId: doc.publicId, ext, resourceType }));
    }
    if (doc.url) candidates.push(doc.url); // secure_url já assinada pelo Cloudinary no upload

    if (candidates.length === 0) {
      throw new NotFoundException('Documento não encontrado ou sem arquivo');
    }

    let response: Response | null = null;
    let lastStatus = 0;
    for (const url of candidates) {
      this.logger.log(`viewDocument fetch: ${url.substring(0, 120)}`);
      const r = await fetch(url);
      if (r.ok) { response = r; break; }
      lastStatus = r.status;
      this.logger.error(`viewDocument Cloudinary error: status=${r.status} url=${url.substring(0, 120)}`);
    }

    if (!response) {
      throw new NotFoundException(`Arquivo não disponível no storage (${lastStatus || 404})`);
    }

    const contentLength = response.headers.get('content-length');

    return {
      mimeType,
      filename,
      contentLength: contentLength ? Number(contentLength) : undefined,
      stream: Readable.from(response.body as any),
    };
  }

  async deleteDocument(tenantId: string, leadId: string, docId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    if (doc.publicId) {
      this.ensureCloudinaryConfigured();
      const rt = doc.mimeType?.startsWith('image/') ? 'image' : 'raw';
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: rt, type: 'authenticated', invalidate: true }).catch(() => {});
    }

    await this.prisma.leadDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  // =========================================
  // CLASSIFICAÇÃO EM MASSA COM IA
  // =========================================

  /**
   * Classifica e persiste múltiplos documentos.
   * Fase 1 (síncrona): faz upload de todos para Cloudinary e cria como pendingReview=true → retorna imediatamente.
   * Fase 2 (background): classifica com IA sem bloquear o request.
   */
  async classifyBulkDocuments(tenantId: string, leadId: string, files: any[], userId: string) {
    this.logger.log(`classifyBulk: ${files.length} arquivos, lead=${leadId}`);
    await this.assertLeadAccess(tenantId, leadId);

    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId }, select: { nomeCorreto: true, nome: true } });
    const leadNome = (lead?.nomeCorreto ?? lead?.nome ?? 'Lead').trim();
    const existingParts = await (this.prisma as any).leadParticipante.findMany({ where: { leadId, tenantId }, select: { nome: true } });
    const participantesConhecidos: string[] = existingParts.map((p: any) => p.nome);

    // ── Fase 1: upload paralelo + criação imediata como pendingReview ─────────
    const uploadResults = await Promise.allSettled(
      files.map(file => this.uploadLeadDocBuffer(file, tenantId).then(r => ({ file, ...r }))),
    );

    const uploadErrors: string[] = [];
    const docsParaClassificar: Array<{ docId: string; file: any }> = [];

    for (const result of uploadResults) {
      if (result.status === 'rejected') {
        const failedFile = (result as any)?.reason?.file;
        const fileName = failedFile?.originalname ? `${failedFile.originalname}: ` : '';
        uploadErrors.push(fileName + (result.reason?.message ?? 'Erro no upload'));
        continue;
      }
      const { file, url, publicId } = result.value;
      try {
        const doc = await this.prisma.leadDocument.create({
          data: {
            leadId, tenantId,
            tipo: 'OUTRO',
            nome: file.originalname,
            url, publicId,
            filename: file.originalname,
            mimeType: file.mimetype,
            tamanho: file.size,
            status: 'ENVIADO',
            requestedBy: userId,
            classificadoPorIA: false,
            pendingReview: true,
            processingStatus: 'EM_FILA',
            processingStep: 'Aguardando análise da IA',
            aiSummary: `Arquivo ${file.originalname} recebido e enviado para análise.`,
          },
        });
        docsParaClassificar.push({ docId: doc.id, file });
      } catch (e: any) {
        uploadErrors.push(`${file.originalname}: ${e?.message}`);
      }
    }

    this.logger.log(`classifyBulk fase1: ${docsParaClassificar.length} docs criados, ${uploadErrors.length} erros de upload`);

    // ── Fase 2: classificação em background (não bloqueia o response) ─────────
    setImmediate(() => {
      this.classifyDocsBackground(tenantId, leadId, leadNome, participantesConhecidos, docsParaClassificar)
        .catch(e => this.logger.error(`classifyBulk background erro: ${e?.message}`));
    });

    return {
      pending: docsParaClassificar.length,
      uploadErrors,
      message: `${docsParaClassificar.length} documento(s) enviado(s). Classificação em andamento em segundo plano.`,
    };
  }

  /** Classifica documentos já salvos em background — sem timeout de request */
  private async classifyDocsBackground(
    tenantId: string,
    leadId: string,
    leadNome: string,
    participantesConhecidos: string[],
    docs: Array<{ docId: string; file: any }>,
  ) {
    for (const { docId, file } of docs) {
      try {
        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            processingStatus: 'ANALISANDO',
            processingStep: 'Lendo arquivo, classificando tipo e extraindo nome',
          },
        });

        const cls = await this.classifyDocumentWithAI(file, leadNome, participantesConhecidos);
        const isClassified = cls.tipo !== 'NAO_IDENTIFICADO' && cls.confianca !== 'BAIXA';

        const owner = this.resolveDocumentOwner(leadNome, participantesConhecidos, cls.nomeDetectado);
        let participanteNome = owner.participanteNome;

        if (owner.decision === 'NOVO_PARTICIPANTE' && participanteNome) {
          const existing = await (this.prisma as any).leadParticipante.findFirst({
            where: { leadId, tenantId, nome: participanteNome },
          });
          if (!existing) {
            await (this.prisma as any).leadParticipante.create({
              data: { leadId, tenantId, nome: participanteNome, classificacao: 'OUTRO' },
            });
            participantesConhecidos.push(participanteNome);
          } else {
            participanteNome = existing.nome;
          }
        }

        const pendingReview = !isClassified || owner.decision === 'ALOCACAO_MANUAL';
        const summary = this.buildDocumentProcessingSummary({
          filename: file.originalname,
          tipo: cls.tipo,
          nomeDetectado: cls.nomeDetectado,
          ownerLabel: owner.ownerLabel,
          decision: owner.decision,
          reason: cls.motivo || owner.reason,
          pendingReview,
        });

        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            tipo: isClassified ? cls.tipo : 'OUTRO',
            nome: cls.tipoLabel || file.originalname,
            participanteNome,
            observacao: cls.observacao ?? null,
            classificadoPorIA: true,
            pendingReview,
            processingStatus: pendingReview ? 'PENDENTE_REVISAO' : 'CONCLUIDO',
            processingStep: pendingReview ? 'Aguardando revisão humana' : 'Classificação concluída',
            aiExtractedName: cls.nomeDetectado ?? null,
            aiDecision: owner.decision,
            aiConfidence: cls.confianca,
            aiReason: cls.motivo || owner.reason,
            aiSummary: summary,
            aiExtractedData: cls.cadastroExtraido,
          },
        });
        this.logger.log(`classifyBulk bg: doc=${docId} tipo=${cls.tipo} confianca=${cls.confianca} decision=${owner.decision}`);

        // Auto-fill: preenche campos de cadastro vazios a partir do que a IA extraiu
        if (!pendingReview && Object.keys(cls.cadastroExtraido).length > 0) {
          try {
            if (participanteNome) {
              const part = await (this.prisma as any).leadParticipante.findFirst({
                where: { leadId, tenantId, nome: participanteNome },
              });
              if (part) {
                const partFields = ['cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf'] as const;
                const upd: any = {};
                const origens: Record<string, string | null> = { ...(part.cadastroOrigem ?? {}) };
                for (const f of partFields) {
                  const val = cls.cadastroExtraido[f];
                  if (val !== null && val !== undefined && val !== '' && (part[f] === null || part[f] === undefined || part[f] === '')) {
                    upd[f] = f === 'dataNascimento' ? new Date(String(val)) : val;
                    origens[f] = 'IA';
                  }
                }
                if (Object.keys(upd).length > 0) {
                  await (this.prisma as any).leadParticipante.update({
                    where: { id: part.id },
                    data: { ...upd, cadastroOrigem: origens },
                  });
                  this.logger.log(`classifyBulk bg: auto-fill participante="${participanteNome}" campos=${Object.keys(upd).join(',')}`);
                }
              }
            } else {
              const leadData = await this.prisma.lead.findFirst({
                where: { id: leadId, tenantId },
                select: { cpf: true, rg: true, dataNascimento: true, estadoCivil: true, naturalidade: true, profissao: true, empresa: true, rendaBrutaFamiliar: true, fgts: true, valorEntrada: true, telefone: true, email: true, endereco: true, cep: true, cidade: true, uf: true, cadastroOrigem: true },
              });
              if (leadData) {
                // Mapeamento: campo extraído → campo do lead
                const fieldMap: Record<string, string> = { renda: 'rendaBrutaFamiliar', fgts: 'fgts', valorEntrada: 'valorEntrada' };
                const srcFields = ['cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'fgts', 'valorEntrada', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf'];
                const upd: any = {};
                const origens: Record<string, string | null> = { ...((leadData.cadastroOrigem as any) ?? {}) };
                for (const srcField of srcFields) {
                  const destField = fieldMap[srcField] ?? srcField;
                  const val = cls.cadastroExtraido[srcField];
                  const current = (leadData as any)[destField];
                  if (val !== null && val !== undefined && val !== '' && (current === null || current === undefined || current === '')) {
                    upd[destField] = srcField === 'dataNascimento' ? new Date(String(val)) : val;
                    origens[destField] = 'IA';
                  }
                }
                if (Object.keys(upd).length > 0) {
                  await this.prisma.lead.update({
                    where: { id: leadId },
                    data: { ...upd, cadastroOrigem: origens },
                  });
                  this.logger.log(`classifyBulk bg: auto-fill lead campos=${Object.keys(upd).join(',')}`);
                }
              }
            }
          } catch (autoFillErr: any) {
            this.logger.warn(`classifyBulk bg: auto-fill ignorado doc=${docId}: ${autoFillErr?.message}`);
          }
        }
      } catch (e: any) {
        this.logger.error(`classifyBulk bg erro doc=${docId}: ${e?.message}`);
        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            processingStatus: 'ERRO',
            processingStep: 'Falha durante a análise da IA',
            aiReason: e?.message ?? 'Erro interno ao processar documento',
            aiSummary: `Arquivo ${file.originalname}: erro ao processar na IA. Revisão manual necessária.`,
          },
        }).catch(() => {});
      }
    }
    this.logger.log(`classifyBulk background concluído: ${docs.length} docs processados`);
  }

  // =========================================
  // PREENCHIMENTO DE CADASTRO VIA IA
  // =========================================

  async aiCadastroFill(tenantId: string, leadId: string, participanteNome: string | null) {
    await this.assertLeadAccess(tenantId, leadId);

    const docs = await this.prisma.leadDocument.findMany({
      where: { leadId, tenantId, participanteNome, naoAplicavel: false, url: { not: null } },
    });

    if (docs.length === 0) throw new BadRequestException('Nenhum documento enviado para este participante');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado');
    const client = new Anthropic({ apiKey });

    const model = await resolveAiModel(this.prisma, 'DOC_CLASSIFICATION', { allowDefaultFallback: false });

    const contentBlocks: any[] = [];
    for (const doc of docs) {
      try {
        const res = await fetch(doc.url!);
        const buffer = Buffer.from(await res.arrayBuffer());
        const base64 = buffer.toString('base64');
        const mime = doc.mimeType || 'application/pdf';
        const mediaType = this.claudeMediaType(mime);
        if (!mediaType) continue;

        const isPdf = mime === 'application/pdf';
        contentBlocks.push(
          isPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
            : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        );
        contentBlocks.push({ type: 'text', text: `(Documento: ${doc.nome}${doc.observacao ? ' — ' + doc.observacao : ''})` });
      } catch { /* skip doc unavailable */ }
    }

    if (contentBlocks.length === 0) throw new BadRequestException('Nenhum documento processável encontrado');

    contentBlocks.push({
      type: 'text',
      text: `Extraia as informações pessoais dos documentos acima e responda SOMENTE com JSON (sem markdown):
{
  "cpf": "xxx.xxx.xxx-xx ou null",
  "rg": "número do RG ou null",
  "dataNascimento": "YYYY-MM-DD ou null",
  "estadoCivil": "SOLTEIRO|CASADO|DIVORCIADO|VIUVO|UNIAO_ESTAVEL|SEPARADO ou null",
  "naturalidade": "Cidade-UF ou null",
  "profissao": "profissão ou null",
  "empresa": "nome da empresa ou null",
  "renda": número ou null,
  "endereco": "endereço completo ou null",
  "cep": "xxxxx-xxx ou null",
  "cidade": "cidade ou null",
  "uf": "UF 2 letras ou null",
  "telefone": "número com DDD ou null",
  "email": "email ou null"
}`,
    });

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: contentBlocks }],
      });
      const text = (response.content[0] as any)?.text ?? '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const campos = JSON.parse(clean);

      // Origens: todos os campos não-nulos vêm da IA
      const origens: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(campos)) {
        origens[k] = (v !== null && v !== undefined && v !== '') ? 'IA' : null;
      }

      return { campos, origens };
    } catch (e: any) {
      throw new BadRequestException('Erro ao processar documentos com IA: ' + (e?.message ?? ''));
    }
  }

  // =========================================
  // CLASSIFICAÇÃO INDIVIDUAL (helper interno)
  // =========================================

  /** Classifica um documento via Claude vision */
  private async classifyDocumentWithAI(
    file: any,
    leadNome: string,
    participantesConhecidos: string[] = [],
  ): Promise<{
    tipo: string;
    confianca: string;
    nomeDetectado: string | null;
    tipoLabel: string;
    observacao: string | null;
    motivo: string | null;
    cadastroExtraido: Record<string, any>;
  }> {
    const mediaType = this.claudeMediaType(file.mimetype);
    if (!mediaType) {
      return {
        tipo: 'NAO_IDENTIFICADO',
        confianca: 'BAIXA',
        nomeDetectado: null,
        tipoLabel: file.originalname,
        observacao: null,
        motivo: 'Tipo de arquivo não suportado para leitura pela IA.',
        cadastroExtraido: {},
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado');
    const client = new Anthropic({ apiKey });

    const model = await resolveAiModel(this.prisma, 'DOC_CLASSIFICATION', { allowDefaultFallback: false });

    const base64 = file.buffer.toString('base64');
    const isPdf = mediaType === 'application/pdf';

    const contentBlock: any = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const participantesCtx = participantesConhecidos.length > 0
      ? `Participantes já cadastrados: ${participantesConhecidos.join(' | ')}.`
      : '';

    const prompt = `Analise este documento brasileiro e responda SOMENTE com JSON (sem markdown).

Lead principal: "${leadNome}". ${participantesCtx}

Objetivo:
- identificar o tipo principal do documento
- extrair o nome da pessoa titular do documento, quando aparecer
- resumir em uma frase curta o motivo da classificação

{
  "tipo": "RG_CNH" | "CPF" | "COMP_RESIDENCIA" | "COMP_RENDA" | "FGTS" | "DECL_IR" | "CERT_ESTADO_CIVIL" | "CONTRATO_TRABALHO" | "OUTRO" | "NAO_IDENTIFICADO",
  "confianca": "ALTA" | "MEDIA" | "BAIXA",
  "nomeDetectado": null ou nome completo como aparece no documento,
  "tipoLabel": "descrição resumida (ex: RG de Maria Silva, Holerite 03/2025)",
  "observacao": "info extra: período, mês, data emissão (ou null)",
  "motivo": "frase curta explicando como chegou nessa classificação",
  "cadastroExtraido": {
    "cpf": "xxx.xxx.xxx-xx ou null",
    "rg": "número do RG ou null",
    "dataNascimento": "YYYY-MM-DD ou null",
    "estadoCivil": "SOLTEIRO|CASADO|DIVORCIADO|VIUVO|UNIAO_ESTAVEL|SEPARADO ou null",
    "naturalidade": "Cidade-UF ou null",
    "profissao": "profissão ou null",
    "empresa": "nome da empresa ou null",
    "renda": número ou null,
    "endereco": "endereço completo ou null",
    "cep": "xxxxx-xxx ou null",
    "cidade": "cidade ou null",
    "uf": "UF 2 letras ou null",
    "telefone": "número com DDD ou null",
    "email": "email ou null",
    "fgts": número ou null,
    "valorEntrada": número ou null
  }
}`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 350,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
      });
      const text = (response.content[0] as any)?.text ?? '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        ...parsed,
        cadastroExtraido: this.sanitizeExtractedCadastro(parsed?.cadastroExtraido),
      };
    } catch {
      return {
        tipo: 'NAO_IDENTIFICADO',
        confianca: 'BAIXA',
        nomeDetectado: null,
        tipoLabel: file.originalname,
        observacao: null,
        motivo: 'A IA não conseguiu classificar o documento.',
        cadastroExtraido: {},
      };
    }
  }

  /** Upload de buffer para Cloudinary → retorna { url, publicId } */
  private async uploadLeadDocBuffer(file: any, tenantId: string): Promise<{ url: string; publicId: string }> {
    this.ensureCloudinaryConfigured();
    const isImage = file.mimetype.startsWith('image/');
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `via-crm/lead-documents/${tenantId}`,
          resource_type: isImage ? 'image' : 'raw',
          type: 'authenticated', // 🔒 privado — só acessível via URL assinada pelo backend
          use_filename: false,
          unique_filename: true,
        },
        (err: any, res: any) => {
          if (err) {
            err.file = file;
            return reject(err);
          }
          resolve({ url: res.secure_url, publicId: res.public_id });
        },
      ).end(file.buffer);
    });
  }

  // =========================================
  // HELPERS DE NOME / MATCHING
  // =========================================

  private claudeMediaType(mime: string): string | null {
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';
    if (mime === 'image/png') return 'image/png';
    if (mime === 'image/webp') return 'image/webp';
    if (mime === 'image/gif') return 'image/gif';
    if (mime === 'application/pdf') return 'application/pdf';
    return null;
  }

  private normalizePersonName(name: string | null | undefined): string {
    return String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private personNameTokens(name: string | null | undefined): string[] {
    const stop = new Set(['da', 'de', 'di', 'do', 'dos', 'das', 'e']);
    return this.normalizePersonName(name)
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stop.has(t));
  }

  private nameMatchScore(a: string | null | undefined, b: string | null | undefined): number {
    const normA = this.normalizePersonName(a);
    const normB = this.normalizePersonName(b);
    if (!normA || !normB) return 0;
    if (normA === normB) return 100;

    const tokensA = Array.from(new Set(this.personNameTokens(a)));
    const tokensB = Array.from(new Set(this.personNameTokens(b)));
    if (!tokensA.length || !tokensB.length) return 0;

    const common = tokensA.filter((t) => tokensB.includes(t)).length;
    if (!common) return 0;

    const shortest = Math.max(1, Math.min(tokensA.length, tokensB.length));
    const longest = Math.max(tokensA.length, tokensB.length);
    const coverageShort = common / shortest;
    const coverageLong = common / longest;
    const firstMatch = tokensA[0] === tokensB[0] ? 1 : 0;
    const lastMatch = tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1] ? 1 : 0;
    const contained =
      tokensA.every((t) => tokensB.includes(t)) || tokensB.every((t) => tokensA.includes(t))
        ? 1
        : 0;

    const score = Math.round(
      coverageShort * 70 +
      coverageLong * 15 +
      firstMatch * 5 +
      lastMatch * 5 +
      contained * 5,
    );

    return Math.min(100, score);
  }

  private resolveDocumentOwner(
    leadNome: string,
    participantesConhecidos: string[],
    nomeDetectado: string | null,
  ): {
    participanteNome: string | null;
    ownerLabel: string;
    decision: 'LEAD' | 'PARTICIPANTE_EXISTENTE' | 'NOVO_PARTICIPANTE' | 'ALOCACAO_MANUAL';
    reason: string;
  } {
    const detected = String(nomeDetectado || '').trim();
    if (!detected) {
      return {
        participanteNome: null,
        ownerLabel: 'Alocação manual',
        decision: 'ALOCACAO_MANUAL',
        reason: 'Nenhum nome confiável foi encontrado no documento.',
      };
    }

    const leadScore = this.nameMatchScore(detected, leadNome);
    const bestParticipant = participantesConhecidos
      .map((nome) => ({ nome, score: this.nameMatchScore(detected, nome) }))
      .sort((a, b) => b.score - a.score)[0];

    const bestParticipantScore = bestParticipant?.score ?? 0;
    if (leadScore >= 72 && leadScore >= bestParticipantScore + 5) {
      return {
        participanteNome: null,
        ownerLabel: leadNome,
        decision: 'LEAD',
        reason: `Nome compatível com o lead principal (${leadScore}%).`,
      };
    }

    if (bestParticipant && bestParticipant.score >= 72) {
      return {
        participanteNome: bestParticipant.nome,
        ownerLabel: bestParticipant.nome,
        decision: 'PARTICIPANTE_EXISTENTE',
        reason: `Nome compatível com participante já existente (${bestParticipant.score}%).`,
      };
    }

    return {
      participanteNome: detected,
      ownerLabel: detected,
      decision: 'NOVO_PARTICIPANTE',
      reason: 'Nome encontrado não bate com lead nem participantes existentes; novo participante sugerido.',
    };
  }

  private buildDocumentProcessingSummary(input: {
    filename: string;
    tipo: string;
    nomeDetectado: string | null;
    ownerLabel: string;
    decision: 'LEAD' | 'PARTICIPANTE_EXISTENTE' | 'NOVO_PARTICIPANTE' | 'ALOCACAO_MANUAL';
    reason: string;
    pendingReview: boolean;
  }): string {
    const tipo = input.tipo === 'NAO_IDENTIFICADO' ? 'não identificado' : input.tipo;
    const nome = input.nomeDetectado ? `"${input.nomeDetectado}"` : 'sem nome detectado';

    if (input.pendingReview) {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Encaminhado para revisão manual. ${input.reason}`;
    }

    if (input.decision === 'NOVO_PARTICIPANTE') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Novo participante "${input.ownerLabel}" criado e documento anexado.`;
    }

    if (input.decision === 'PARTICIPANTE_EXISTENTE') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Documento anexado ao participante "${input.ownerLabel}".`;
    }

    if (input.decision === 'LEAD') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Documento anexado ao lead principal "${input.ownerLabel}".`;
    }

    return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Aguardando alocação manual.`;
  }

  private sanitizeExtractedCadastro(input: Record<string, any> | null | undefined): Record<string, any> {
    const allowed = [
      'cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao',
      'empresa', 'renda', 'rendaBrutaFamiliar', 'endereco', 'cep', 'cidade', 'uf',
      'telefone', 'email', 'fgts', 'valorEntrada',
    ];
    const out: Record<string, any> = {};
    for (const key of allowed) {
      const value = input?.[key];
      if (value !== null && value !== undefined && value !== '') out[key] = value;
    }
    return out;
  }

  // =========================================
  // HELPERS DUPLICADOS (também existem em LeadsService)
  // =========================================

  private async assertLeadAccess(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
  }

  private ensureCloudinaryConfigured() {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error(
        'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
      );
    }
  }

  private safeFilename(name: string, fallbackExt: string) {
    const base = (name || '').trim() || `arquivo-${Date.now()}.${fallbackExt}`;
    return base.replace(/[\\/:*?"<>|]/g, '_');
  }

  private buildSignedCloudinaryDownloadUrl(input: {
    publicId: string;
    ext: string;
    resourceType: 'image' | 'video' | 'raw';
  }): string {
    this.ensureCloudinaryConfigured();

    const expiresAt = Math.floor(Date.now() / 1000) + 120; // 2 minutos
    const hasExt = input.ext && input.ext !== 'bin';

    // Recursos raw guardam a extensão NO public_id (ex.: pasta/arquivo.pdf) e o
    // download assinado usa format ''. Para image/video o public_id não tem extensão
    // e o format vai separado. Usa private_download_url (forma comprovada no resto do app).
    if (input.resourceType === 'raw') {
      // O result.public_id do upload raw normalmente já inclui a extensão.
      // Só anexa se ainda não estiver lá — evita "arquivo.pdf.pdf" (404).
      const alreadyHasExt =
        hasExt && input.publicId.toLowerCase().endsWith(`.${input.ext.toLowerCase()}`);
      const rawPublicId = !hasExt || alreadyHasExt ? input.publicId : `${input.publicId}.${input.ext}`;
      return (cloudinary.utils as any).private_download_url(
        rawPublicId,
        '',
        { resource_type: 'raw', type: 'authenticated', expires_at: expiresAt, attachment: false },
      );
    }

    return (cloudinary.utils as any).private_download_url(
      input.publicId,
      hasExt ? input.ext : '',
      { resource_type: input.resourceType, type: 'authenticated', expires_at: expiresAt, attachment: false },
    );
  }
}
