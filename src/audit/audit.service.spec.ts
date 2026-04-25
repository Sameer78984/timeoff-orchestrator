import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { Logger } from '@nestjs/common';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create and save an audit log', async () => {
    const logEntry = { id: '1' };
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockResolvedValue(logEntry);

    service.log(AuditAction.REQUEST_CREATED, 'emp-1', 'req-1', { day: 1 });

    expect(repository.create).toHaveBeenCalledWith({
      action: AuditAction.REQUEST_CREATED,
      employeeId: 'emp-1',
      timeOffRequestId: 'req-1',
      metadata: { day: 1 },
    });
    // save is async fire-and-forget, so we wait a bit or use setImmediate
    await new Promise(resolve => setImmediate(resolve));
    expect(repository.save).toHaveBeenCalledWith(logEntry);
  });

  it('should log error when save fails with a generic error', async () => {
    const logEntry = { id: '1' };
    const error = new Error('Database crash');
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockRejectedValue(error);

    service.log(AuditAction.REQUEST_CREATED, 'emp-1');

    await new Promise(resolve => setImmediate(resolve));
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save audit log: Database crash'),
      error.stack
    );
  });

  it('should suppress error logs for "closed" handle errors in test environment', async () => {
    const logEntry = { id: '1' };
    const error = new Error('Database handle is closed');
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockRejectedValue(error);

    // Ensure we are in test environment (default in Jest)
    process.env.NODE_ENV = 'test';

    service.log(AuditAction.REQUEST_CREATED, 'emp-1');

    await new Promise(resolve => setImmediate(resolve));
    expect(loggerSpy).not.toHaveBeenCalled();
  });

  it('should suppress error logs for "MISUSE" errors in test environment', async () => {
    const logEntry = { id: '1' };
    const error = new Error('SQLITE_MISUSE');
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockRejectedValue(error);

    service.log(AuditAction.REQUEST_CREATED, 'emp-1');

    await new Promise(resolve => setImmediate(resolve));
    expect(loggerSpy).not.toHaveBeenCalled();
  });

  it('should handle missing metadata and IDs', async () => {
    const logEntry = { id: '1' };
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockResolvedValue(logEntry);

    service.log(AuditAction.APPROVED);

    expect(repository.create).toHaveBeenCalledWith({
      action: AuditAction.APPROVED,
      employeeId: undefined,
      timeOffRequestId: undefined,
      metadata: undefined,
    });
  });

  it('should handle null metadata', async () => {
    const logEntry = { id: '1' };
    (repository.create as jest.Mock).mockReturnValue(logEntry);
    (repository.save as jest.Mock).mockResolvedValue(logEntry);

    service.log(AuditAction.APPROVED, 'emp-1', 'req-1', null);

    expect(repository.create).toHaveBeenCalledWith({
      action: AuditAction.APPROVED,
      employeeId: 'emp-1',
      timeOffRequestId: 'req-1',
      metadata: null,
    });
  });
});
