import { z } from 'zod'
export const createJobSchema = z.object({ url: z.string().min(1).max(2048), accountVideoLimit: z.number().int().min(10).max(50).optional().default(20) }).strict()
export type CreateJobInput = z.infer<typeof createJobSchema>
