import { describe, it, expect } from 'vitest'
import { canTransition, isTerminalStatus, getNextJobStatus } from '@/lib/comment-radar/pipeline'
describe('pipeline state machine', () => {
  describe('canTransition', () => {
    it('allows pending->resolving', () => expect(canTransition('pending', 'resolving')).toBe(true))
    it('allows resolving->collecting', () => expect(canTransition('resolving', 'collecting')).toBe(true))
    it('allows collecting->completed', () => expect(canTransition('collecting', 'completed')).toBe(true))
    it('allows collecting->partial', () => expect(canTransition('collecting', 'partial')).toBe(true))
    it('allows collecting->collecting', () => expect(canTransition('collecting', 'collecting')).toBe(true))
    it('blocks backward', () => expect(canTransition('collecting', 'pending')).toBe(false))
    it('blocks from completed', () => expect(canTransition('completed', 'collecting')).toBe(false))
    it('blocks from failed', () => expect(canTransition('failed', 'collecting')).toBe(false))
    it('allows partial->collecting', () => expect(canTransition('partial', 'collecting')).toBe(true))
  })
  describe('isTerminalStatus', () => {
    it('completed is terminal', () => expect(isTerminalStatus('completed')).toBe(true))
    it('failed is terminal', () => expect(isTerminalStatus('failed')).toBe(true))
    it('partial is not terminal', () => expect(isTerminalStatus('partial')).toBe(false))
    it('active not terminal', () => { for (const s of ['pending', 'collecting', 'resolving', 'analyzing'] as const) expect(isTerminalStatus(s)).toBe(false) })
  })
  describe('getNextJobStatus', () => {
    it('completed when all done', () => expect(getNextJobStatus({ totalItems: 3, processedItems: 3, failedItems: 0, hasMoreOnAnyItem: false })).toBe('completed'))
    it('partial when some failed', () => expect(getNextJobStatus({ totalItems: 5, processedItems: 3, failedItems: 2, hasMoreOnAnyItem: false })).toBe('partial'))
    it('collecting when items remain', () => expect(getNextJobStatus({ totalItems: 5, processedItems: 3, failedItems: 0, hasMoreOnAnyItem: false })).toBe('collecting'))
    it('collecting when more pages', () => expect(getNextJobStatus({ totalItems: 5, processedItems: 2, failedItems: 1, hasMoreOnAnyItem: true })).toBe('collecting'))
  })
})
