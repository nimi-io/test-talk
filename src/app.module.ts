import { Module } from '@nestjs/common';
import { TestTalkModule } from './modules/test-talk.module';

@Module({
  imports: [TestTalkModule],
})
export class AppModule {}
