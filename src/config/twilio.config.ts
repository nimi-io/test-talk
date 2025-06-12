import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as twilio from "twilio";
import { TwilioValidator } from "../utils";

export interface TwilioConfig {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  phoneNumber: string;
}

@Injectable()
export class TwilioConfigService {
  private readonly logger = new Logger(TwilioConfigService.name);
  private readonly config: TwilioConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  private loadConfiguration(): TwilioConfig {
    return {
      accountSid: this.configService.get<string>("twilio.accountSid") || "",
      apiKey: this.configService.get<string>("twilio.apiKey") || "",
      apiSecret: this.configService.get<string>("twilio.apiSecret") || "",
      twimlAppSid: this.configService.get<string>("twilio.twimlAppSid") || "",
      phoneNumber: this.configService.get<string>("twilio.phoneNumber") || "",
    };
  }

  private validateConfiguration(): void {
    const requiredConfigs = [
      {
        key: "accountSid",
        value: this.config.accountSid,
        validator: TwilioValidator.isValidAccountSid,
      },
      {
        key: "apiKey",
        value: this.config.apiKey,
        validator: TwilioValidator.isValidApiKey,
      },
      {
        key: "apiSecret",
        value: this.config.apiSecret,
        validator: (v: string) => v && v.length > 10,
      },
      {
        key: "twimlAppSid",
        value: this.config.twimlAppSid,
        validator: TwilioValidator.isValidAppSid,
      },
      {
        key: "phoneNumber",
        value: this.config.phoneNumber,
        validator: (v: string) => v.startsWith("+"),
      },
    ];

    const missingConfigs = requiredConfigs.filter((c) => !c.value);
    const invalidConfigs = requiredConfigs.filter(
      (c) => c.value && !c.validator(c.value)
    );

    if (missingConfigs.length > 0) {
      const missing = missingConfigs.map((c) => c.key).join(", ");
      this.logger.error(`Missing Twilio configuration: ${missing}`);
      throw new Error("Incomplete Twilio configuration");
    }

    if (invalidConfigs.length > 0) {
      const invalid = invalidConfigs.map((c) => c.key).join(", ");
      this.logger.error(`Invalid Twilio configuration: ${invalid}`);
      throw new Error("Invalid Twilio credentials");
    }

    this.logger.log("Twilio configuration validated successfully");
  }

  getConfig(): TwilioConfig {
    return { ...this.config };
  }

  createClient(): twilio.Twilio {
    return twilio(this.config.accountSid, this.config.apiSecret);
  }

  getCredentialsForToken(): {
    accountSid: string;
    apiKey: string;
    apiSecret: string;
  } {
    return {
      accountSid: this.config.accountSid,
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
    };
  }
}
