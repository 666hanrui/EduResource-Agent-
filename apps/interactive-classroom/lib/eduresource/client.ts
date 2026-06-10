import type {
  EduResourceClassroomImportPayload,
  EduResourceExerciseAttemptsPayload,
  EduResourceExerciseAttemptsResponse,
  EduResourceImportResponse,
} from './types';

export interface EduResourceClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function postEduResourceClassroomImport(
  payload: EduResourceClassroomImportPayload,
  options: EduResourceClientOptions = {},
): Promise<EduResourceImportResponse> {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.EDURESOURCE_API_BASE_URL);
  const url = `${baseUrl}/integrations/openmaic/resource-package`;
  return postJson<EduResourceImportResponse>(
    url,
    payload,
    options.fetchImpl,
    'EduResource import failed',
  );
}

export async function postEduResourceExerciseAttempts(
  payload: EduResourceExerciseAttemptsPayload,
  options: EduResourceClientOptions = {},
): Promise<EduResourceExerciseAttemptsResponse> {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.EDURESOURCE_API_BASE_URL);
  const url = `${baseUrl}/integrations/openmaic/exercise-attempts`;
  return postJson<EduResourceExerciseAttemptsResponse>(
    url,
    payload,
    options.fetchImpl,
    'EduResource exercise attempt import failed',
  );
}

async function postJson<T>(
  url: string,
  payload: unknown,
  fetchOverride: typeof fetch | undefined,
  errorPrefix: string,
): Promise<T> {
  const fetchImpl = fetchOverride ?? fetch;

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `${errorPrefix}: POST ${url} returned ${response.status}${await formatDetails(response)}`,
    );
  }

  return (await response.json()) as T;
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl?.trim()) {
    throw new Error('EDURESOURCE_API_BASE_URL is required for EduResource writeback');
  }
  return baseUrl.replace(/\/+$/, '');
}

async function formatDetails(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text ? `: ${text}` : '';
  } catch {
    return '';
  }
}
