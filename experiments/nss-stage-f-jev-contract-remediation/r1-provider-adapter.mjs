import { toTypeSafeQuestionsRemediated } from './provider-contract.mjs';

export const R1_PROVIDER = Object.freeze({
  provider: 'TYPESAFE_SYSTEM_ONE',
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  requested_model: 'jev-latest',
  effective_required: 'jev-1.13.0'
});

export async function callJevR1({ apiKey, providerState, questionSet, fetchImpl = fetch, timeoutMs = 120000 }) {
  if (!apiKey) throw new Error('TYPESAFE_API_KEY_MISSING');
  return fetchImpl(R1_PROVIDER.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      state: providerState,
      model: R1_PROVIDER.requested_model,
      questions: toTypeSafeQuestionsRemediated(questionSet)
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
}
