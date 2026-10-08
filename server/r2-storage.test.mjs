import test from 'node:test';
import assert from 'node:assert/strict';
import { createR2ObjectStore } from './r2-storage.mjs';
import { createPrivateStorage, fileHash, MAX_FILE_BYTES } from './storage.mjs';

const key='fixture-owner/client/file', bytes=Buffer.from('generated fixture bytes');
const checksum=()=>Uint8Array.from(Buffer.from(fileHash(bytes),'hex')).buffer;
const body=value=>new ReadableStream({start(c){c.enqueue(value);c.close();}});
const binding=overrides=>({put:async()=>({key,size:bytes.length,checksums:{sha256:checksum()}}),get:async()=>({size:bytes.length,body:body(bytes)}),delete:async()=>{},...overrides});

test('R2 contract: conditional private put with verified checksum and bounded read',async()=>{
  let stored=false;
  const objects=createR2ObjectStore(binding({put:async(actual,value,options)=>{
    assert.equal(actual,key); assert.deepEqual(value,bytes);
    assert.equal(options.onlyIf.get('If-None-Match'),'*');
    assert.equal(options.sha256,fileHash(bytes));
    assert.deepEqual(options.httpMetadata,{contentType:'application/pdf',cacheControl:'private, no-store'});
    if(stored)return null;
    stored=true; return {key,size:bytes.length,checksums:{sha256:checksum()}};
  }}));
  const storage=createPrivateStorage(objects), saved=await storage.save(key,bytes,'application/pdf');
  assert.deepEqual(Buffer.from(await storage.read(key,saved.size,saved.sha256)),bytes);
  await assert.rejects(storage.save(key,bytes,'application/pdf'),{code:'STORAGE_UNAVAILABLE'});
});
test('R2 contract: absent, partial, oversized and corrupt objects fail closed',async()=>{
  assert.equal(await createR2ObjectStore(binding({get:async()=>null})).get(key),null);
  for(const result of [{size:MAX_FILE_BYTES+1,body:body(bytes)},{size:bytes.length},{size:bytes.length+1,body:body(bytes)},{size:bytes.length-1,body:body(bytes)}]) {
    await assert.rejects(createR2ObjectStore(binding({get:async()=>result})).get(key),{code:'FILE_INTEGRITY'});
  }
  const storage=createPrivateStorage(createR2ObjectStore(binding()));
  await assert.rejects(storage.read(key,bytes.length,'0'.repeat(64)),{code:'FILE_INTEGRITY'});
});
test('R2 contract: uncertain and malformed write acknowledgements never succeed or retry',async()=>{
  for(const result of [null,{key,size:bytes.length,checksums:{}},{key:'other',size:bytes.length,checksums:{sha256:checksum()}},{key,size:bytes.length-1,checksums:{sha256:checksum()}}]) {
    let attempts=0;
    const storage=createPrivateStorage(createR2ObjectStore(binding({put:async()=>{attempts++;return result;}})));
    await assert.rejects(storage.save(key,bytes,'application/pdf'),{code:'STORAGE_UNAVAILABLE'});
    assert.equal(attempts,1);
  }
  let attempts=0;
  await assert.rejects(createPrivateStorage(createR2ObjectStore(binding({put:async()=>{attempts++;throw new Error('fixture offline');}}))).save(key,bytes,'application/pdf'),{code:'STORAGE_UNAVAILABLE'});
  assert.equal(attempts,1);
});
test('R2 contract: deletion targets one validated key; unsafe paths never reach binding',async()=>{
  const deleted=[];
  const objects=createR2ObjectStore(binding({delete:async value=>deleted.push(value)}));
  await objects.delete(key); assert.deepEqual(deleted,[key]);
  await assert.rejects(objects.delete('../other'),{code:'INVALID_INPUT'});
  assert.deepEqual(deleted,[key]);
  assert.throws(()=>createR2ObjectStore({}),{code:'STORAGE_UNAVAILABLE'});
});
