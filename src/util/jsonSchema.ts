import { z } from "zod"

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

type JSONLiteral = z.infer<typeof jsonLiteralSchema>

// This can't be Record<string, JSONValue> since that interestingly induces a circular reference
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export type JSONObject = { [key: string]: JSONValue }
export type JSONValue = JSONLiteral | JSONObject | JSONValue[]

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([jsonLiteralSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)]),
)

// This schema duplicates JSONObject, but it must be this way because of the self-referential nature of JSON
export const jsonObjectSchema = z.record(jsonValueSchema)
export const stringToJSONSchema = z.string().transform((str, ctx): JSONValue => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(str)
  } catch (e: unknown) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid JSON",
      params: { error: e },
    })
    return z.NEVER
  }
})
