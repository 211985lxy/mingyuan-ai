export type AimEntryChannel = "web" | "feishu" | "wecom"

export type AimCoreCapability =
  | "capture"
  | "chat"
  | "generate"
  | "review"
  | "publish_record"
  | "outcome_backfill"

export type AimConnectorCapability =
  | "notify"
  | "approve"
  | "same_record_writeback"

export type AimChannelCapability = AimCoreCapability | AimConnectorCapability

const CORE_CAPABILITIES = [
  "capture",
  "chat",
  "generate",
  "review",
  "publish_record",
  "outcome_backfill",
] as const satisfies readonly AimCoreCapability[]

const CONNECTOR_CAPABILITIES = [
  "capture",
  "notify",
  "approve",
  "same_record_writeback",
] as const satisfies readonly AimChannelCapability[]

const CAPABILITIES_BY_CHANNEL: Record<AimEntryChannel, readonly AimChannelCapability[]> = {
  web: CORE_CAPABILITIES,
  feishu: CONNECTOR_CAPABILITIES,
  wecom: CONNECTOR_CAPABILITIES,
}

export function getAimChannelCapabilities(
  channel: AimEntryChannel,
): readonly AimChannelCapability[] {
  return CAPABILITIES_BY_CHANNEL[channel]
}

export function isAimWebOnlyReady(): boolean {
  const webCapabilities = new Set(getAimChannelCapabilities("web"))
  return CORE_CAPABILITIES.every((capability) => webCapabilities.has(capability))
}
