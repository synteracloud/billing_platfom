import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserEntity } from './entity/user.entity';

@Injectable()
export class UsersRepository {
  private readonly users = new Map<string, UserEntity>();

  create(user: Omit<UserEntity, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): UserEntity {
    const now = new Date().toISOString();
    const created: UserEntity = {
      ...user,
      id: randomUUID(),
      status: 'active',
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    this.users.set(created.id, created);
    return created;
  }

  findById(tenantId: string, userId: string): UserEntity | undefined {
    const user = this.users.get(userId);
    if (!user || user.tenant_id !== tenantId || user.deleted_at !== null) {
      return undefined;
    }

    return user;
  }

  findByEmail(tenantId: string, email: string): UserEntity | undefined {
    return [...this.users.values()].find(
      (user) => user.tenant_id === tenantId && user.email.toLowerCase() === email.toLowerCase() && user.deleted_at === null
    );
  }

  findActiveByEmail(email: string): UserEntity | undefined {
    return [...this.users.values()].find(
      (user) => user.email.toLowerCase() === email.toLowerCase() && user.deleted_at === null && user.status === 'active'
    );
  }

  listByTenant(tenantId: string): UserEntity[] {
    return [...this.users.values()].filter((user) => user.tenant_id === tenantId && user.deleted_at === null);
  }

  update(tenantId: string, userId: string, patch: Partial<UserEntity>): UserEntity | undefined {
    const user = this.findById(tenantId, userId);
    if (!user) {
      return undefined;
    }

    const updated: UserEntity = {
      ...user,
      ...patch,
      updated_at: new Date().toISOString()
    };

    this.users.set(userId, updated);
    return updated;
  }

  deactivate(tenantId: string, userId: string): UserEntity | undefined {
    const user = this.findById(tenantId, userId);
    if (!user) {
      return undefined;
    }

    const now = new Date().toISOString();
    const deactivated: UserEntity = {
      ...user,
      status: 'deactivated',
      deleted_at: now,
      updated_at: now
    };

    this.users.set(userId, deactivated);
    return deactivated;
  }
}
