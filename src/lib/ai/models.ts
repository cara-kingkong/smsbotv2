/**
 * Single source of truth for selectable AI models and their providers.
 * Used by the agent settings UI (to build provider-aware dropdowns) and the
 * backend (to resolve provider + default model from a stored model id).
 */

export type AIProviderKey = 'openai' | 'anthropic';

export interface AIModelOption {
  /** Model id sent to the provider API and stored in config_json.model. */
  id: string;
  /** Human-readable label for the UI. */
  label: string;
  provider: AIProviderKey;
  /** Cheap models eligible for the lightweight opening-message path. */
  cheap?: boolean;
}

export const AI_MODELS: AIModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', cheap: true },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', provider: 'anthropic', cheap: true },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', provider: 'anthropic' },
];

/** Default model used when an agent has a provider but no explicit model id. */
export const DEFAULT_MODEL_BY_PROVIDER: Record<AIProviderKey, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

/** Infer the provider from a model id (claude* → anthropic, else openai). */
export function providerForModel(model: string): AIProviderKey {
  return model.startsWith('claude') ? 'anthropic' : 'openai';
}
