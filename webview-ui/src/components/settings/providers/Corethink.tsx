import { useCallback } from "react"
import type { ProviderSettings } from "@roo-code/types"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import { inputEventTransform } from "../transforms"

type CorethinkProps = {
	_apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	simplifySettings?: boolean
}

export const Corethink = ({ _apiConfiguration, setApiConfigurationField }: CorethinkProps) => {
	const { _t } = useAppTranslation()

	const _handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			{/* Add the input fields back in when Corethink API key is required */}
		</>
	)
}
