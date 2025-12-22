import * as z from "zod/v4"

export const VercelAiGatewayChunkSchema = z.object({
	choices: z
		.array(
			z.object({
				delta: z.object({
					provider_metadata: z.object({
						gateway: z.object({
							routing: z.object({
								resolvedProvider: z.string(),
							}),
						}),
					}),
				}),
			}),
		)
		.min(1),
})
