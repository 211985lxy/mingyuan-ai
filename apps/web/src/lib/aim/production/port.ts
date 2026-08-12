import type { ProductionExecutionSpec } from "@/lib/aim/production-execution-spec"

export interface ProductionExecutionPort<TInput> {
  prepare(input: TInput): Promise<{ spec: ProductionExecutionSpec; handoffText?: string }>
  getStatus(spec: ProductionExecutionSpec): Promise<ProductionExecutionSpec>
}
