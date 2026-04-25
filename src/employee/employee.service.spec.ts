import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeService } from './employee.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';

describe('EmployeeService', () => {
  let service: EmployeeService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((employee) => Promise.resolve({ id: 'emp-1', ...employee })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: getRepositoryToken(Employee), useValue: mockRepository }
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an employee', async () => {
    const dto = { firstName: 'John', lastName: 'Doe', email: 'john@example.com', defaultLocationId: 'loc-1' };
    const result = await service.create(dto);
    expect(result).toEqual({ id: 'emp-1', ...dto });
    expect(mockRepository.create).toHaveBeenCalledWith(dto);
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should fetch an employee', async () => {
    const employee = { id: 'emp-1', firstName: 'John' };
    mockRepository.findOne.mockResolvedValue(employee);
    
    const result = await service.findOne('emp-1');
    expect(result).toEqual(employee);
    expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 'emp-1' } });
  });

  it('should throw NotFoundException if employee not found', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    await expect(service.findOne('invalid-id')).rejects.toThrow('Employee with ID invalid-id not found');
  });

  it('should fetch all employees', async () => {
    const result = await service.findAll();
    expect(result).toEqual([]);
    expect(mockRepository.find).toHaveBeenCalled();
  });
});

