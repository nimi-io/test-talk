import { IsString, IsOptional, IsPhoneNumber } from 'class-validator';

export class MakeCallDto {
  @IsString()
  @IsPhoneNumber()
  to!: string;

  @IsOptional()
  @IsString()
  from?: string;
}
