import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalStatus, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NAME_MESSAGE, NAME_RULE } from '../auth/dto/auth.dto';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  @Matches(NAME_RULE, { message: NAME_MESSAGE })
  name?: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
}
class ApprovalDto {
  @IsEnum(ApprovalStatus) approvalStatus!: ApprovalStatus;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  findAll(
    @Query('role') role?: Role,
    @Query('status') status?: ApprovalStatus,
    @Query('take', new DefaultValuePipe(100), ParseIntPipe) take?: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
  ) { return this.users.findAll(role, status, take, skip); }

  @Roles(Role.ADMIN)
  @Get('stats')
  stats() { return this.users.stats(); }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.users.findOne(id); }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ) { return this.users.updateProfile(user, id, dto); }

  @Roles(Role.ADMIN)
  @Patch(':id/approval')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApprovalDto) {
    return this.users.setApproval(id, dto.approvalStatus);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.users.remove(id); }
}
