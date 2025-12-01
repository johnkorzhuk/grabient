import * as v from 'valibot';

export const contactFormSchema = v.object({
  email: v.optional(
    v.pipe(v.string(), v.email('Invalid email address')),
  ),
  subject: v.optional(v.string()),
  message: v.pipe(
    v.string(),
    v.minLength(1, 'Message is required'),
    v.minLength(10, 'Message must be at least 10 characters long'),
  ),
});

export const emailFieldSchema = v.pipe(
  v.string(),
  v.email('Invalid email address'),
);

export type ContactFormData = v.InferInput<typeof contactFormSchema>;
