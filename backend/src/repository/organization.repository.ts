import { AppDataSource } from '../database/database-source';
import { DepartmentEntity } from '../entities/department.entity';
import { AiEmployeeEntity } from '../entities/ai-employee.entity';

export class OrganizationRepository {
  private get deptRepo() {
    return AppDataSource.getRepository(DepartmentEntity);
  }

  private get empRepo() {
    return AppDataSource.getRepository(AiEmployeeEntity);
  }

  findAllDepartments() {
    return this.deptRepo.find({ order: { name: 'ASC' } });
  }

  findDepartmentBySlug(slug: string) {
    return this.deptRepo.findOne({ where: { slug } });
  }

  findAllEmployees() {
    return this.empRepo.find({
      relations: ['department'],
      order: { roleTitle: 'ASC' },
    });
  }

  findEmployeeBySlug(slug: string) {
    return this.empRepo.findOne({ where: { slug }, relations: ['department'] });
  }

  findEmployeesByDepartmentId(departmentId: string) {
    return this.empRepo.find({
      where: { departmentId, isActive: true },
      relations: ['department'],
      order: { roleTitle: 'ASC' },
    });
  }

  findEmployeeById(id: string) {
    return this.empRepo.findOne({ where: { id }, relations: ['department'] });
  }

  updateEmployee(id: string, patch: Partial<AiEmployeeEntity>) {
    return this.empRepo.update({ id }, patch);
  }
}
