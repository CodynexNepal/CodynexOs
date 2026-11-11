import { Repository } from 'typeorm';
import { AppDataSource } from '../database/database-source';
import { UserEntity } from '../entities/user.entity';
import { SessionEntity } from '../entities/session.entity';

export class UserRepository {
  private get users(): Repository<UserEntity> {
    return AppDataSource.getRepository(UserEntity);
  }

  private get sessions(): Repository<SessionEntity> {
    return AppDataSource.getRepository(SessionEntity);
  }

  findByEmail(email: string) {
    return this.users.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  saveUser(user: UserEntity) {
    return this.users.save(user);
  }

  createSession(data: Partial<SessionEntity>) {
    return this.sessions.save(this.sessions.create(data));
  }

  findActiveSession(id: string) {
    return this.sessions.findOne({ where: { id } });
  }

  revokeSession(id: string) {
    return this.sessions.update({ id }, { revokedAt: new Date() });
  }

  revokeAllUserSessions(userId: string) {
    return this.sessions
      .createQueryBuilder()
      .update(SessionEntity)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }
}
