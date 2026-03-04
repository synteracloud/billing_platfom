import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entity/user.entity';
import { UsersRepository } from './repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createUser(tenantId: string, data: CreateUserDto): Promise<UserEntity> {
    const existing = this.usersRepository.findByEmail(tenantId, data.email);
    if (existing) {
      throw new ConflictException('User email already exists for tenant');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    return this.usersRepository.create({
      tenant_id: tenantId,
      email: data.email,
      password_hash: passwordHash,
      role: data.role,
      status: 'active'
    });
  }

  listUsers(tenantId: string): UserEntity[] {
    return this.usersRepository.listByTenant(tenantId);
  }

  async updateUser(tenantId: string, userId: string, data: UpdateUserDto): Promise<UserEntity> {
    const existing = this.usersRepository.findById(tenantId, userId);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (data.email && data.email !== existing.email) {
      const conflict = this.usersRepository.findByEmail(tenantId, data.email);
      if (conflict) {
        throw new ConflictException('User email already exists for tenant');
      }
    }

    let passwordHash = existing.password_hash;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const updated = this.usersRepository.update(tenantId, userId, {
      ...data,
      password_hash: passwordHash
    });

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return updated;
  }

  deactivateUser(tenantId: string, userId: string): UserEntity {
    const deactivated = this.usersRepository.deactivate(tenantId, userId);
    if (!deactivated) {
      throw new NotFoundException('User not found');
    }

    return deactivated;
  }

  findByActiveEmail(email: string): UserEntity | undefined {
    return this.usersRepository.findActiveByEmail(email);
  }
}
