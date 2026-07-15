import { describe, it, expect } from 'vitest'
import { sampleComments, stripFences, parseAnalysisResult } from '@/lib/comment-radar/analyzer'

describe('analyzer', () => {
  describe('sampleComments', () => {
    it('returns top N by likes desc', () => {
      const comments = Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        text: `comment ${i}`,
        nickname: `user${i}`,
        likes: i,
        createTime: '2024-01-01',
        isTop: false,
        sourceItemTitle: 'video1',
      }))
      const sampled = sampleComments(comments, 5)
      expect(sampled).toHaveLength(5)
      expect(sampled[0].id).toBe('c19')
      expect(sampled[4].id).toBe('c15')
    })

    it('caps text at 120 chars', () => {
      const comments = [{
        id: 'c1', text: 'A'.repeat(200), nickname: 'u', likes: 10,
        createTime: '2024-01-01', isTop: false, sourceItemTitle: 'v',
      }]
      const sampled = sampleComments(comments, 1)
      expect(sampled[0].text.length).toBeLessThanOrEqual(123) // 120 + '...'
    })

    it('includes isTop comments first then by likes', () => {
      const comments = [
        { id: 'c1', text: 'normal', nickname: 'u', likes: 100, createTime: '2024-01-01', isTop: false, sourceItemTitle: 'v' },
        { id: 'c2', text: 'pinned', nickname: 'u', likes: 1, createTime: '2024-01-01', isTop: true, sourceItemTitle: 'v' },
      ]
      const sampled = sampleComments(comments, 2)
      expect(sampled[0].id).toBe('c2')
      expect(sampled[1].id).toBe('c1')
    })

    it('handles empty input', () => {
      expect(sampleComments([], 5)).toEqual([])
    })

    it('handles fewer comments than limit', () => {
      const comments = [{ id: 'c1', text: 'hi', nickname: 'u', likes: 5, createTime: '2024', isTop: false, sourceItemTitle: 'v' }]
      expect(sampleComments(comments, 10)).toHaveLength(1)
    })
  })

  describe('stripFences', () => {
    it('strips ```json fences', () => {
      expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
    })
    it('strips bare ``` fences', () => {
      expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}')
    })
    it('returns clean json unchanged', () => {
      expect(stripFences('{"a":1}')).toBe('{"a":1}')
    })
    it('strips leading/trailing whitespace', () => {
      expect(stripFences('  {"a":1}  ')).toBe('{"a":1}')
    })
  })

  describe('parseAnalysisResult', () => {
    const validResult = {
      summary: '用户最关心产品价格和使用效果',
      topics: [
        { title: '价格敏感', frequency: 15, representativeComments: ['太贵了', '性价比不高'], sentiment: 'negative' },
        { title: '使用效果好评', frequency: 10, representativeComments: ['很好用'], sentiment: 'positive' },
      ],
      suggestedTopics: [
        { title: '同类产品横向对比测评', rationale: '用户反复对比价格，表明需要决策参考', angle: '对比评测' },
      ],
    }

    it('parses valid result', () => {
      const result = parseAnalysisResult(JSON.stringify(validResult))
      expect(result.summary).toBe('用户最关心产品价格和使用效果')
      expect(result.topics).toHaveLength(2)
      expect(result.topics[0].title).toBe('价格敏感')
      expect(result.suggestedTopics).toHaveLength(1)
    })

    it('returns null for unparseable JSON', () => {
      expect(parseAnalysisResult('not json')).toBeNull()
    })

    it('returns null when missing required fields', () => {
      expect(parseAnalysisResult('{"summary":"x"}')).toBeNull()
      expect(parseAnalysisResult('{"topics":[],"suggestedTopics":[]}')).toBeNull()
    })

    it('coerces invalid topic sentiment to "neutral"', () => {
      const bad = { ...validResult, topics: [{ title: 't', frequency: 1, representativeComments: ['c'], sentiment: 'invalid' }] }
      const result = parseAnalysisResult(JSON.stringify(bad))
      expect(result?.topics[0].sentiment).toBe('neutral')
    })

    it('truncates representative comments to 3 per topic', () => {
      const many = { ...validResult, topics: [{ title: 't', frequency: 1, representativeComments: ['a', 'b', 'c', 'd', 'e'], sentiment: 'positive' }] }
      const result = parseAnalysisResult(JSON.stringify(many))
      expect(result?.topics[0].representativeComments).toHaveLength(3)
    })
  })
})
