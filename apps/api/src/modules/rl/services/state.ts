import { config } from '@/config.js';
import type { Action, ActionKey, ModelArm, RetrievalPath, TriageClass } from '@/types.js';

export const TRIAGE_CLASSES: TriageClass[] = [
  'simple_lookup',
  'complex_diagnostic',
  'urgent_incident',
];

export function actionKey(action: Action): ActionKey {
  return `${action.path}|${action.model}`;
}

export function parseActionKey(key: ActionKey): Action {
  const [path, model] = key.split('|');
  return { path: path as RetrievalPath, model: model as ModelArm };
}

export function allActions(): Action[] {
  const actions: Action[] = [];
  for (const path of config.paths) {
    for (const model of config.models) {
      actions.push({ path, model });
    }
  }
  return actions;
}

export function maskActions(opts: {
  pinnedPath?: RetrievalPath | null;
  availableModels?: ModelArm[] | null;
}): Action[] {
  const models = opts.availableModels && opts.availableModels.length > 0
    ? opts.availableModels
    : [...config.models];

  return allActions().filter(
    (a) => (!opts.pinnedPath || a.path === opts.pinnedPath) && models.includes(a.model),
  );
}
