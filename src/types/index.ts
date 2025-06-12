export interface MakeCallDto {
  to: string;
  from?: string;
}

export interface CallStatus {
  CallSid: string;
  CallStatus: string;
  Duration?: string;
  From: string;
  To: string;
  Direction: string;
}

export interface ActiveCall {
  sid: string;
  to: string;
  from: string;
  type: 'browser-to-phone' | 'phone-to-browser';
  status: string;
  createdAt: Date;
  duration?: number;
  lastUpdated?: Date;
}

export interface CallStatistics {
  totalActiveCalls: number;
  callsByStatus: Record<string, number>;
  callsByType: Record<string, number>;
  averageCallDuration: number;
}

export interface RateLimitEntry {
  count: number;
  lastAttempt: Date;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  details: {
    accountSid?: string;
    accountName?: string;
    activeCalls?: number;
    twilioStatus?: string;
    phoneNumber?: string;
    error?: string;
  };
}
