import { UserRepository } from '../repository/user.repository';
import { TaskRepository } from '../repository/task.repository';
import { ProjectRepository } from '../repository/project.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { MemoryRepository } from '../repository/memory.repository';
import { EngineeringRepository } from '../repository/engineering.repository';
import { CrmRepository } from '../repository/crm.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';
import { AuthService } from '../services/auth.service';
import { CommandService } from '../services/command.service';
import { OrchestratorService } from '../services/orchestrator.service';
import { EngineeringService } from '../services/engineering.service';
import { CrmService } from '../services/crm.service';
import { DashboardService } from '../services/dashboard.service';
import { AuthController } from '../controller/auth.controller';
import { OsController } from '../controller/os.controller';
import { DomainController } from '../controller/domain.controller';

export interface OsContainer {
  orchestratorService: OrchestratorService;
  authController: AuthController;
  osController: OsController;
  domainController: DomainController;
}

let cachedContainer: OsContainer | null = null;

export function getOsContainer(): OsContainer {
  if (cachedContainer) return cachedContainer;

  const userRepo = new UserRepository();
  const taskRepo = new TaskRepository();
  const projectRepo = new ProjectRepository();
  const orgRepo = new OrganizationRepository();
  const memoryRepo = new MemoryRepository();
  const engRepo = new EngineeringRepository();
  const crmRepo = new CrmRepository();
  const governanceRepo = new GovernanceRepository();

  const modelRouter = new ModelRouterService();
  const auditService = new AuditService(governanceRepo);
  const notificationService = new NotificationService(governanceRepo);
  const authService = new AuthService(userRepo, auditService);
  const commandService = new CommandService(
    projectRepo,
    taskRepo,
    orgRepo,
    memoryRepo,
    governanceRepo,
    modelRouter,
    notificationService,
    auditService,
  );
  const engineeringService = new EngineeringService(
    engRepo,
    taskRepo,
    orgRepo,
    auditService,
    governanceRepo,
  );
  const orchestratorService = new OrchestratorService(
    taskRepo,
    projectRepo,
    memoryRepo,
    governanceRepo,
    engRepo,
    modelRouter,
    notificationService,
    auditService,
    engineeringService,
  );
  const crmService = new CrmService(crmRepo, governanceRepo, auditService);
  const dashboardService = new DashboardService(
    orgRepo,
    projectRepo,
    taskRepo,
    governanceRepo,
    modelRouter,
    auditService,
  );

  cachedContainer = {
    orchestratorService,
    authController: new AuthController(authService),
    osController: new OsController(
      dashboardService,
      commandService,
      orchestratorService,
      orgRepo,
      projectRepo,
      taskRepo,
      governanceRepo,
      crmRepo,
      notificationService,
      auditService,
    ),
    domainController: new DomainController(
      memoryRepo,
      engineeringService,
      crmService,
      governanceRepo,
      modelRouter,
      auditService,
    ),
  };

  return cachedContainer;
}
