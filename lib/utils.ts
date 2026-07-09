import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface ZodIssueLike {
  message: string;
  path: (string | number)[];
}

/**
 * Turns an API's { error, issues } shape (Zod validation issues from a
 * `safeParse` failure) into a readable message — e.g. "Line 2: Description
 * is required" or "GSTIN: Invalid GSTIN format" — instead of the generic
 * top-level "error" string, so the user knows exactly which field to fix.
 */
export function describeApiError(data: {
  error?: string;
  issues?: ZodIssueLike[];
}): string {
  if (!data.issues || data.issues.length === 0) {
    return data.error ?? "Something went wrong";
  }
  const messages = data.issues.map((issue) => {
    const [section, index] = issue.path;
    if (section === "lineItems" && typeof index === "number") {
      return `Line ${index + 1}: ${issue.message}`;
    }
    const fieldName = issue.path.at(-1);
    return typeof fieldName === "string"
      ? `${fieldName}: ${issue.message}`
      : issue.message;
  });
  return messages.join(" · ");
}
