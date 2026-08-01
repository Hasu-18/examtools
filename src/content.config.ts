import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    updated: z.date().optional(),

    // notification | guide | problem | books
    category: z.enum(['notification', 'guide', 'problem', 'books']),

    // Only for notification posts
    status: z.string().optional(),
    closes: z.date().optional(),

    // Slug from exams.json, embeds that exam's resizer in the post
    relatedExam: z.string().optional(),

    // Key from products.json, shows the affiliate block
    productKey: z.string().optional(),

    importantDates: z.array(z.object({
      label: z.string(),
      value: z.string(),
      link: z.string().optional()
    })).optional(),

    officialLinks: z.array(z.object({
      label: z.string(),
      url: z.string()
    })).optional(),

    vacancyHistory: z.array(z.object({
      year: z.number(),
      vacancies: z.number(),
      applicants: z.number().optional()
    })).optional(),

    draft: z.boolean().default(false)
  })
});

export const collections = { blog };