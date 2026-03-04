import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entity/user.entity';
import { UsersService } from './service';
import { Req } from '@nestjs/common/decorators';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Req() req: AuthenticatedRequest): UserEntity[] {
    return this.usersService.listUsers(req.auth!.tenant_id);
  }

  @Post()
  createUser(@Req() req: AuthenticatedRequest, @Body() body: CreateUserDto): Promise<UserEntity> {
    return this.usersService.createUser(req.auth!.tenant_id, body);
  }

  @Patch(':id')
  async updateUser(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateUserDto
  ): Promise<UserEntity> {
    if (body.status === 'deactivated') {
      return this.usersService.deactivateUser(req.auth!.tenant_id, id);
    }

    return this.usersService.updateUser(req.auth!.tenant_id, id, body);
  }
}
