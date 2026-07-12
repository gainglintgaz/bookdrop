import { describe, it, expect } from 'vitest'
import {
  buildPrepCandidates,
  actionablePrepCandidates,
  type PrepUploadSignal,
} from '../src/lib/prep-candidates'

function signal(partial: Partial<PrepUploadSignal> & Pick<PrepUploadSignal, 'clientId'>): PrepUploadSignal {
  return {
    bookkeeperId: 'bk',
    clientName: 'Acme',
    periodYear: 2026,
    periodMonth: 7,
    requiredWithUpload: 0,
    requiredTotal: 2,
    uploadCount: 0,
    hasParseArtifact: false,
    latestUploadAt: null,
    lastPrepAt: null,
    ...partial,
  }
}

describe('buildPrepCandidates', () => {
  it('skips empty clients', () => {
    const c = buildPrepCandidates([signal({ clientId: 'a' })])
    expect(c[0].kind).toBe('skip_empty')
    expect(actionablePrepCandidates(c)).toHaveLength(0)
  })

  it('marks completeness_only when uploads lack parse artifacts', () => {
    const c = buildPrepCandidates([
      signal({
        clientId: 'b',
        uploadCount: 1,
        requiredWithUpload: 1,
        requiredTotal: 2,
        latestUploadAt: '2026-07-05T12:00:00Z',
      }),
    ])
    expect(c[0].kind).toBe('completeness_only')
    expect(c[0].stepsWithoutStatements).toEqual(['completeness', 'package_draft'])
    expect(c[0].needsStatementPayload).toBe(false)
  })

  it('marks full_playbook when parse artifacts exist', () => {
    const c = buildPrepCandidates([
      signal({
        clientId: 'c',
        uploadCount: 2,
        requiredWithUpload: 2,
        requiredTotal: 2,
        hasParseArtifact: true,
        latestUploadAt: '2026-07-06T12:00:00Z',
        lastPrepAt: '2026-07-01T12:00:00Z', // stale vs upload
      }),
    ])
    expect(c[0].kind).toBe('full_playbook')
    expect(c[0].needsStatementPayload).toBe(true)
  })

  it('skips when complete and prep after last upload', () => {
    const c = buildPrepCandidates([
      signal({
        clientId: 'd',
        uploadCount: 2,
        requiredWithUpload: 2,
        requiredTotal: 2,
        hasParseArtifact: true,
        latestUploadAt: '2026-07-05T10:00:00Z',
        lastPrepAt: '2026-07-05T12:00:00Z',
      }),
    ])
    expect(c[0].kind).toBe('skip_complete')
  })
})
