import { Injectable } from '@nestjs/common';
import { ConteudoService } from '../conteudo.service';

/** Camada read-only sobre ConteudoService — família só vê conteúdo não-oculto. */
@Injectable()
export class PortalConteudoService {
  constructor(private readonly conteudo: ConteudoService) {}

  async listar(tenantId: string) {
    return this.conteudo.listarVisiveis(tenantId);
  }
}
