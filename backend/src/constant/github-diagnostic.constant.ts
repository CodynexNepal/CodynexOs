export enum GithubDiagnosticCode {
  READY_FOR_PUSH = 'READY_FOR_PUSH',
  TOKEN_NOT_CONFIGURED = 'TOKEN_NOT_CONFIGURED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  WRONG_AUTHENTICATED_ACCOUNT = 'WRONG_AUTHENTICATED_ACCOUNT',
  REPOSITORY_NOT_FOUND = 'REPOSITORY_NOT_FOUND',
  REPOSITORY_ACCESS_DENIED = 'REPOSITORY_ACCESS_DENIED',
  CONTENTS_WRITE_PERMISSION_MISSING = 'CONTENTS_WRITE_PERMISSION_MISSING',
  ORGANIZATION_APPROVAL_REQUIRED = 'ORGANIZATION_APPROVAL_REQUIRED',
  BRANCH_PROTECTION_RESTRICTION = 'BRANCH_PROTECTION_RESTRICTION',
  GIT_PUSH_REJECTED = 'GIT_PUSH_REJECTED',
}

export type GithubTokenType = 'classic' | 'fine-grained' | 'none';

export interface RepositoryDiagnosticResult {
  owner: string;
  name: string;
  exists: boolean;
  isPrivate: boolean;
  defaultBranch: string;
  hasAccess: boolean;
  hasPushPermission: boolean;
  effectiveWriteAuthorized: boolean;
  diagnosticCode: GithubDiagnosticCode;
  failureReason: string | null;
  correctiveAction: string | null;
}

export interface GithubConnectionDiagnostic {
  configured: boolean;
  authenticated: boolean;
  authenticatedAccount: string | null;
  accountType?: 'User' | 'Organization';
  tokenType: GithubTokenType;
  tokenScopes?: string;
  repositoryAccessStatus: 'FULL' | 'PARTIAL' | 'DENIED' | 'NOT_TESTED';
  repositoryWritePermission: boolean;
  pushReadiness: boolean;
  diagnosticCode: GithubDiagnosticCode;
  failureReason: string | null;
  recommendedAction: string | null;
  testedRepositories: RepositoryDiagnosticResult[];
  detail: string;
}
