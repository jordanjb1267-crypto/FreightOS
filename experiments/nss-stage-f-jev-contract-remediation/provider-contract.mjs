import { createHash } from 'node:crypto';

export const PROVIDER_CONTRACT = Object.freeze({
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  requested_model: 'jev-latest',
  predecessor_effective_required: 'jev-1.13.0',
  remediation: 'NOUL_CRITERIA_STRING_TO_NoulCriteria_TRUE_OBJECT'
});

const severityLevels = Object.freeze([
  '0 — informational; no material operational consequence',
  '1 — low operational consequence',
  '2 — material operational consequence',
  '3 — economic or service critical consequence',
  '4 — authority or safety critical consequence'
]);

export function toTypeSafeQuestionsRemediated(questionSet) {
  const out = {};
  for (const [id, q] of Object.entries(questionSet)) {
    if (q.type === 'noul') {
      const criteria = q.condition == null ? undefined : { true: q.condition };
      out[id] = criteria === undefined
        ? { type: 'noul', instructions: q.instruction }
        : { type: 'noul', instructions: q.instruction, criteria };
    } else if (q.type === 'choice') {
      out[id] = { type: 'choice', instructions: q.instruction, criteria: Object.fromEntries(q.options.map(x => [x, x])) };
    } else if (q.type === 'score') {
      out[id] = { type: 'score', instructions: q.instruction, criteria: [...severityLevels] };
    } else {
      throw new Error(`UNSUPPORTED_QUESTION_TYPE:${id}:${q.type}`);
    }
  }
  return out;
}

export function makeTypeSafeBody({ providerState, questionSet }) {
  return {
    state: providerState,
    model: PROVIDER_CONTRACT.requested_model,
    questions: toTypeSafeQuestionsRemediated(questionSet)
  };
}

export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function shaStable(v) {
  return createHash('sha256').update(stable(v)).digest('hex');
}
