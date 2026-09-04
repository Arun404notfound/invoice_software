import { z } from "zod";
import { gstStateCodeSchema, rupeeAmountStringSchema } from "./common";
import { CURRENCY_CODES } from "@/lib/money";

const currencySchema = z.enum(CURRENCY_CODES as [string, ...string[]]).default("INR");

const percentStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage");

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  hsnSacCode: z.string().trim().min(1, "SAC code is required"),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "Invalid quantity"),
  unit: z.string().trim().min(1, "Unit is required"),
  rate: rupeeAmountStringSchema,
  discountPercent: percentStringSchema.default("0"),
  taxRatePercent: percentStringSchema,
});

export const invoiceSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  issueDate: z.string().min(1, "Issue date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  placeOfSupplyStateCode: gstStateCodeSchema,
  currency: currencySchema,
  isExport: z.boolean().default(false),
  overallDiscount: rupeeAmountStringSchema.default("0"),
  notes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  lineItems: z
    .array(invoiceLineItemSchema)
    .min(1, "At least one line item is required"),
});

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
});
