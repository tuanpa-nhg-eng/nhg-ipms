import { Body, Controller, Get, Put, UnprocessableEntityException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { EgressPolicyService } from './egress-policy.service';
import { DATA_CLASSES, EGRESS_DESTINATIONS } from './egress-policy';

class EgressPolicyDto {
  @IsString() @Length(1, 32) dataClass!: string;
  @IsString() @Length(1, 32) destination!: string;
  @IsBoolean() allowed!: boolean;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}

/**
 * [Last-mile Lát 2] Egress Policy (#9 Responsible AI) — cấu hình tenant CHẶN THÊM
 * egress theo (dataClass, destination). Bất biến pii/confidential⇒mock-only nằm
 * trong ENGINE (egress-policy.ts), không phụ thuộc bảng này.
 */
@Controller('ai/egress-policies')
export class EgressPolicyController {
  constructor(private egress: EgressPolicyService) {}

  @Get()
  @RequirePermission('ai:eval')
  list(@CurrentUser() user: RequestUser) {
    return { policies: this.egress.list(user), dataClasses: DATA_CLASSES, destinations: EGRESS_DESTINATIONS };
  }

  @Put()
  @RequirePermission('ai:eval')
  @Audited('ai_egress_policy.upsert')
  upsert(@CurrentUser() user: RequestUser, @Body() dto: EgressPolicyDto) {
    if (!DATA_CLASSES.includes(dto.dataClass as any)) {
      throw new UnprocessableEntityException(`dataClass phải thuộc ${DATA_CLASSES.join('|')}`);
    }
    if (!EGRESS_DESTINATIONS.includes(dto.destination as any)) {
      throw new UnprocessableEntityException(`destination phải thuộc ${EGRESS_DESTINATIONS.join('|')}`);
    }
    return this.egress.upsert(user, dto.dataClass, dto.destination, dto.allowed, dto.note);
  }
}
