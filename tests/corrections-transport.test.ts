import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const request=vi.fn()
const id='10000000-0000-4000-8000-000000000001'
const input={bookkeeperId:'untrusted-browser-owner',clientId:id,correctedCategory:'Office Supplies',descriptionRaw:'Generated transaction fixture'}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
beforeEach(()=>{vi.stubEnv('VITE_MODE','local');vi.stubGlobal('fetch',request)})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();request.mockReset()})
it('records through verified-cookie API without browser owner, timestamp or status claims',async()=>{
  const {recordCorrection}=await import('../src/lib/categorization-corrections')
  request.mockResolvedValueOnce(json({id}))
  expect(await recordCorrection(input)).toBe(id)
  expect(request.mock.calls[0][0]).toBe('/api/bookdrop/corrections')
  expect(request.mock.calls[0][1].credentials).toBe('same-origin')
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({clientId:id,correctedCategory:input.correctedCategory,descriptionRaw:input.descriptionRaw})
})
it('lists verified-owner history and computes only applied vendor corrections',async()=>{
  const service=await import('../src/lib/categorization-corrections')
  const rows=[{status:'applied',vendor_normalized:'generated',corrected_category:'Office',applied_at:'2025-12-31'},{status:'undone',vendor_normalized:'generated',corrected_category:'Other',applied_at:'2025-12-30'}]
  request.mockImplementation(async()=>json(rows))
  expect(await service.getCorrectionsForBookkeeper(input.bookkeeperId)).toEqual(rows)
  expect(await service.getVendorCorrectionStats(input.bookkeeperId,'generated')).toEqual([{category:'Office',count:1,lastAt:'2025-12-31'}])
  for(const [route,options] of request.mock.calls){expect(route).toBe('/api/bookdrop/corrections');expect(JSON.stringify(options)).not.toContain(input.bookkeeperId)}
})
it('undo uses an empty-body idempotent route and refuses unsafe identifiers',async()=>{
  const {undoCorrection}=await import('../src/lib/categorization-corrections')
  expect(await undoCorrection('../elsewhere')).toBe(false);expect(request).not.toHaveBeenCalled()
  request.mockResolvedValueOnce(json({ok:true}))
  expect(await undoCorrection(id)).toBe(true)
  expect(request.mock.calls[0][0]).toBe(`/api/bookdrop/corrections/${id}/undo`)
  expect(request.mock.calls[0][1].body).toBe('{}')
})
it('failed writes never fabricate success or retry, and failed reads cannot fabricate empty history',async()=>{
  const service=await import('../src/lib/categorization-corrections')
  request.mockResolvedValue(json({code:'UNAVAILABLE',message:'generated private SQL fixture'},503))
  expect(await service.recordCorrection(input)).toBeNull();expect(await service.undoCorrection(id)).toBe(false)
  await expect(service.getCorrectionsForBookkeeper(input.bookkeeperId)).rejects.toMatchObject({status:503,message:expect.not.stringContaining('private SQL')})
  expect(request).toHaveBeenCalledTimes(3)
})
