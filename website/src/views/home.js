import { getDockets } from '../lib/data.js';
import { reportRow, icons, loadingBlock, errorBlock } from '../components/ui.js';

export async function homeView(main) {
  main.innerHTML = `
    <section class="bg-accent-600 text-white">
      <div class="container-page grid items-center gap-10 pb-16 pt-12 sm:pb-20 sm:pt-16 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h1 class="text-[2.75rem] font-black leading-[1] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            AI analysis of public comments on federal rules.
          </h1>
          <p class="mt-6 max-w-lg text-lg leading-relaxed text-white/85 sm:text-xl">
            What thousands of commenters told the agency, in a few minutes of reading.
          </p>
          <a href="/dockets" class="mt-8 inline-flex items-center gap-2 bg-white px-5 py-3.5 font-bold text-ink-900 transition-colors hover:bg-accent-50">
            Browse analyses ${icons.arrowRight}
          </a>
        </div>
        <div class="fig-field mx-auto w-full max-w-md" data-figure="sieve" data-play="1"
          data-label="Three stacked sieves, separating comments"></div>
      </div>
    </section>

    <section class="container-page py-14 sm:py-16">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">Latest analyses</h2>
        <a href="/dockets" class="inline-flex items-center gap-1.5 text-sm font-bold text-accent-700 hover:text-ink-900">All ${icons.arrowRight}</a>
      </div>
      <ol id="home-reports" class="mt-6 border-t-2 border-ink-900">
        <li class="py-6">${loadingBlock(4)}</li>
      </ol>
    </section>
  `;

  const list = main.querySelector('#home-reports');
  try {
    const dockets = await getDockets();
    const latest = dockets
      .filter((d) => d.hasReport)
      .sort((a, b) => String(b.reportAt || '').localeCompare(String(a.reportAt || '')))
      .slice(0, 8);
    list.innerHTML = latest.length
      ? latest.map(reportRow).join('')
      : '<li class="py-6 text-ink-500">No analyses have been published yet.</li>';
  } catch (err) {
    list.innerHTML = `<li class="py-6">${errorBlock(err.message)}</li>`;
  }
}
