This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Feedback form setup

The "Contact" footer button and the hub "Flag an error" link open a feedback
form that POSTs to [Formspree](https://formspree.io) — no backend required.

1. Create a free Formspree account and a new form. Point its notifications at
   whatever email alias you like (nothing is exposed on the site).
2. Copy the form id (the part after `/f/` in the endpoint).
3. Add it to `.env.local`:

   ```
   NEXT_PUBLIC_FORMSPREE_ID=your_form_id_here
   ```

If the variable is unset, the form shows a friendly "not set up yet" message and
points visitors to GitHub instead. The id is public by design (it ships in the
client bundle), so it is safe to commit in deployment env config.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
