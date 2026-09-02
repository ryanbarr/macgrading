import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ROLES } from '@macgrading/shared';
import type { Role, TeamUserDto } from '@macgrading/shared';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

function toTeamUserDto(user: User): TeamUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

/** The User table IS the sign-in allowlist — this controller manages it. */
@Controller('users')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'User'))
  async list(): Promise<TeamUserDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toTeamUserDto);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'User'))
  async create(@Body() dto: CreateUserDto): Promise<TeamUserDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with that email already exists');
    }
    const user = await this.prisma.user.create({
      data: { email, name: dto.name ?? email, role: dto.role ?? 'TEAM_MEMBER' },
    });
    return toTeamUserDto(user);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: User,
  ): Promise<TeamUserDto> {
    if (id === current.id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate yourself');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('No such user');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return toTeamUserDto(updated);
  }
}
