import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, // Make config available everywhere without importing
      envFilePath: '.env',
    }),
  ],
})
export class ConfigModule {}
