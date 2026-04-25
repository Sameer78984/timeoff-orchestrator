import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /**
   * Returns a basic greeting.
   * 
   * @returns "Hello World!"
   */
  getHello(): string {
    return 'Hello World!';
  }
}
