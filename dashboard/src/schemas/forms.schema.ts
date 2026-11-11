import * as yup from "yup";

export const loginSchema = yup.object({
  email: yup.string().email("Enter a valid email").required("Email is required"),
  password: yup.string().required("Password is required"),
});

export const commandSchema = yup.object({
  title: yup.string().max(200, "Max 200 characters").optional(),
  priority: yup.string().oneOf(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).required(),
  instruction: yup
    .string()
    .min(5, "Instruction is too short")
    .max(4000, "Max 4000 characters")
    .required("Enter a CEO instruction"),
  clarificationAnswer: yup.string().optional(),
});

export const memorySchema = yup.object({
  category: yup
    .string()
    .oneOf([
      "INSTRUCTION",
      "REQUIREMENT",
      "TECH_DECISION",
      "ARCHITECTURE",
      "LESSON_LEARNED",
      "FEEDBACK",
      "STRATEGY",
    ])
    .required(),
  title: yup.string().required("Title is required").max(200),
  content: yup.string().required("Content is required"),
  tags: yup.string().optional(),
});

export const repoSchema = yup.object({
  owner: yup.string().required("GitHub owner/org is required"),
  name: yup.string().required("Repository name is required"),
  defaultBranch: yup.string().default("main"),
  isWriteAuthorized: yup.boolean().default(false),
});

export const campaignSchema = yup.object({
  name: yup.string().required("Campaign name is required").max(200),
  channel: yup.string().oneOf(["EMAIL", "SEO", "CONTENT", "SOCIAL"]).required(),
  targetAudience: yup.string().optional(),
});

export const leadSchema = yup.object({
  businessName: yup.string().required("Business name is required").max(200),
  contactName: yup.string().optional(),
  email: yup.string().email("Invalid email").optional(),
  phone: yup.string().optional(),
  city: yup.string().optional(),
  website: yup.string().optional(),
});

export const budgetSchema = yup.object({
  dailyTokenLimit: yup
    .number()
    .typeError("Must be a number")
    .min(1000, "Minimum 1,000 tokens")
    .required(),
  maxConcurrentRequests: yup
    .number()
    .typeError("Must be a number")
    .min(1, "Minimum 1")
    .max(20, "Max 20")
    .required(),
  allowPaidProviders: yup.boolean().required(),
});
