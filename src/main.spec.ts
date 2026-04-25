import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { bootstrap } from './main';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn(),
      setup: jest.fn(),
    },
    DocumentBuilder: jest.fn().mockImplementation(() => ({
      setTitle: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setVersion: jest.fn().mockReturnThis(),
      addTag: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({}),
    })),
  };
});

describe('main.ts', () => {
  let app: any;

  beforeEach(() => {
    app = {
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    (NestFactory.create as jest.Mock).mockResolvedValue(app);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should bootstrap the application', async () => {
    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalled();
    expect(app.useGlobalPipes).toHaveBeenCalled();
    expect(app.useGlobalFilters).toHaveBeenCalled();
    expect(app.useGlobalInterceptors).toHaveBeenCalled();
    expect(SwaggerModule.createDocument).toHaveBeenCalled();
    expect(SwaggerModule.setup).toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalled();
  });

  it('should use default port 3000 if PORT env is not set', async () => {
    const originalPort = process.env.PORT;
    delete process.env.PORT;
    await bootstrap();
    expect(app.listen).toHaveBeenCalledWith(3000);
    process.env.PORT = originalPort;
  });

  it('should use PORT env if set', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '4000';
    await bootstrap();
    expect(app.listen).toHaveBeenCalledWith('4000');
    process.env.PORT = originalPort;
  });
});
