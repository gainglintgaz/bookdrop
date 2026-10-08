import { randomUUID } from 'node:crypto';
import { assertObjectKey, fileHash, MAX_FILE_BYTES, StorageError } from './storage.mjs';

/** Separate server-only pool. Do not pass the caller's metadata transaction:
 * an upload intent must survive that transaction's failure or process death.
 * The caller holds the matching advisory lock until metadata commit/rollback.
 */
export function createJournaledStorage(storage,intentPool) {
  if(!intentPool?.connect)throw new StorageError('STORAGE_UNAVAILABLE');
  return {
    journaled:true,
    read:(...args)=>storage.read(...args),
    async save(key,bytes,contentType) {
      assertObjectKey(key);
      const owner=key.split('/')[0];
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner))throw new StorageError('INVALID_INPUT',400);
      if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_FILE_BYTES)throw new StorageError('PAYLOAD_TOO_LARGE',413);
      const tx=await intentPool.connect();let began=false,destroy=false;
      try {
        await tx.query('BEGIN');began=true;
        await tx.query('SET LOCAL ROLE bookdrop_file_intent');
        await tx.query('INSERT INTO app_private.file_upload_intents(id,owner_id,object_key,sha256,size_bytes) VALUES($1,$2,$3,$4,$5)',[randomUUID(),owner,key,fileHash(bytes),bytes.byteLength]);
        await tx.query('COMMIT');
      } catch {
        if(began){try{await tx.query('ROLLBACK');}catch{destroy=true;}}else destroy=true;
        throw new StorageError('STORAGE_UNAVAILABLE');
      } finally {tx.release(destroy);}
      return storage.save(key,bytes,contentType);
    },
  };
}
