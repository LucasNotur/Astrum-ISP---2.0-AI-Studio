export type ContextGrade = 'relevant' | 'ambiguous' | 'irrelevant';

export interface IContextGradeResult {
  grade: ContextGrade;
  confidence: number;
  missing_info: string;
}

export interface ISelfCheckResult {
  grounded: boolean;
  unsupported_claims: string[];
  confidence: number;
}

export interface ICragPort {
  gradeContext(query: string, ragContext: string, dbContext: string, tenantId: string): Promise<IContextGradeResult>;
  rewriteQuery(query: string, missingInfo: string, tenantId: string): Promise<string>;
  selfCheck(response: string, ragContext: string, dbContext: string, tenantId: string): Promise<ISelfCheckResult>;
}

export function isCragEnabled(): boolean {
  return (process.env.CRAG_ENABLED ?? '').trim().toLowerCase() === 'true';
}