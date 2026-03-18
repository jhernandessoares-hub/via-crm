import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseController } from './knowledge-base.controller';

describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
