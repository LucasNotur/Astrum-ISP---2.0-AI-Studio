import { runGuardrails } from '../guardrails/guardrails.pipeline';
import { IGuardrailsPort } from '../../domain/ports/guardrails.port';

export const guardrailsAdapter: IGuardrailsPort = {
  run: (message, opts) => runGuardrails(message, opts),
};
