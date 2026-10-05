export type JsonObject = Readonly<Record<string, unknown>>;

export type RemoteResource = Readonly<{
  id: string;
  version: number;
  status: string;
  payload: JsonObject | null;
}>;

export type RemoteResourceParseResult =
  | Readonly<{ ok: true; value: RemoteResource }>
  | Readonly<{ ok: false; error: 'contract' }>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates only the public remote-resource envelope. Domain payload rules
 * belong to the mapper for each resource type.
 */
export function parseRemoteResource(input: unknown): RemoteResourceParseResult {
  if (!isObject(input)) return { ok: false, error: 'contract' };

  const { id, version, status, payload } = input;
  if (
    !isNonEmptyText(id)
    || !Number.isInteger(version)
    || (version as number) < 0
    || !isNonEmptyText(status)
    || (payload !== null && !isObject(payload))
  ) {
    return { ok: false, error: 'contract' };
  }

  return {
    ok: true,
    value: { id, version: version as number, status, payload },
  };
}
