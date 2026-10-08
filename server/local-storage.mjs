import { open, lstat, mkdir, realpath, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { assertObjectKey, MAX_FILE_BYTES } from './storage.mjs';

/** Dedicated private directory only; logical object paths map to flat hashes.
 * This keeps caller-supplied keys out of filesystem path construction.
 */
export async function createLocalObjectStore(directory) {
  if (!path.isAbsolute(directory) || path.parse(directory).root === path.resolve(directory)) throw new Error('PRIVATE_OBJECT_DIRECTORY_REQUIRED');
  await mkdir(directory,{recursive:true,mode:0o700});
  const root=await realpath(directory);
  if ((await lstat(directory)).isSymbolicLink() || path.resolve(directory) !== root) throw new Error('PRIVATE_OBJECT_DIRECTORY_REQUIRED');
  const filename=key=>path.join(root,createHash('sha256').update(assertObjectKey(key)).digest('hex'));
  return {
    async putIfAbsent(key,bytes) {
      const target=filename(key);
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error('OBJECT_SIZE');
      const temporary=path.join(root,`.pending-${randomUUID()}`);
      let handle;
      try {
        handle=await open(temporary,'wx',0o600);
        await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle=null;
        await link(temporary,target); // Atomic, fails if target already exists.
      } finally {
        await handle?.close();
        await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
      }
    },
    async get(key) {
      const target=filename(key);
      let handle;
      try {
        const info=await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) throw new Error('INVALID_OBJECT');
        handle=await open(target,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened=await handle.stat();
        if (opened.ino!==info.ino || opened.dev!==info.dev) throw new Error('OBJECT_CHANGED');
        return await handle.readFile();
      } catch(error) { if(error.code==='ENOENT')return null; throw error; }
      finally { await handle?.close(); }
    },
    async delete(key) {
      try { await unlink(filename(key)); } catch(error) { if(error.code!=='ENOENT')throw error; }
    },
  };
}
