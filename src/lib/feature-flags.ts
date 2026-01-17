/**
 * Feature Flags Module
 * Centralized feature flag management for gradual feature rollout.
 *
 * Usage:
 *   import { isFeatureEnabled } from '@/lib/feature-flags'
 *   if (isFeatureEnabled('AUTO_EXPLAIN_WINDOW')) { ... }
 *
 * Environment Variables:
 *   ENABLE_AUTO_EXPLAIN_WINDOW - Enable window mode for auto-explain (default: false)
 *   ENABLE_AUTO_IMAGE_DETECTION - Enable click-to-explain auto image detection (default: false)
 */

/**
 * Available feature flags
 */
export type FeatureFlag =
  | 'AUTO_EXPLAIN_WINDOW' // Sliding window auto-explain mode
  | 'AUTO_IMAGE_DETECTION' // Click-to-explain auto image detection

/**
 * Feature flag configuration
 */
interface FeatureFlagConfig {
  envVar: string
  defaultValue: boolean
  description: string
}

/**
 * Feature flag definitions
 */
const FEATURE_FLAGS: Record<FeatureFlag, FeatureFlagConfig> = {
  AUTO_EXPLAIN_WINDOW: {
    envVar: 'ENABLE_AUTO_EXPLAIN_WINDOW',
    defaultValue: false,
    description: 'Enable sliding window mode for auto-explain feature',
  },
  AUTO_IMAGE_DETECTION: {
    envVar: 'ENABLE_AUTO_IMAGE_DETECTION',
    defaultValue: false,
    description: 'Enable click-to-explain auto image detection in PDF viewer',
  },
}

/**
 * Check if a feature flag is enabled
 *
 * @param flag - Feature flag name
 * @returns True if feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = FEATURE_FLAGS[flag]
  if (!config) {
    console.warn(`Unknown feature flag: ${flag}`)
    return false
  }

  const envValue = process.env[config.envVar]

  // Explicit true/false
  if (envValue === 'true' || envValue === '1') return true
  if (envValue === 'false' || envValue === '0') return false

  // Default value
  return config.defaultValue
}

/**
 * Get all feature flag states (for debugging/admin)
 *
 * @returns Map of flag names to enabled states
 */
export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  const result: Partial<Record<FeatureFlag, boolean>> = {}

  for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
    result[flag] = isFeatureEnabled(flag)
  }

  return result as Record<FeatureFlag, boolean>
}

/**
 * Get feature flag configuration (for documentation)
 */
export function getFeatureFlagConfig(flag: FeatureFlag): FeatureFlagConfig | undefined {
  return FEATURE_FLAGS[flag]
}
