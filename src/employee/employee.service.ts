import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}

  /**
   * Creates a new employee record and persists it to the database.
   * 
   * @param createEmployeeDto DTO containing name and locationId.
   * @returns The newly created Employee entity.
   */
  async create(createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    const employee = this.employeeRepository.create(createEmployeeDto);
    return this.employeeRepository.save(employee);
  }

  /**
   * Retrieves a single employee by their UUID.
   * 
   * @param id Employee UUID.
   * @returns Employee entity.
   * @throws NotFoundException if the employee does not exist.
   */
  async findOne(id: string): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return employee;
  }

  /**
   * Returns a list of all employees in the system.
   * 
   * @returns Array of Employee entities.
   */
  async findAll(): Promise<Employee[]> {
    return this.employeeRepository.find();
  }
}

