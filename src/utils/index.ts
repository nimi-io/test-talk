/**
 * Phone number validation utilities
 */
export class PhoneValidator {
  private static readonly PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

  static isValid(phoneNumber: string): boolean {
    return this.PHONE_REGEX.test(phoneNumber);
  }

  static sanitize(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
  }
}

/**
 * Twilio SID validation utilities
 */
export class TwilioValidator {
  static isValidAccountSid(accountSid: string): boolean {
    return accountSid?.startsWith('AC') && accountSid.length === 34;
  }

  static isValidApiKey(apiKey: string): boolean {
    return apiKey?.startsWith('SK') && apiKey.length === 34;
  }

  static isValidAppSid(appSid: string): boolean {
    return appSid?.startsWith('AP') && appSid.length === 34;
  }
}

/**
 * Rate limiting utilities
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; lastAttempt: Date }>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(identifier: string): boolean {
    const now = new Date();
    const attempts = this.attempts.get(identifier);

    if (!attempts) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }

    if (now.getTime() - attempts.lastAttempt.getTime() > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }

    if (attempts.count >= this.maxAttempts) {
      return false;
    }

    attempts.count++;
    attempts.lastAttempt = now;
    return true;
  }

  cleanup(): void {
    const now = new Date();
    const oneHourAgo = now.getTime() - 3600000;

    for (const [key, attempts] of this.attempts.entries()) {
      if (attempts.lastAttempt.getTime() < oneHourAgo) {
        this.attempts.delete(key);
      }
    }
  }

  clear(): void {
    this.attempts.clear();
  }

  getSize(): number {
    return this.attempts.size;
  }
}
