import { z } from "zod"

export const formatErrors = (error: z.ZodError): string => {
  return error.errors
    .map(err =>
      isUnionIssue(err)
        ? `Field "${err.path.join(".")}" failed union validation:\n` + formatUnionErrors(err.unionErrors)
        : `Field "${err.path.join(".")}" (${err.message})`,
    )
    .join("\n")
}

const isUnionIssue = (issue: z.ZodIssueBase): issue is z.ZodInvalidUnionIssue => {
  return "unionErrors" in issue
}

const formatUnionErrors = (errors: z.ZodError[]): string => {
  return errors
    .map((error, index) => {
      return `  Option ${index + 1}:\n` + formatErrors(error)
    })
    .join("\n")
}
