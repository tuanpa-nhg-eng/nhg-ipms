import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ConfigService } from './config.service';

class CreateVersionDto {
  @IsString() @Length(1, 100) label!: string;
  @IsOptional() @IsString() note?: string;
}

class PublishDto {
  @IsInt() @Min(1) version!: number;
}

class RollbackDto {
  @IsString() @Length(1, 100) label!: string;
}

@Controller('config-versions')
export class ConfigController {
  constructor(private config: ConfigService) {}

  @Get()
  @RequirePermission('config:read')
  list(@CurrentUser() user: RequestUser) {
    return this.config.list(user);
  }

  @Post()
  @RequirePermission('config:write')
  @Audited('config_version.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateVersionDto) {
    return this.config.create(user, dto);
  }

  @Get(':id/diff')
  @RequirePermission('config:read')
  diff(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.diff(user, id);
  }

  /** SoD: config:publish — Designer giữ config:write bị block khi tenant bật sod_rule. */
  @Post(':id/publish')
  @RequirePermission('config:publish')
  publish(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @Req() req: any,
  ) {
    return this.config.publish(user, id, dto.version, req.ip);
  }

  @Post(':id/rollback')
  @RequirePermission('config:write')
  @Audited('config_version.rollback')
  rollback(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RollbackDto,
  ) {
    return this.config.rollback(user, id, dto.label);
  }
}
