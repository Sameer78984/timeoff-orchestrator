import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { ConflictException, Logger } from '@nestjs/common';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: Repository<IdempotencyRecord>;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyRecord),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repository = module.get<Repository<IdempotencyRecord>>(getRepositoryToken(IdempotencyRecord));
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkOrRecord', () => {
    it('should return null if no record exists', async () => {
      (repository.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.checkOrRecord('key-1', { foo: 'bar' });
      expect(result).toBeNull();
    });

    it('should return cached response if record exists with same payload hash', async () => {
      const payload = { foo: 'bar' };
      const hash = service.generateHash(payload);
      (repository.findOne as jest.Mock).mockResolvedValue({
        requestPayloadHash: hash,
        responseData: { success: true },
      });

      const result = await service.checkOrRecord('key-1', payload);
      expect(result).toEqual({ success: true });
    });

    it('should throw ConflictException if record exists with different payload hash', async () => {
      const payload = { foo: 'bar' };
      (repository.findOne as jest.Mock).mockResolvedValue({
        requestPayloadHash: 'different-hash',
      });

      await expect(service.checkOrRecord('key-1', payload)).rejects.toThrow(ConflictException);
    });
  });

  describe('saveResult', () => {
    it('should save the response data', async () => {
      const key = 'key-1';
      const payload = { foo: 'bar' };
      const responseData = { success: true };
      const record = { key, requestPayloadHash: service.generateHash(payload), responseData };

      (repository.create as jest.Mock).mockReturnValue(record);
      (repository.save as jest.Mock).mockResolvedValue(record);

      await service.saveResult(key, payload, responseData);

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(record);
    });

    it('should log error if save fails', async () => {
      const error = new Error('Unique constraint violation');
      (repository.save as jest.Mock).mockRejectedValue(error);

      await service.saveResult('key-1', {}, {});

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save idempotency result for key key-1'),
        error.stack
      );
    });
  });
});
