import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeService } from './employee.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';

describe('EmployeeService', () => {
  let service: EmployeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: getRepositoryToken(Employee), useValue: {} }
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

