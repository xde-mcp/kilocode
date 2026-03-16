// kilocode_change - new file
// Kilo-specific routes that live in the CLI package (direct access to internals).
// All future kilo-specific endpoints should be added here.
import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Skill } from "../../skill/skill"
import { lazy } from "../../util/lazy"
import { errors } from "../error"

export const KilocodeRoutes = lazy(() =>
  new Hono().delete(
    "/skill",
    describeRoute({
      summary: "Remove a skill",
      description: "Remove a skill by deleting its directory from disk and clearing it from cache.",
      operationId: "kilocode.removeSkill",
      responses: {
        200: {
          description: "Skill removed",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "query",
      z.object({
        location: z.string(),
      }),
    ),
    async (c) => {
      const { location } = c.req.valid("query")
      await Skill.remove(location)
      return c.json(true)
    },
  ),
)
