import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
const request=vi.fn(),token='generated-fixture-portal-token'
const clientId='10000000-0000-4000-8000-000000000001',requirementId='10000000-0000-4000-8000-000000000002'
beforeEach(()=>{vi.stubEnv('VITE_MODE','local');vi.stubGlobal('fetch',request)})
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules()})
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})

it('portal reads use a fixed destination, header-only token and no account cookie',async()=>{
  request.mockResolvedValue(json({client:{id:clientId}}))
  const {fetchClientByToken}=await import('../src/lib/db')
  expect((await fetchClientByToken(token))?.client.id).toBe(clientId)
  const [url,options]=request.mock.calls[0]
  expect(url).toBe('/api/bookdrop/portal/period')
  expect(options).toMatchObject({method:'POST',credentials:'omit',redirect:'error',headers:{'x-bookdrop-portal':token}})
  expect(url+options.body).not.toContain(token)
})
it('invalid tokens fail before any request and revoked links resolve to the invalid-link state',async()=>{
  const {fetchClientByToken}=await import('../src/lib/db')
  expect(await fetchClientByToken('../invalid')).toBeNull();expect(request).not.toHaveBeenCalled()
  request.mockResolvedValue(json({code:'NOT_FOUND'},404))
  expect(await fetchClientByToken(token)).toBeNull()
})
it('portal upload carries its token separately from file bytes and never invokes legacy notification',async()=>{
  request.mockResolvedValue(json({id:clientId}))
  const {uploadDocumentFile,notifyBookkeeperOfUpload}=await import('../src/lib/db')
  const file=new File(['generated fixture bytes'],'Fixture.pdf',{type:'application/pdf'})
  await uploadDocumentFile(file,clientId,'untrusted-owner-ignored',requirementId,2025,12,token)
  expect(request.mock.calls[0][0]).toBe(`/api/bookdrop/portal/clients/${clientId}/requirements/${requirementId}/upload`)
  expect(request.mock.calls[0][1]).toMatchObject({credentials:'omit',body:file,headers:{'x-bookdrop-portal':token}})
  await notifyBookkeeperOfUpload(clientId,'untrusted-owner-ignored',file.name,2025,12,token)
  expect(request).toHaveBeenCalledTimes(1)
})
it('portal private download verifies bytes and keeps both grant and token out of URLs',async()=>{
  const bytes=new TextEncoder().encode('generated fixture document')
  request.mockResolvedValueOnce(json({grant:'generated-fixture-grant',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),contentType:'application/pdf'}))
    .mockResolvedValueOnce(new Response(bytes,{headers:{'Content-Type':'application/pdf'}}))
  const {fetchPrivateFile}=await import('../src/lib/files')
  expect(await (await fetchPrivateFile(clientId,'letter',token)).text()).toBe('generated fixture document')
  for(const [url,options]of request.mock.calls){expect(url).toMatch(/^\/api\/bookdrop\/portal\/files\//);expect(url).not.toContain(token);expect(url).not.toContain('generated-fixture-grant');expect(options.credentials).toBe('omit');expect(options.headers['x-bookdrop-portal']).toBe(token)}
})
