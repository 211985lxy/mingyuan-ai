import {
  acquireProviderSlot,
  calibrateProviderSemaphore,
  countProviderInFlight,
  getProviderSlotUsage,
  releaseProviderSlot,
} from "./digital-human-semaphore"

/** Compatibility boundary for existing Shanjian-only callers. */
export const acquireSlot = () => acquireProviderSlot("shanjian")
export const releaseSlot = () => releaseProviderSlot("shanjian")
export const getSlotUsage = () => getProviderSlotUsage("shanjian")
export const countInFlightFromDB = () => countProviderInFlight("shanjian")
export const calibrateSemaphore = () => calibrateProviderSemaphore("shanjian")
