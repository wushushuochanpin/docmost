import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: {} },
        { provide: SpaceAbilityFactory, useValue: {} },
        { provide: EnvironmentService, useValue: {} },
        { provide: ModuleRef, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
