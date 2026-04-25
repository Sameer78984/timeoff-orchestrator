import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from './database.module';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

describe('DatabaseModule', () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should be defined', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    expect(module).toBeDefined();
    const dataSource = module.get<DataSource>(DataSource);
    expect(dataSource).toBeDefined();
    await module.close();
  });

  it('should use :memory: when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    const dataSource = module.get<DataSource>(DataSource);
    expect(dataSource.options.database).toBe(':memory:');
    await module.close();
  });

  it('should use configured database name when NODE_ENV is not test', async () => {
    // We simulate non-test environment
    process.env.NODE_ENV = 'production';
    
    const mockConfigService = {
      get: jest.fn().mockReturnValue('prod.sqlite'),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
    .overrideProvider(ConfigService)
    .useValue(mockConfigService)
    .compile();

    const dataSource = module.get<DataSource>(DataSource);
    // Note: TypeORM might have already initialized with the factory.
    // Testing the options is a good way to verify the factory logic.
    expect(dataSource.options.database).toBe('prod.sqlite');
    expect(mockConfigService.get).toHaveBeenCalledWith('DB_DATABASE', 'timeoff.sqlite');
    
    await module.close();
  });
});
