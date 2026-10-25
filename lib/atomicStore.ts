import { redis } from "./redis";

// Compare decoded values rather than JSON strings: property order is not data.
// All keys are checked before any write, including legacy weight/body migration.
const SAVE_IF_UNCHANGED = `
local function equal(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for k,v in pairs(a) do if not equal(v,b[k]) then return false end end
  for k,v in pairs(b) do if a[k] == nil then return false end end
  return true
end
for i,key in ipairs(KEYS) do
  local raw = redis.call('GET', key)
  local current = cjson.null
  if raw then current = cjson.decode(raw) end
  if not equal(current, cjson.decode(ARGV[i])) then return 0 end
end
for i,key in ipairs(KEYS) do
  redis.call('SET', key, ARGV[#KEYS + i])
end
return 1
`;

type Mutation<T, R> = { next: T; result: R } | { result: R };
type NullableTuple<T extends unknown[]> = { [K in keyof T]: T[K] | null };

export async function updateJsonRecords<T extends unknown[], R>(
  recordKeys: string[],
  transform: (stored: NullableTuple<T>) => Mutation<T, R>,
): Promise<R> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const stored = await Promise.all(recordKeys.map((key) => redis.get(key))) as NullableTuple<T>;
    const mutation = transform(stored);
    if (!("next" in mutation)) return mutation.result;
    const saved = await redis.eval<string[], number>(SAVE_IF_UNCHANGED, recordKeys, [
      ...stored.map((value) => JSON.stringify(value)),
      ...mutation.next.map((value) => JSON.stringify(value)),
    ]);
    if (saved === 1) return mutation.result;
    // Retry against the latest records. In particular, timestamp guards and
    // merges must run again, rather than retrying a stale replacement array.
  }
  throw new Error("Data changed repeatedly; please retry saving");
}

export function updateJsonRecord<T, R>(
  key: string,
  transform: (stored: T | null) => Mutation<T, R>,
): Promise<R> {
  return updateJsonRecords<[T], R>([key], ([stored]) => {
    const mutation = transform(stored);
    return "next" in mutation ? { next: [mutation.next], result: mutation.result } : mutation;
  });
}
