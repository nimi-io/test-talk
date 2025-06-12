import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TestTalkController } from '../controllers/test-talk.controller';
import { TestTalkService } from '../services/test-talk.service';
import { TwilioConfigService } from '../config/twilio.config';

// Configuration loader
const twilioConfig = () => ({
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
});

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [twilioConfig],
      isGlobal: true,
      cache: true,
    }),
  ],
  controllers: [TestTalkController],
  providers: [TestTalkService, TwilioConfigService],
  exports: [TestTalkService],
})
export class TestTalkModule {}
