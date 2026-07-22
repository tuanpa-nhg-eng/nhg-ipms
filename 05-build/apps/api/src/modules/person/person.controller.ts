import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { PERSON_STATUSES } from '@ipms/shared';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PersonService } from './person.service';

class CreatePersonDto {
  @IsString() @Length(1, 50) employeeCode!: string;
  @IsString() @Length(1, 255) fullName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsIn(PERSON_STATUSES as unknown as string[]) status!: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() managerId?: string;
}

const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

class TeamQueryDto {
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsIn(CADENCES as unknown as string[]) cadence?: string;
  // periodKey đủ mọi cadence: 2026-07 · 2026-W26 · 2026-Q3 · 2026
  @IsOptional() @Matches(/^\d{4}(-(\d{2}|W\d{2}|Q[1-4]))?$/, {
    message: 'periodKey sai định dạng (vd 2026-07, 2026-W26, 2026-Q3, 2026)',
  })
  periodKey?: string;
}

@Controller()
export class PersonController {
  constructor(private persons: PersonService) {}

  @Get('persons')
  @RequirePermission('person:read')
  list(@CurrentUser() user: RequestUser) {
    return this.persons.list(user.tenantId);
  }

  // [Trục A — L1] Roster đội + trạng thái kỳ. Đặt TRƯỚC mọi route 'persons/:x'.
  @Get('persons/team')
  @RequirePermission('person:read')
  team(@CurrentUser() user: RequestUser, @Query() q: TeamQueryDto) {
    return this.persons.team(user, q);
  }

  /**
   * Hồ sơ của chính mình + DANH SÁCH QUYỀN của chính mình.
   *
   * [Trục A — L4] Vì sao trả permissions: JWT chỉ mang sub/tid/email/person_id (F144),
   * nên FE không có cách nào biết người dùng được phép làm gì ⇒ hoặc phải hiện mọi nút
   * rồi để bấm vào ăn 403, hoặc phải đoán theo vai. Cả hai đều vi phạm bất biến "khoá
   * nút TRUNG THỰC kèm lý do" (I3). Cho người dùng biết quyền CỦA CHÍNH HỌ không phải
   * là rò rỉ — server vẫn là nơi gác duy nhất, đây chỉ để giao diện nói thật.
   */
  @Get('me')
  @RequirePermission('person:read')
  async me(@CurrentUser() user: RequestUser) {
    const person = await this.persons.me(user.tenantId, user.claims.person_id);
    return {
      ...(person ?? {}),
      id: person?.id ?? null,
      permissions: [...user.permissions].sort(),
      scopes: user.scopes.map((s) => ({ scopeType: s.scopeType, scopeId: s.scopeId ?? null })),
    };
  }

  @Post('persons')
  @RequirePermission('person:write')
  @Audited('person.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePersonDto) {
    return this.persons.create(user.tenantId, user.claims.sub, dto);
  }
}
