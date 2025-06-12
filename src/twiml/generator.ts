import * as twilio from 'twilio';

/**
 * Optimized TwiML response generator
 */
export class TwiMLGenerator {
  private static createResponse(): twilio.twiml.VoiceResponse {
    return new twilio.twiml.VoiceResponse();
  }

  static generateOutboundCall(to: string, from: string): string {
    const response = this.createResponse();

    if (to.startsWith('client:')) {
      const dial = response.dial({
        callerId: from,
        timeout: 30,
        answerOnBridge: true,
      });
      dial.client(to.replace('client:', ''));
    } else {
      const dial = response.dial({
        callerId: from,
        timeout: 30,
        answerOnBridge: true,
      });
      dial.number(to);
    }

    return response.toString();
  }

  static generateIncomingCall(clientIdentity?: string | null): string {
    const response = this.createResponse();

    response.say(
      {
        voice: 'alice',
        language: 'en-US',
      },
      'Please hold while we connect your call.'
    );

    const dial = response.dial({
      timeout: 30,
      action: '/api/v1/test-talk/dial-status',
      answerOnBridge: true,
    });

    if (clientIdentity) {
      dial.client(clientIdentity);
    } else {
      response.say(
        {
          voice: 'alice',
          language: 'en-US',
        },
        'Sorry, no one is available to take your call right now. Please try again later.'
      );
    }

    return response.toString();
  }

  static generateDialStatus(dialStatus: string): string {
    const response = this.createResponse();

    switch (dialStatus) {
      case 'no-answer':
      case 'busy':
      case 'failed':
        response.say('The call could not be completed. Please try again later.');
        break;
      case 'completed':
        response.say('Thank you for calling. Goodbye.');
        break;
      default:
        response.say('Call ended.');
    }

    return response.toString();
  }

  static generateErrorResponse(message = 'We are experiencing technical difficulties. Please try again later.'): string {
    const response = this.createResponse();
    response.say({ voice: 'alice', language: 'en-US' }, message);
    return response.toString();
  }
}
