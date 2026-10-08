import { assertObjectKey, fileHash, MAX_FILE_BYTES, StorageError } from './storage.mjs';

/** Private Worker binding only. No public URL, S3 credential or browser access.
 * Contract tests do not establish live R2 or Workers memory/runtime readiness.
 * API authorization and database reconciliation belong to their own layers.
 * Reference: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
 */
export function createR2ObjectStore(bucket) {
  if (!bucket?.put || !bucket?.get || !bucket?.delete) throw new StorageError('STORAGE_UNAVAILABLE');
  return {
    async putIfAbsent(key, bytes, {sha256,contentType}) {
      assertObjectKey(key);
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES || fileHash(bytes) !== sha256) throw new StorageError('FILE_INTEGRITY');
      const result=await bucket.put(key,bytes,{
        onlyIf:new Headers({'If-None-Match':'*'}), sha256,
        httpMetadata:{contentType,cacheControl:'private, no-store'},
      });
      // Conditional put is atomic. Never head-then-put, overwrite or retry an
      // uncertain write. Leave a questionable object for reconciliation.
      if (!result || result.key !== key || result.size !== bytes.byteLength ||
          !result.checksums?.sha256 || Buffer.from(result.checksums.sha256).toString('hex') !== sha256) throw new StorageError('STORAGE_UNAVAILABLE');
    },
    async get(key) {
      assertObjectKey(key);
      const result=await bucket.get(key);
      if (result === null) return null;
      if (!Number.isSafeInteger(result.size) || result.size < 1 || result.size > MAX_FILE_BYTES || !result.body) {
        await result.body?.cancel();
        throw new StorageError('FILE_INTEGRITY');
      }
      const bytes=new Uint8Array(result.size), reader=result.body.getReader();
      let length=0;
      try {
        while (true) {
          const part=await reader.read();
          if (part.done) break;
          if (length+part.value.byteLength > bytes.byteLength) {
            await reader.cancel(); throw new StorageError('FILE_INTEGRITY');
          }
          bytes.set(part.value,length); length+=part.value.byteLength;
        }
        if (length !== bytes.byteLength) throw new StorageError('FILE_INTEGRITY');
        return bytes;
      } finally { reader.releaseLock(); }
    },
    async delete(key) { await bucket.delete(assertObjectKey(key)); },
  };
}
