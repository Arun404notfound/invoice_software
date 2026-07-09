import { z } from "zod";
import { gstStateCodeSchema, optionalGstinSchema } from "./common";

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined));
}

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  company: optionalTrimmed(),
  email: z
    .union([z.string().trim().toLowerCase().email(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  phone: optionalTrimmed(),
  gstin: optionalGstinSchema,
  billingAddressLine1: optionalTrimmed(),
  billingAddressLine2: optionalTrimmed(),
  city: optionalTrimmed(),
  state: optionalTrimmed(),
  stateCode: z
    .union([gstStateCodeSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  pincode: optionalTrimmed(),
  currency: z.string().trim().min(1).default("INR"),
  notes: optionalTrimmed(),
});

export type ClientInput = z.infer<typeof clientSchema>;
