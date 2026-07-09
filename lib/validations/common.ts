import { z } from "zod";

// Standard 15-character GSTIN format.
export const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_PATTERN, "Invalid GSTIN format");

export const optionalGstinSchema = z
  .union([gstinSchema, z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

// PAN: first 10 characters of a GSTIN's PAN segment, same alphanumeric shape.
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_PATTERN, "Invalid PAN format");

export const optionalPanSchema = z
  .union([panSchema, z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const gstStateCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, "Invalid state code");

// Rupee amount as typed in a form field, e.g. "1234.50" — parsed to paise
// downstream via lib/money.ts#rupeesToPaise, never through float math here.
export const rupeeAmountStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Invalid amount");
