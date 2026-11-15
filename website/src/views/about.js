import { REPO_URL } from '../components/layout.js';

const section = (title, body) => `
  <section class="mt-12">
    <h2 class="font-sans text-2xl font-extrabold tracking-tight text-ink-900">${title}</h2>
    <div class="mt-4 space-y-4 leading-relaxed text-ink-700">${body}</div>
  </section>`;

export function aboutView(main) {
  main.innerHTML = `
    <div class="container-page py-12 sm:py-16">
      <div class="mx-auto max-w-2xl">
        <p class="eyebrow">Methodology</p>
        <h1 class="mt-3 font-sans text-4xl font-black tracking-[-0.035em] text-ink-900">How the analysis works</h1>
        <p class="mt-5 text-lg leading-relaxed text-ink-600">
          Federal agencies must take public comments into account before finalizing most rules. Large dockets get thousands of comments,
          and many of them are the same letter submitted again and again. This page explains how we turn that into something readable,
          and where it falls short.
        </p>

        ${section('1. Collecting comments', `
          <p>A scheduled job pulls dockets and their public comments from the official
          <a class="text-accent-700 underline underline-offset-2" href="https://open.gsa.gov/api/regulationsgov/" target="_blank" rel="noopener noreferrer">Regulations.gov API</a>.
          The API is rate-limited, so on very large dockets we retrieve a portion of the comments rather than all of them.
          Every docket page shows both numbers: the total on the docket and how many we retrieved.</p>
          <p>Many comments are uploaded as PDF or Word attachments. We currently analyze only the comment text, so attachment-only submissions
          (often “See attached”) carry little signal.</p>`)}

        ${section('2. Detecting form-letter campaigns', `
          <p>We normalize each comment's text (lowercase, collapsed whitespace) and compare the first 500 characters.
          When five or more comments share the same opening, we treat them as one campaign. A campaign signals organized advocacy,
          and it is reported as a single position with a count, not as hundreds of separate voices.</p>
          <p>This method is deliberately simple. Campaigns that encourage people to personalize the template can slip through as original comments.</p>`)}

        ${section('3. Sampling and reading', `
          <p>From the original (non-campaign) comments we pick up to 300 for the model to read in full. Comments from organizations,
          such as companies, advocacy groups, and governments, get up to half of the sample, because they are fewer and often more detailed.
          The rest are comments from individuals.</p>
          <p>Claude, Anthropic's AI model, then writes an analysis the way a policy analyst would: the main arguments, who is making them,
          representative quotes, regional patterns, and what is missing from the record.
          It is instructed to state its sample size and the limits of what it can conclude.</p>`)}

        ${section('What to keep in mind', `
          <ul class="list-disc space-y-2 pl-5 marker:text-ink-300">
            <li><strong class="text-ink-900">Comments are not a poll.</strong> The people who comment choose to, and organized groups mobilize unevenly. Agencies weigh the substance of an argument, not the number of times it was made.</li>
            <li><strong class="text-ink-900">AI makes mistakes.</strong> Analyses can mischaracterize or overstate. Quotes are taken from comments, but the factual claims inside them are the commenters' and have not been checked.</li>
            <li><strong class="text-ink-900">Coverage is partial.</strong> On large dockets the analysis reflects the comments retrieved so far.</li>
          </ul>`)}

        ${section('Open source', `
          <p>The pipeline, prompts, and this website are open source under the Apache 2.0 license.
          If you find an error in an analysis, or want a docket covered, please <a class="text-accent-700 underline underline-offset-2" href="${REPO_URL}/issues" target="_blank" rel="noopener noreferrer">open an issue</a>.</p>
          <p class="text-sm text-ink-500">OpenRegulations.ai is independent and not affiliated with any government agency or with Regulations.gov.</p>`)}
      </div>
    </div>`;
  return {
    title: 'How the analysis works',
    description: 'How OpenRegulations.ai collects public comments, detects form-letter campaigns, and writes AI analyses, and where the method falls short.',
  };
}
