import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { TestTalkService } from '../services/test-talk.service';
import { MakeCallDto } from '../dto/make-call.dto';

@Controller('api/v1/test-talk')
export class TestTalkController {
  constructor(private readonly testTalkService: TestTalkService) {}

  @Get('token')
  generateToken(@Query('identity') identity?: string) {
    return this.testTalkService.generateAccessToken(identity);
  }

  @Post('voice')
  @HttpCode(HttpStatus.OK)
  generateVoiceResponse(
    @Body() body: any,
    @Res() res: Response,
  ) {
    const { To, From } = body;
    const twiml = this.testTalkService.generateTwiMLResponse(To, From, 'outbound');
    
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }

  @Post('call')
  async makeCall(
    @Body() makeCallDto: MakeCallDto,
    @Query('baseUrl') baseUrl?: string,
  ) {
    const { to, from = 'browser' } = makeCallDto;
    return this.testTalkService.makeBrowserToPhoneCall(to, from, baseUrl || '');
  }

  @Post('call-status')
  @HttpCode(HttpStatus.OK)
  handleCallStatus(@Body() callStatus: any) {
    this.testTalkService.handleCallStatusUpdate(callStatus);
    return { received: true };
  }

  @Post('dial-status')
  @HttpCode(HttpStatus.OK)
  handleDialStatus(@Body() dialStatus: any, @Res() res: Response) {
    const twiml = this.testTalkService.handleDialStatus(dialStatus);
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }

  @Post('incoming')
  @HttpCode(HttpStatus.OK)
  handleIncomingCall(@Body() body: any, @Res() res: Response) {
    const { From, To } = body;
    const twiml = this.testTalkService.generateIncomingCallTwiML(From, To);
    
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  }

  @Get('calls')
  getActiveCalls() {
    return {
      calls: this.testTalkService.getActiveCalls(),
      statistics: this.testTalkService.getCallStatistics(),
    };
  }

  @Get('calls/status/:status')
  getCallsByStatus(@Param('status') status: string) {
    return this.testTalkService.getCallsByStatus(status);
  }

  @Get('calls/:callSid')
  async getCallDetails(@Param('callSid') callSid: string) {
    if (!callSid) {
      throw new BadRequestException('Call SID is required');
    }
    
    const callDetails = await this.testTalkService.getCallDetails(callSid);
    if (!callDetails) {
      throw new BadRequestException('Call not found');
    }
    
    return callDetails;
  }

  @Post('calls/:callSid/end')
  async endCall(@Param('callSid') callSid: string) {
    const success = await this.testTalkService.endCall(callSid);
    return { success, callSid };
  }

  @Get('statistics')
  getStatistics() {
    return this.testTalkService.getCallStatistics();
  }

  @Get('health')
  async healthCheck() {
    return this.testTalkService.healthCheck();
  }

  @Get('phone')
  getBrowserInterface(@Res() res: Response) {
    const html = this.testTalkService.getBrowserInterface();
    res.set('Content-Type', 'text/html');
    res.send(html);
  }

  @Get('config')
  getConfig() {
    return {
      phoneNumber: this.testTalkService.getPhoneNumber(),
      // Add other non-sensitive config as needed
    };
  }
}
