import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export class StorageError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
export function assertObjectKey(key) {
  if (typeof key !== 'string' || !key || key.length > 1024 || /[\\\x00-\x1f\x7f]/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new StorageError('INVALID_INPUT',400);
  }
  return key;
}
export const fileHash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function readFileBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_FILE_BYTES)) throw new StorageError('PAYLOAD_TOO_LARGE',413);
  const reader = request.body?.getReader();
  if (!reader) throw new StorageError('INVALID_INPUT',400);
  const parts = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_FILE_BYTES) { await reader.cancel(); throw new StorageError('PAYLOAD_TOO_LARGE',413); }
      parts.push(chunk.value);
    }
    if (!length || (declared !== null && Number(declared) !== length)) throw new StorageError('INVALID_INPUT',400);
    return Buffer.concat(parts,length);
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError('UPLOAD_INCOMPLETE');
  } finally { reader.releaseLock(); }
}

/** Provider-neutral exact-key storage. Adapters must reject an existing object. */
export function createPrivateStorage(objects) {
  if (!objects?.putIfAbsent || !objects?.get || !objects?.delete) throw new StorageError('STORAGE_UNAVAILABLE');
  return {
    async save(key, bytes, contentType) {
      assertObjectKey(key);
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new StorageError('PAYLOAD_TOO_LARGE',413);
      const sha256 = fileHash(bytes);
      try { await objects.putIfAbsent(key,bytes,{sha256,contentType}); }
      catch { throw new StorageError('STORAGE_UNAVAILABLE'); }
      return { sha256, size: bytes.byteLength };
    },
    async read(key, size, sha256) {
      assertObjectKey(key);
      if (!Number.isSafeInteger(Number(size)) || Number(size) < 1 || Number(size) > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new StorageError('FILE_INTEGRITY');
      let bytes;
      try { bytes = await objects.get(key); } catch { throw new StorageError('STORAGE_UNAVAILABLE'); }
      if (bytes === null) throw new StorageError('FILE_NOT_FOUND',404);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== Number(size) || fileHash(bytes) !== sha256) throw new StorageError('FILE_INTEGRITY');
      return bytes;
    },
  };
}

/** Authenticated download grants live only in request bodies, never URLs. */
export function createDownloadGrants({key,now=()=>Date.now(),ttlSeconds=300}) {
  if (typeof key !== 'string' || key.length < 32 || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) throw new Error('DOWNLOAD_SIGNING_KEY_REQUIRED');
  const mac = value => createHmac('sha256',key).update(`bookdrop-download-v1:${value}`).digest();
  return {
    issue(id,owner,sha256) {
      const expiresAt=now()+ttlSeconds*1000;
      const payload=Buffer.from(JSON.stringify({v:1,id,owner,sha256,expiresAt})).toString('base64url');
      return {grant:`${payload}.${mac(payload).toString('base64url')}`,expiresAt};
    },
    verify(grant,id,owner,sha256) {
      try {
        if (typeof grant !== 'string' || grant.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(grant)) throw new Error();
        const [payload,tag]=grant.split('.');
        const supplied=Buffer.from(tag,'base64url');
        if (supplied.length !== 32 || !timingSafeEqual(supplied,mac(payload))) throw new Error();
        const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
        if (value.v !== 1 || value.id !== id || value.owner !== owner || value.sha256 !== sha256 || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now()) throw new Error();
      } catch { throw new StorageError('INVALID_GRANT',403); }
    },
  };
}
