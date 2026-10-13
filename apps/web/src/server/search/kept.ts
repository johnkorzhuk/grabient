/** Remembers `value` under `key` in an isolate's cache that keeps its newest `most` entries. */
export function keep<K, V>(map: Map<K, V>, key: K, value: V, most: number): V {
  if (!map.has(key) && map.size >= most) map.delete(map.keys().next().value as K);
  map.set(key, value);
  return value;
}
