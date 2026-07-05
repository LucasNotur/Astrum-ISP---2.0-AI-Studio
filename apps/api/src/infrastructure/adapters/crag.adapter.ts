import { cragService } from '../ai/crag.service';
import type { ICragPort } from '../../domain/ports/crag.port';

export const cragAdapter: ICragPort = {
  gradeContext: (q, rag, db, t) => cragService.gradeContext(q, rag, db, t),
  rewriteQuery: (q, missing, t) => cragService.rewriteQuery(q, missing, t),
  selfCheck: (r, rag, db, t) => cragService.selfCheck(r, rag, db, t),
};