import { z } from 'zod'
export const createJobSchema = z.object({ url: z.string().min(1).max(2048), accountVideoLimit: z.number().int().min(10).max(50).optional().default(20) }).strict()
export type CreateJobInput = z.infer<typeof createJobSchema>

const sentimentEnum = z.enum(['positive', 'negative', 'neutral'])

export const AnalysisTopicSchema = z.object({
  title: z.string().min(1).max(50),
  frequency: z.number().int().min(1),
  representativeComments: z.array(z.string().max(200)).max(3),
  sentiment: sentimentEnum.catch('neutral'),
})

export const SuggestedTopicSchema = z.object({
  title: z.string().min(1).max(80),
  rationale: z.string().min(1).max(300),
  angle: z.string().max(50),
})

export const AnalysisResultSchema = z.object({
  summary: z.string().min(1).max(500),
  topics: z.array(AnalysisTopicSchema).max(10),
  suggestedTopics: z.array(SuggestedTopicSchema).max(5),
})

export type AnalysisTopic = z.infer<typeof AnalysisTopicSchema>
export type SuggestedTopic = z.infer<typeof SuggestedTopicSchema>
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>

export const adoptTopicSchema = z.object({
  title: z.string().min(1).max(80),
  rationale: z.string().min(1).max(500),
  angle: z.string().max(50).optional(),
}).strict()
export type AdoptTopicInput = z.infer<typeof adoptTopicSchema>
