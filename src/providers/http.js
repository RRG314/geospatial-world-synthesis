export function httpUrl(value, label = 'Provider URL') {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError(`${label} must use http or https.`);
  return url;
}

export async function readBoundedText(response, maxBytes = 10 * 1024 * 1024) {
  const limit = Math.min(50 * 1024 * 1024, Math.max(1024, Number(maxBytes) || 10 * 1024 * 1024));
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new RangeError(`Provider response exceeds ${limit} bytes.`);
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > limit) throw new RangeError(`Provider response exceeds ${limit} bytes.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw new RangeError(`Provider response exceeds ${limit} bytes.`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

export async function readBoundedJson(response, maxBytes) {
  const text = await readBoundedText(response, maxBytes);
  try {
    return { value: JSON.parse(text), bytes: new TextEncoder().encode(text).length };
  } catch (error) {
    throw new SyntaxError(`Invalid JSON response: ${error.message}`);
  }
}
