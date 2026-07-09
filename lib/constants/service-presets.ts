/**
 * Reference presets for a pure software-services shop (web/app/LMS/
 * e-learning development) — no physical goods, so these are what actually
 * get used day to day. Both lists are suggestions only (rendered via
 * <datalist>, not a locked dropdown) since the invoice builder accepts any
 * free-text HSN/SAC code or unit.
 *
 * SAC codes are commonly used codes for IT/software services under GST
 * chapter 9983/9973 — confirm the exact code with your CA/GST practitioner
 * before relying on it for filing; this list is a starting point, not a
 * substitute for professional advice.
 */
export interface ServiceCodeSuggestion {
  code: string;
  label: string;
}

export const SAC_CODE_SUGGESTIONS: ServiceCodeSuggestion[] = [
  { code: "998314", label: "IT design and development services" },
  { code: "998313", label: "IT consulting and support services" },
  { code: "998315", label: "Hosting and IT infrastructure provisioning" },
  { code: "998316", label: "IT infrastructure and network management" },
  { code: "997331", label: "Licensing for right to use computer software" },
  { code: "999293", label: "Commercial training and coaching services" },
];

export const UNIT_SUGGESTIONS: string[] = [
  "Hours",
  "Days",
  "Month",
  "License",
  "User",
  "Project",
  "Milestone",
  "Module",
];
