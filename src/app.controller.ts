import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Root endpoint for health check or simple hello-world.
   * 
   * @returns Greeting string.
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
