import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import * as twilio from 'twilio';
import { TwilioConfigService } from '../config/twilio.config';
import { TwiMLGenerator } from '../twiml/generator';
import { PhoneValidator, RateLimiter } from '../utils';
import {
  ActiveCall,
  CallStatus,
  CallStatistics,
  HealthCheckResult,
} from '../types';

@Injectable()
export class TestTalkService implements OnModuleDestroy {
  private readonly logger = new Logger(TestTalkService.name);
  private readonly twilioClient: twilio.Twilio;
  private readonly activeCalls = new Map<string, ActiveCall>();
  private readonly rateLimiter = new RateLimiter(5, 60000); // 5 calls per minute
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly twilioConfig: TwilioConfigService) {
    try {
      this.twilioClient = this.twilioConfig.createClient();
      this.logger.log('Twilio client initialized successfully');
      
      // Setup periodic cleanup
      this.cleanupInterval = setInterval(() => {
        this.rateLimiter.cleanup();
      }, 300000); // Every 5 minutes
      
    } catch (error) {
      this.logger.error('Twilio initialization error:', error);
      throw new InternalServerErrorException('Unable to connect to Twilio');
    }
  }

  onModuleDestroy() {
    this.cleanup();
  }

  /**
   * Generate JWT access token for browser client
   */
  generateAccessToken(identity = 'user'): { token: string; identity: string } {
    try {
      const { accountSid, apiKey, apiSecret } = this.twilioConfig.getCredentialsForToken();
      const { twimlAppSid } = this.twilioConfig.getConfig();

      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const token = new AccessToken(accountSid, apiKey, apiSecret, {
        identity,
        ttl: 3600, // 1 hour
      });

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true,
      });

      token.addGrant(voiceGrant);

      this.logger.log(`Access token generated for identity: ${identity}`);
      return { token: token.toJwt(), identity };
    } catch (error) {
      this.logger.error('Error generating access token:', error);
      throw new InternalServerErrorException('Failed to generate access token');
    }
  }

  /**
   * Generate TwiML response for different call scenarios
   */
  generateTwiMLResponse(
    to?: string,
    from?: string,
    callType: 'outbound' | 'inbound' = 'outbound',
  ): string {
    try {
      const { phoneNumber } = this.twilioConfig.getConfig();
      
      if (callType === 'outbound' && to) {
        return TwiMLGenerator.generateOutboundCall(to, phoneNumber);
      } else if (callType === 'inbound') {
        const clientIdentity = this.getAvailableClient(from);
        return TwiMLGenerator.generateIncomingCall(clientIdentity);
      }

      return TwiMLGenerator.generateErrorResponse();
    } catch (error) {
      this.logger.error('Error generating TwiML response:', error);
      throw new InternalServerErrorException('Failed to generate TwiML response');
    }
  }

  /**
   * Make a browser-to-phone call
   */
  async makeBrowserToPhoneCall(
    to: string,
    from: string,
    baseUrl: string,
  ): Promise<{ success: boolean; call: any }> {
    try {
      this.validateCallParameters(to, from);

      const sanitizedTo = PhoneValidator.sanitize(to);
      const sanitizedFrom = PhoneValidator.sanitize(from);

      if (!PhoneValidator.isValid(sanitizedTo)) {
        throw new BadRequestException('Invalid destination phone number format');
      }

      if (!this.rateLimiter.check(sanitizedFrom)) {
        throw new BadRequestException('Too many call attempts. Please try again later.');
      }

      const { phoneNumber } = this.twilioConfig.getConfig();
      const webhookBaseUrl = baseUrl || 'http://localhost:3000';

      const call = await this.twilioClient.calls.create({
        url: `${webhookBaseUrl}/api/v1/test-talk/voice`,
        to: sanitizedTo,
        from: phoneNumber,
        statusCallback: `${webhookBaseUrl}/api/v1/test-talk/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        method: 'POST',
      });

      this.trackActiveCall(call.sid, {
        sid: call.sid,
        to: sanitizedTo,
        from: sanitizedFrom,
        type: 'browser-to-phone',
        status: 'initiated',
        createdAt: new Date(),
      });

      this.logger.log(`Call initiated: ${call.sid} from ${sanitizedFrom} to ${sanitizedTo}`);
      return { success: true, call };
    } catch (error) {
      this.logger.error(`Call failed from ${from} to ${to}:`, (error as Error).message);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to make call: ${(error as Error).message}`);
    }
  }

  /**
   * Generate TwiML for incoming calls
   */
  generateIncomingCallTwiML(from: string, to: string): string {
    try {
      if (!from || !to) {
        this.logger.error('Missing from or to parameters for incoming call');
        return TwiMLGenerator.generateErrorResponse('Unable to process call. Missing required information.');
      }

      const sanitizedFrom = PhoneValidator.sanitize(from);
      this.logger.log(`Incoming call from ${sanitizedFrom} to ${to}`);

      const clientIdentity = this.getAvailableClient(sanitizedFrom);
      return TwiMLGenerator.generateIncomingCall(clientIdentity);
    } catch (error) {
      this.logger.error('Error generating incoming call TwiML:', error);
      return TwiMLGenerator.generateErrorResponse();
    }
  }

  /**
   * Handle dial status callbacks
   */
  handleDialStatus(dialStatus: { DialCallStatus: string; CallSid: string }): string {
    try {
      const { DialCallStatus, CallSid } = dialStatus;
      this.logger.log(`Dial status for call ${CallSid}: ${DialCallStatus}`);
      return TwiMLGenerator.generateDialStatus(DialCallStatus);
    } catch (error) {
      this.logger.error('Error handling dial status:', error);
      return TwiMLGenerator.generateErrorResponse('Call ended.');
    }
  }

  /**
   * Handle call status updates from Twilio
   */
  handleCallStatusUpdate(callStatus: CallStatus): void {
    try {
      if (!callStatus?.CallSid) {
        this.logger.error('Invalid call status payload received');
        return;
      }

      const { CallSid, CallStatus: status, Duration, From, To, Direction } = callStatus;

      this.updateActiveCall(CallSid, {
        status,
        duration: Duration ? parseInt(Duration) : undefined,
        lastUpdated: new Date(),
      });

      this.logger.log(
        `Call ${CallSid}: ${status} - Direction: ${Direction}, From: ${From}, To: ${To}${
          Duration ? `, Duration: ${Duration}s` : ''
        }`,
      );

      // Clean up completed calls
      if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) {
        this.activeCalls.delete(CallSid);
        this.logger.log(`Call ${CallSid} removed from active calls`);
      }
    } catch (error) {
      this.logger.error('Error handling call status update:', error);
    }
  }

  /**
   * End a specific call
   */
  async endCall(callSid: string): Promise<boolean> {
    try {
      if (!callSid) {
        this.logger.error('Invalid callSid provided for endCall');
        return false;
      }

      await this.twilioClient.calls(callSid).update({ status: 'completed' });
      this.activeCalls.delete(callSid);
      this.logger.log(`Call ${callSid} ended successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Error ending call ${callSid}:`, error);
      return false;
    }
  }

  /**
   * Get call details by SID
   */
  async getCallDetails(callSid: string): Promise<ActiveCall | null> {
    try {
      if (!callSid) return null;

      const activeCall = this.activeCalls.get(callSid);
      if (activeCall) return activeCall;

      // Fetch from Twilio if not in active calls
      const call = await this.twilioClient.calls(callSid).fetch();
      return {
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        duration: call.duration ? parseInt(call.duration.toString()) : undefined,
        type: call.direction === 'outbound-api' ? 'browser-to-phone' : 'phone-to-browser',
        createdAt: call.dateCreated,
      };
    } catch (error) {
      this.logger.error(`Error fetching call details for ${callSid}:`, error);
      return null;
    }
  }

  /**
   * Get call statistics
   */
  getCallStatistics(): CallStatistics {
    const activeCalls = Array.from(this.activeCalls.values());

    const callsByStatus: Record<string, number> = {};
    const callsByType: Record<string, number> = {};
    let totalDuration = 0;
    let completedCalls = 0;

    activeCalls.forEach((call) => {
      callsByStatus[call.status] = (callsByStatus[call.status] || 0) + 1;
      callsByType[call.type] = (callsByType[call.type] || 0) + 1;

      if (call.status === 'completed' && call.duration) {
        totalDuration += call.duration;
        completedCalls++;
      }
    });

    return {
      totalActiveCalls: activeCalls.length,
      callsByStatus,
      callsByType,
      averageCallDuration: completedCalls > 0 ? totalDuration / completedCalls : 0,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const { accountSid } = this.twilioConfig.getConfig();
      const account = await this.twilioClient.api.accounts(accountSid).fetch();

      return {
        status: 'healthy',
        details: {
          accountSid,
          accountName: account.friendlyName,
          activeCalls: this.activeCalls.size,
          twilioStatus: account.status,
          phoneNumber: this.twilioConfig.getConfig().phoneNumber,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
          accountSid: this.twilioConfig.getConfig().accountSid,
          activeCalls: this.activeCalls.size,
        },
      };
    }
  }

  /**
   * Get browser interface HTML
   */
  getBrowserInterface(): string {
    // Optimized HTML with better structure and modern practices
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twilio Browser Phone</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #0d6efd;
            --success-color: #198754;
            --danger-color: #dc3545;
            --warning-color: #ffc107;
        }
        
        .phone-container {
            max-width: 400px;
            margin: 2rem auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .phone-header {
            background: linear-gradient(135deg, var(--primary-color), #0056b3);
            color: white;
            padding: 1.5rem;
            text-align: center;
        }
        
        .phone-body {
            padding: 1.5rem;
        }
        
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-ready { background: var(--success-color); }
        .status-connecting { background: var(--warning-color); }
        .status-error { background: var(--danger-color); }
        
        .number-display {
            font-size: 1.5rem;
            text-align: center;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 10px;
            margin-bottom: 1rem;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .keypad {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
            margin: 1rem 0;
        }
        
        .keypad button {
            aspect-ratio: 1;
            border: none;
            background: #f8f9fa;
            border-radius: 10px;
            font-size: 1.2rem;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        
        .keypad button:hover {
            background: #e9ecef;
            transform: translateY(-2px);
        }
        
        .keypad button:active {
            transform: translateY(0);
        }
        
        .call-controls {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin: 1.5rem 0;
        }
        
        .call-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            font-size: 1.5rem;
            transition: all 0.2s ease;
        }
        
        .call-btn:hover {
            transform: scale(1.1);
        }
        
        .btn-call {
            background: var(--success-color);
            color: white;
        }
        
        .btn-hangup {
            background: var(--danger-color);
            color: white;
        }
        
        .call-info {
            background: #e3f2fd;
            border-radius: 10px;
            padding: 1rem;
            text-align: center;
            margin: 1rem 0;
        }
        
        .log-container {
            background: #1e1e1e;
            color: #ffffff;
            border-radius: 10px;
            padding: 1rem;
            font-family: 'Courier New', monospace;
            font-size: 0.8rem;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .incoming-call-modal {
            animation: shake 0.5s ease-in-out infinite;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
    </style>
</head>
<body class="bg-light">
    <div class="container">
        <div class="phone-container">
            <div class="phone-header">
                <h4 class="mb-2"><i class="fas fa-phone"></i> Browser Phone</h4>
                <div id="deviceStatus">
                    <span class="status-indicator status-connecting"></span>
                    <small id="statusText">Connecting...</small>
                </div>
            </div>
            
            <div class="phone-body">
                <div class="number-display" id="numberDisplay">Enter number</div>
                
                <div class="keypad">
                    <button onclick="addDigit('1')">1</button>
                    <button onclick="addDigit('2')">2<br><small>ABC</small></button>
                    <button onclick="addDigit('3')">3<br><small>DEF</small></button>
                    <button onclick="addDigit('4')">4<br><small>GHI</small></button>
                    <button onclick="addDigit('5')">5<br><small>JKL</small></button>
                    <button onclick="addDigit('6')">6<br><small>MNO</small></button>
                    <button onclick="addDigit('7')">7<br><small>PQRS</small></button>
                    <button onclick="addDigit('8')">8<br><small>TUV</small></button>
                    <button onclick="addDigit('9')">9<br><small>WXYZ</small></button>
                    <button onclick="addDigit('*')">*</button>
                    <button onclick="addDigit('0')">0</button>
                    <button onclick="addDigit('#')">#</button>
                </div>
                
                <div class="call-controls">
                    <button id="callBtn" class="call-btn btn-call" onclick="makeCall()" disabled>
                        <i class="fas fa-phone"></i>
                    </button>
                    <button id="hangupBtn" class="call-btn btn-hangup" onclick="hangupCall()" style="display: none;">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                    <button class="call-btn" style="background: #6c757d; color: white;" onclick="clearLastDigit()">
                        <i class="fas fa-backspace"></i>
                    </button>
                </div>
                
                <div id="callInfo" class="call-info" style="display: none;">
                    <div><strong>Calling:</strong> <span id="callingNumber"></span></div>
                    <div><strong>Duration:</strong> <span id="callDuration">00:00</span></div>
                </div>
                
                <div class="log-container">
                    <div><strong>Device Log</strong></div>
                    <div id="log"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Incoming Call Modal -->
    <div class="modal fade" id="incomingCallModal" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content incoming-call-modal">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">
                        <i class="fas fa-phone-alt"></i> Incoming Call
                    </h5>
                </div>
                <div class="modal-body text-center">
                    <h3 id="incomingNumber">Unknown Number</h3>
                    <p class="text-muted">is calling you...</p>
                </div>
                <div class="modal-footer justify-content-center">
                    <button class="call-btn btn-call" onclick="acceptCall()">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="call-btn btn-hangup" onclick="rejectCall()">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://media.twiliocdn.com/sdk/js/client/v1.8/twilio.min.js"></script>
    <script>
        class BrowserPhone {
            constructor() {
                this.device = null;
                this.currentConnection = null;
                this.callTimer = null;
                this.callStartTime = null;
                this.phoneNumber = '';
                this.incomingCallModal = null;
                
                this.init();
            }
            
            async init() {
                this.incomingCallModal = new bootstrap.Modal(document.getElementById('incomingCallModal'));
                await this.initializeTwilioDevice();
            }
            
            async initializeTwilioDevice() {
                try {
                    this.log('Requesting access token...');
                    
                    const response = await fetch('./token');
                    const data = await response.json();
                    
                    this.log('Initializing device...');
                    
                    this.device = new Twilio.Device(data.token, {
                        codecPreferences: ["opus", "pcmu"],
                        fakeLocalDTMF: true,
                        enableRingingState: true,
                    });
                    
                    this.setupDeviceEventListeners();
                    
                } catch (error) {
                    this.log('Error: ' + error.message);
                    this.updateStatus('error', 'Connection failed');
                }
            }
            
            setupDeviceEventListeners() {
                this.device.on('ready', () => {
                    this.log('Device ready!');
                    this.updateStatus('ready', 'Ready');
                    document.getElementById('callBtn').disabled = false;
                });
                
                this.device.on('error', (error) => {
                    this.log('Device error: ' + error.message);
                    this.updateStatus('error', 'Error');
                });
                
                this.device.on('connect', (conn) => {
                    this.log('Call connected!');
                    this.currentConnection = conn;
                    this.showCallControls(true);
                    this.startCallTimer();
                });
                
                this.device.on('disconnect', () => {
                    this.log('Call ended');
                    this.currentConnection = null;
                    this.showCallControls(false);
                    this.stopCallTimer();
                    this.incomingCallModal.hide();
                });
                
                this.device.on('incoming', (conn) => {
                    this.log('Incoming call from ' + conn.parameters.From);
                    this.currentConnection = conn;
                    this.showIncomingCall(conn.parameters.From);
                });
            }
            
            addDigit(digit) {
                this.phoneNumber += digit;
                this.updateDisplay();
            }
            
            clearLastDigit() {
                this.phoneNumber = this.phoneNumber.slice(0, -1);
                this.updateDisplay();
            }
            
            updateDisplay() {
                const display = document.getElementById('numberDisplay');
                display.textContent = this.phoneNumber || 'Enter number';
            }
            
            makeCall() {
                if (!this.phoneNumber) {
                    alert('Please enter a phone number');
                    return;
                }
                
                if (!this.device) {
                    alert('Device not ready');
                    return;
                }
                
                try {
                    this.log('Calling ' + this.phoneNumber + '...');
                    document.getElementById('callingNumber').textContent = this.phoneNumber;
                    
                    this.currentConnection = this.device.connect({ To: this.phoneNumber });
                    
                } catch (error) {
                    this.log('Error making call: ' + error.message);
                }
            }
            
            hangupCall() {
                if (this.device && this.currentConnection) {
                    this.log('Hanging up...');
                    this.device.disconnectAll();
                }
            }
            
            acceptCall() {
                if (this.currentConnection) {
                    this.log('Accepted call');
                    this.currentConnection.accept();
                    this.incomingCallModal.hide();
                }
            }
            
            rejectCall() {
                if (this.currentConnection) {
                    this.log('Rejected call');
                    this.currentConnection.reject();
                    this.incomingCallModal.hide();
                }
            }
            
            showIncomingCall(fromNumber) {
                document.getElementById('incomingNumber').textContent = fromNumber;
                this.incomingCallModal.show();
            }
            
            showCallControls(inCall) {
                const callBtn = document.getElementById('callBtn');
                const hangupBtn = document.getElementById('hangupBtn');
                const callInfo = document.getElementById('callInfo');
                
                if (inCall) {
                    callBtn.style.display = 'none';
                    hangupBtn.style.display = 'inline-block';
                    callInfo.style.display = 'block';
                } else {
                    callBtn.style.display = 'inline-block';
                    hangupBtn.style.display = 'none';
                    callInfo.style.display = 'none';
                }
            }
            
            startCallTimer() {
                this.callStartTime = new Date();
                this.callTimer = setInterval(() => this.updateCallDuration(), 1000);
            }
            
            stopCallTimer() {
                if (this.callTimer) {
                    clearInterval(this.callTimer);
                    this.callTimer = null;
                }
            }
            
            updateCallDuration() {
                if (this.callStartTime) {
                    const duration = Math.floor((new Date() - this.callStartTime) / 1000);
                    const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
                    const seconds = (duration % 60).toString().padStart(2, '0');
                    document.getElementById('callDuration').textContent = minutes + ':' + seconds;
                }
            }
            
            updateStatus(status, message) {
                const statusIndicator = document.querySelector('.status-indicator');
                const statusText = document.getElementById('statusText');
                
                statusIndicator.className = 'status-indicator status-' + status;
                statusText.textContent = message;
            }
            
            log(message) {
                const logDiv = document.getElementById('log');
                const timestamp = new Date().toLocaleTimeString();
                logDiv.innerHTML += '<div>[' + timestamp + '] ' + message + '</div>';
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        }
        
        // Global functions for onclick handlers
        let phone;
        
        document.addEventListener('DOMContentLoaded', () => {
            phone = new BrowserPhone();
        });
        
        function addDigit(digit) { phone.addDigit(digit); }
        function clearLastDigit() { phone.clearLastDigit(); }
        function makeCall() { phone.makeCall(); }
        function hangupCall() { phone.hangupCall(); }
        function acceptCall() { phone.acceptCall(); }
        function rejectCall() { phone.rejectCall(); }
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (phone && phone.device) {
                phone.device.disconnectAll();
            }
        });
    </script>
</body>
</html>`;
  }

  // Public getters
  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  getCallsByStatus(status: string): ActiveCall[] {
    return this.getActiveCalls().filter(call => call.status === status);
  }

  getOldestActiveCall(): ActiveCall | null {
    const calls = this.getActiveCalls();
    if (calls.length === 0) return null;

    return calls.reduce((oldest, current) =>
      current.createdAt < oldest.createdAt ? current : oldest
    );
  }

  getPhoneNumber(): string {
    return this.twilioConfig.getConfig().phoneNumber;
  }

  // Private helper methods
  private validateCallParameters(to: string, from: string): void {
    if (!to || !from) {
      throw new BadRequestException('Both to and from parameters are required');
    }
  }

  private trackActiveCall(callSid: string, callData: ActiveCall): void {
    this.activeCalls.set(callSid, callData);
  }

  private updateActiveCall(callSid: string, updates: Partial<ActiveCall>): void {
    const existingCall = this.activeCalls.get(callSid);
    if (existingCall) {
      this.activeCalls.set(callSid, { ...existingCall, ...updates });
    }
  }

  private getAvailableClient(from?: string): string | null {
    // Simple implementation - in production, implement proper routing logic
    return 'user';
  }

  private cleanup(): void {
    try {
      this.logger.log('Cleaning up TestTalkService...');
      
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      this.activeCalls.clear();
      this.rateLimiter.clear();
      
      this.logger.log('TestTalkService cleanup completed');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
}
