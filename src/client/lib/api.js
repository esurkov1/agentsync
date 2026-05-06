export async function api(path, init) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return res.json();
}
