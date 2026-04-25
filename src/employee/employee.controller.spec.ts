import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('EmployeeController', () => {
  let controller: EmployeeController;
  let service: EmployeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      providers: [
        {
          provide: EmployeeService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<EmployeeController>(EmployeeController);
    service = module.get<EmployeeService>(EmployeeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an employee', async () => {
      const dto = { employeeId: 'emp-1', name: 'John Doe', locationId: 'loc-1' };
      (service.create as jest.Mock).mockResolvedValue(dto);

      const result = await controller.create(dto);
      expect(result).toEqual(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return all employees', async () => {
      const employees = [{ employeeId: 'emp-1' }];
      (service.findAll as jest.Mock).mockResolvedValue(employees);

      const result = await controller.findAll();
      expect(result).toEqual(employees);
    });
  });

  describe('findOne', () => {
    it('should return an employee if found', async () => {
      const employee = { employeeId: 'emp-1' };
      (service.findOne as jest.Mock).mockResolvedValue(employee);

      const result = await controller.findOne('emp-1');
      expect(result).toEqual(employee);
    });

    it('should throw NotFoundException if employee not found', async () => {
      (service.findOne as jest.Mock).mockResolvedValue(null);

      await expect(controller.findOne('emp-1')).rejects.toThrow(NotFoundException);
    });
  });
});
