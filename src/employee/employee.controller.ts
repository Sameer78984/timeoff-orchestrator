import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Employee Management')
@Controller('employee')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new employee record',
    description: `
Creates a new employee and provisions their initial balance record for the given location.

**Golden Path Step 1:** Create an employee here first. The returned \`id\` is used as \`employeeId\` in all subsequent balance, time-off, and sync endpoints.

> Copy the \`id\` from the response and use it consistently across all other Swagger requests to avoid cross-endpoint ID mismatches.
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Employee created successfully.',
    schema: {
      example: { id: 'emp-001', name: 'Jane Doe', locationId: 'loc-HQ' },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error: Required fields missing or invalid format.' })
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeeService.create(createEmployeeDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all employees',
    description: 'Returns all employee records. Use this to retrieve existing `employeeId` and `locationId` values for use in the balance and time-off endpoints.',
  })
  @ApiResponse({ status: 200, description: 'Array of all employee records.' })
  findAll() {
    return this.employeeService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single employee by ID',
    description: 'Returns the employee record with the given ID.',
  })
  @ApiParam({ name: 'id', description: 'The employee UUID returned from POST /employee', example: 'emp-001' })
  @ApiResponse({ status: 200, description: 'Employee record found.' })
  @ApiResponse({ status: 404, description: 'No employee found with the given ID.' })
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }
}
