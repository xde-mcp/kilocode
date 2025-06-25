import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useMemo } from "react"

// If auto-condense is not enabled, default to highlighting at 100%
const DEFAULT_THRESHOLD_LIMIT = 100

export function KiloContextWindowProgressTokensUsed({ currentPercent }: { currentPercent: number }) {
	const {
		autoCondenseContext,
		autoCondenseContextPercent,
		profileThresholds,
		currentApiConfigName,
		listApiConfigMeta,
	} = useExtensionState()

	const thresholdPercent = useMemo(() => {
		if (!autoCondenseContext) {
			return DEFAULT_THRESHOLD_LIMIT
		}

		// If profile threshold exists and is not -1 (which means use global), use it
		const currentConfig = listApiConfigMeta?.find((config) => config.name === currentApiConfigName)
		const profileThreshold = profileThresholds[currentConfig?.id || ""]
		if (profileThreshold !== undefined && profileThreshold !== -1) {
			return profileThreshold
		}

		// Otherwise, use the global auto-condense threshold
		return autoCondenseContextPercent
	}, [autoCondenseContext, autoCondenseContextPercent, profileThresholds, currentApiConfigName, listApiConfigMeta])

	// We treat 50% of the entire context as the limit so multiply by 2 to get to 100%
	const highlightNearLimit = currentPercent * 2 >= thresholdPercent

	return (
		<div
			className={cn(
				"h-full w-full bg-[var(--vscode-foreground)] transition-width transition-color duration-300 ease-out",
				highlightNearLimit && "bg-[color-mix(in_srgb,var(--vscode-errorForeground)_60%,rgba(128,0,0,1))]",
			)}
		/>
	)
}
