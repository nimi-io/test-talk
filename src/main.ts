import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable validation pipes
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  
  // Enable CORS for browser clients
  app.enableCors({
    origin: true,
    credentials: true,
  });
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Test Talk Service running on http://localhost:${port}`);
  console.log(`📱 Browser phone interface: http://localhost:${port}/api/v1/test-talk/phone`);
  console.log(`🏥 Health check: http://localhost:${port}/api/v1/test-talk/health`);
}

bootstrap();
