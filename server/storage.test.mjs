import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLocalObjectStore } from './local-storage.mjs';
import { createPrivateStorage, createDownloadGrants, assertObjectKey, readFileBody, MAX_FILE_BYTES } from './storage.mjs';

test('local object bytes persist across adapters without overwrite; exact deletion is idempotent',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'bookdrop-file-fixture-'));
  const objects=await createLocalObjectStore(directory);
  const storage=createPrivateStorage(objects), key='fixture-owner/client/2025/12/requirement/document.pdf', bytes=Buffer.from('fixture-only document bytes');
  const saved=await storage.save(key,bytes,'application/pdf');
  const reopened=createPrivateStorage(await createLocalObjectStore(directory));
  assert.deepEqual(await reopened.read(key,saved.size,saved.sha256),bytes);
  await assert.rejects(storage.save(key,Buffer.from('overwrite'),'application/pdf'),{code:'STORAGE_UNAVAILABLE'});
  assert.deepEqual(await reopened.read(key,saved.size,saved.sha256),bytes);
  await objects.delete(key); await objects.delete(key);
  await assert.rejects(storage.read(key,saved.size,saved.sha256),{code:'FILE_NOT_FOUND'});
});
test('download refuses corrupted size/hash and invalid object paths',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'bookdrop-file-fixture-'));
  const storage=createPrivateStorage(await createLocalObjectStore(directory));
  const key='fixture/document.pdf', bytes=Buffer.from('fixture bytes');
  const saved=await storage.save(key,bytes,'application/pdf');
  await assert.rejects(storage.read(key,saved.size+1,saved.sha256),{code:'FILE_INTEGRITY'});
  const [filename]=(await readdir(directory)).filter(name=>!name.startsWith('.pending-'));
  await writeFile(path.join(directory,filename),Buffer.from('tampered data'));
  await assert.rejects(storage.read(key,saved.size,saved.sha256),{code:'FILE_INTEGRITY'});
  for(const value of ['../elsewhere','/absolute','x//y','x/../y','x\\y','x/./y','x\0y'])assert.throws(()=>assertObjectKey(value),{code:'INVALID_INPUT'});
});
test('download grants reject expiry, tampering and other owners/files/hashes',()=>{
  let time=1000;
  const grants=createDownloadGrants({key:randomBytes(32).toString('hex'),now:()=>time,ttlSeconds:2});
  const {grant}=grants.issue('fixture-id','fixture-owner','fixture-hash');
  grants.verify(grant,'fixture-id','fixture-owner','fixture-hash');
  for(const args of [[grant,'other-id','fixture-owner','fixture-hash'],[grant,'fixture-id','other-owner','fixture-hash'],[grant,'fixture-id','fixture-owner','other-hash'],[grant+'x','fixture-id','fixture-owner','fixture-hash']])assert.throws(()=>grants.verify(...args),{code:'INVALID_GRANT'});
  time=3000; assert.throws(()=>grants.verify(grant,'fixture-id','fixture-owner','fixture-hash'),{code:'INVALID_GRANT'});
});
test('file body rejects empty, declared mismatch, oversized and interrupted streams',async()=>{
  assert.deepEqual(await readFileBody(new Request('http://fixture.test',{method:'POST',body:Buffer.from('fixture')})),Buffer.from('fixture'));
  await assert.rejects(readFileBody(new Request('http://fixture.test',{method:'POST',body:''})),{code:'INVALID_INPUT'});
  await assert.rejects(readFileBody(new Request('http://fixture.test',{method:'POST',headers:{'Content-Length':'99'},body:'fixture'})),{code:'INVALID_INPUT'});
  await assert.rejects(readFileBody(new Request('http://fixture.test',{method:'POST',headers:{'Content-Length':String(MAX_FILE_BYTES+1)},body:'fixture'})),{code:'PAYLOAD_TOO_LARGE'});
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));controller.error(new Error('fixture connection ended'));}});
  await assert.rejects(readFileBody(new Request('http://fixture.test',{method:'POST',body:stream,duplex:'half'})),{code:'UPLOAD_INCOMPLETE'});
});
