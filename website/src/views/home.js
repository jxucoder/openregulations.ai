import { getDockets } from '../lib/data.js';
import { esc, fmtCompact, fmtNum } from '../lib/format.js';
import { reportCard, docketRow, icons, loadingBlock, errorBlock } from '../components/ui.js';

const STEPS = [
  {
    title: 'Collect',
    body: 'Every day we pull new public comments from the Regulations.gov API for open dockets.',
  },
  {
    title: 'Separate campaigns',
    body: 'Comments that open with the same text, five or more times, are grouped as one form-letter campaign. Each campaign counts as one voice.',
  },
  {
    title: 'Read',
    body: 'Claude reads up to 300 original comments. Organizations get up to half of the sample so expert input is not drowned out.',
  },
  {
    title: 'Publish',
    body: 'The analysis covers the main arguments, who is making them, quotes you can trace, and what the sample cannot tell you.',
  },
];

export async function homeView(main) {
  main.innerHTML = `
    <section class="relative overflow-hidden border-b border-ink-100">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(53,99,233,0.08),transparent_55%)]"></div>
      <div class="container-page relative grid gap-12 py-16 sm:py-20 lg:grid-cols-12 lg:py-24">
        <div class="lg:col-span-7">
          <p class="eyebrow">Public comments on federal rules</p>
          <h1 class="mt-4 font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.6rem]">
            What is the public telling federal agencies?
          </h1>
          <p class="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            Before most federal rules take effect, anyone can comment. Thousands do, often through organized campaigns.
            We separate form letters from original comments, then publish plain-language analyses of what people actually said.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <a href="/dockets" class="btn-primary">Browse dockets ${icons.arrowRight}</a>
            <a href="/about" class="btn-secondary">How it works</a>
          </div>
        </div>
        <div class="lg:col-span-5 lg:pl-6">
          <div id="home-stats" class="card grid grid-cols-2 divide-x divide-y divide-ink-100 overflow-hidden">
            ${['Dockets tracked', 'Comments on those dockets', 'Analyses published', 'Agencies'].map((label) => `
              <div class="p-5 sm:p-6">
                <div class="skeleton h-8 w-20"></div>
                <div class="mt-2 text-xs text-ink-500">${label}</div>
              </div>`).join('')}
          </div>
          <p class="mt-3 text-xs text-ink-500">Source: <a class="underline decoration-ink-300 underline-offset-2 hover:text-ink-800" href="https://www.regulations.gov" target="_blank" rel="noopener noreferrer">Regulations.gov</a> public comment data.</p>
        </div>
      </div>
    </section>

    <section class="container-page py-16">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="eyebrow">Latest analyses</p>
          <h2 class="mt-2 font-serif text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Read what commenters argued</h2>
        </div>
        <a href="/dockets?analyzed=1" class="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800 sm:inline-flex">All analyses ${icons.arrowRight}</a>
      </div>
      <div id="home-reports" class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ${Array.from({ length: 3 }, () => `<div class="card p-5">${loadingBlock(4)}</div>`).join('')}
      </div>
    </section>

    <section class="border-y border-ink-100 bg-white">
      <div class="container-page py-16">
        <p class="eyebrow">Method</p>
        <h2 class="mt-2 max-w-2xl font-serif text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Counting voices, not copies
        </h2>
        <p class="mt-3 max-w-2xl text-ink-600">
          About half of the comments on a typical docket are form letters. Raw counts mostly measure which side ran the bigger campaign.
          We report the campaigns separately and analyze the original comments.
        </p>
        <ol class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          ${STEPS.map((s, i) => `
            <li>
              <div class="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 font-mono text-xs font-semibold text-ink-700">${i + 1}</div>
              <h3 class="mt-4 font-semibold text-ink-900">${s.title}</h3>
              <p class="mt-2 text-sm leading-relaxed text-ink-600">${s.body}</p>
            </li>`).join('')}
        </ol>
      </div>
    </section>

    <section class="container-page py-16">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="eyebrow">Most commented</p>
          <h2 class="mt-2 font-serif text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Where people are weighing in</h2>
        </div>
        <a href="/dockets" class="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">All dockets ${icons.arrowRight}</a>
      </div>
      <div id="home-top" class="card mt-8 overflow-hidden">${`<div class="p-5">${loadingBlock(5)}</div>`}</div>
    </section>
  `;

  let dockets;
  try {
    dockets = await getDockets();
  } catch (err) {
    main.querySelector('#home-reports').innerHTML = `<div class="sm:col-span-2 lg:col-span-3">${errorBlock(err.message)}</div>`;
    main.querySelector('#home-top').innerHTML = '';
    return;
  }

  const reports = dockets.filter((d) => d.hasReport);
  const totalComments = dockets.reduce((sum, d) => sum + (d.total || 0), 0);
  const agencies = new Set(dockets.map((d) => d.agency)).size;
  const stats = [
    [fmtNum(dockets.length), 'Dockets tracked'],
    [fmtCompact(totalComments), 'Comments on those dockets'],
    [fmtNum(reports.length), 'Analyses published'],
    [fmtNum(agencies), 'Agencies'],
  ];
  main.querySelector('#home-stats').innerHTML = stats.map(([value, label]) => `
    <div class="p-5 sm:p-6">
      <div class="font-serif text-3xl font-semibold tabular-nums tracking-tight text-ink-900 sm:text-4xl">${esc(value)}</div>
      <div class="mt-1 text-xs text-ink-500">${label}</div>
    </div>`).join('');

  const latest = [...reports]
    .sort((a, b) => String(b.reportAt || '').localeCompare(String(a.reportAt || '')))
    .slice(0, 6);
  main.querySelector('#home-reports').innerHTML = latest.length
    ? latest.map(reportCard).join('')
    : '<p class="text-ink-500">No analyses have been published yet.</p>';

  main.querySelector('#home-top').innerHTML = `
    <ul class="divide-y divide-ink-100">${dockets.slice(0, 8).map(docketRow).join('')}</ul>`;
}
