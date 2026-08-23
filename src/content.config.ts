import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    updated: z.date().optional(),

    // exam-details | notification | guide | problem | books
    category: z.enum(['exam-details', 'notification', 'guide', 'problem', 'books']),

    // Live status, used by notification and exam-details posts
    status: z.string().optional(),
    closes: z.date().optional(),

    relatedExam: z.string().optional(),
    products: z.array(z.string()).optional(),

    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    coverCredit: z.string().optional(),

    // Small stat cards at the top of the post
    quickFacts: z.array(z.object({
      label: z.string(),
      value: z.string()
    })).optional(),

    importantDates: z.array(z.object({
      label: z.string(),
      value: z.string(),
      link: z.string().optional()
    })).optional(),

    officialLinks: z.array(z.object({
      label: z.string(),
      url: z.string()
    })).optional(),

    // Exam pattern table
    examPattern: z.object({
      note: z.string().optional(),
      totalMarks: z.string().optional(),
      duration: z.string().optional(),
      negativeMarking: z.string().optional(),
      sections: z.array(z.object({
        name: z.string(),
        questions: z.string().optional(),
        marks: z.string().optional()
      }))
    }).optional(),

    // Eligibility rows
    eligibility: z.array(z.object({
      label: z.string(),
      value: z.string()
    })).optional(),

    // Pay by post, rendered as bars
    salary: z.object({
      note: z.string().optional(),
      posts: z.array(z.object({
        post: z.string(),
        pay: z.string(),
        amount: z.number().optional()
      }))
    }).optional(),

    vacancyHistory: z.array(z.object({
      year: z.number(),
      vacancies: z.number(),
      applicants: z.number().optional()
    })).optional(),

    // Competition ratio, rendered as a highlight
    competition: z.object({
      applicants: z.string().optional(),
      posts: z.string().optional(),
      ratio: z.string().optional(),
      note: z.string().optional()
    }).optional(),

    faqs: z.array(z.object({
      q: z.string(),
      a: z.string()
    })).optional(),

    draft: z.boolean().default(false)
  })
});

export const collections = { blog };