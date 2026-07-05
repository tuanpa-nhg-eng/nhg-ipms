import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
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

@Controller()
export class PersonController {
  constructor(private persons: PersonService) {}

  @Get('persons')
  @RequirePermission('person:read')
  list(@CurrentUser() user: RequestUser) {
    return this.persons.list(user.tenantId);
  }

  @Get('me')
  @RequirePermission('person:read')
  me(@CurrentUser() user: RequestUser) {
    return this.persons.me(user.tenantId, user.claims.person_id);
  }

  @Post('persons')
  @RequirePermission('person:write')
  @Audited('person.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePersonDto) {
    return this.persons.create(user.tenantId, user.claims.sub, dto);
  }
}
