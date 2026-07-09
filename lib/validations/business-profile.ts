import { z } from "zod";
import {
  gstStateCodeSchema,
  optionalGstinSchema,
  optionalPanSchema,
} from "./common";

export const businessProfileSchema = z.object({
  legalName: z.string().trim().min(1, "Legal name is required"),
  tradeName: z.string().trim().optional(),
  gstin: optionalGstinSchema,
  pan: optionalPanSchema,

  addressLine1: z.string().trim().min(1, "Address is required"),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  stateCode: gstStateCodeSchema,
  pincode: z.string().trim().regex(/^\d{6}$/, "Invalid pincode"),

  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(10, "Invalid phone number"),

  logoUrl: z.string().trim().optional(),
  signatureUrl: z.string().trim().optional(),

  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().toUpperCase().optional(),
  upiId: z.string().trim().optional(),

  invoiceNumberFormat: z.string().trim().min(1).default("TG/{FY}/{seq}"),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #10B981"),
  defaultTemplateId: z.enum(["CHARCOAL", "CLASSIC"]),
  defaultTaxRatePercent: z.number().int().min(0).max(100),
  defaultDueDays: z.number().int().min(0).max(365),
  defaultTermsText: z.string().trim().optional(),
  defaultNotesText: z.string().trim().optional(),
  exportDeclarationText: z.string().trim().optional(),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
