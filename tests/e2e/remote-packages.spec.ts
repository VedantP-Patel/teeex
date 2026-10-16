import { test, expect, type Page } from '@playwright/test';

const IEEE_SOURCE = String.raw`\documentclass[conference]{IEEEtran}
\usepackage{amsmath}
\usepackage{lipsum}
\begin{document}
\title{Two Column Resolution Test}
\author{\IEEEauthorblockN{Playwright}}
\maketitle
\begin{abstract}
This document uses the IEEEtran class, which is not part of the bundled
texlive-basic set and must be fetched on demand.
\end{abstract}
\section{Body}
\lipsum[1-4]
\section{More}
\lipsum[5-8]
\end{document}`;

async function setCodeMirrorContent(page: Page, source: string): Promise<void> {
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await editor.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    el.dispatchEvent(pasteEvent);

    if (!pasteEvent.defaultPrevented) {
      const anyEl = el as unknown as {
        cmView?: { view?: { state: { doc: { length: number } }; dispatch: (tr: unknown) => void } };
      };
      const rootEl = el.closest('.cm-editor') as unknown as typeof anyEl | null;
      const view = anyEl.cmView?.view ?? rootEl?.cmView?.view;
      view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        userEvent: 'input.paste',
      });
    }
  }, source);
}

test.describe('@remote on-demand package resolution', () => {
  test.skip(
    Boolean(process.env.TEEEX_SKIP_REMOTE),
    'Remote TeX Live endpoint disabled for this run.',
  );

  test('an IEEEtran document resolves its class and typesets two columns', async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const failedRequests: string[] = [];
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (/busytex|texlive|\.sty|\.cls/.test(url)) {
        failedRequests.push(`${url}: ${request.failure()?.errorText}`);
      }
    });

    await seedUser(page, 'e2e-remote');
    await page.goto('/');
    await setCodeMirrorContent(page, IEEE_SOURCE);

    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    await expect(preview).toBeVisible({ timeout: 30_000 });

    const canvas = preview.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 300_000 });

    const { numPages, twoColumnShare } = await inspectDownloadedPdf(page);
    expect(numPages).toBeGreaterThan(0);
    expect(
      twoColumnShare,
      `Expected two populated columns; share=${twoColumnShare}`,
    ).toBeGreaterThan(0.2);

    expect(failedRequests, `Package fetch failures:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test.fixme(
    'an acmart (sigconf) document resolves and typesets two columns',
    async ({ page }) => {
      test.setTimeout(360_000);

      await seedUser(page, 'e2e-acmart');
      await page.goto('/');

      await setCodeMirrorContent(
        page,
        String.raw`\documentclass[sigconf,nonacm]{acmart}
\usepackage{lipsum}
\begin{document}
\title{ACM Resolution Test}
\author{Playwright}
\affiliation{\institution{Teeex}}
\maketitle
\section{Body}
\lipsum[1-6]
\section{More}
\lipsum[7-12]
\end{document}`,
      );

      const preview = page.getByRole('document', { name: 'Compiled document preview' });
      await expect(preview).toBeVisible({ timeout: 30_000 });
      await expect(preview.locator('canvas').first()).toBeVisible({ timeout: 300_000 });

      const { numPages, twoColumnShare } = await inspectDownloadedPdf(page);
      expect(numPages).toBeGreaterThan(0);
      expect(
        twoColumnShare,
        `acmart sigconf should be two-column; share=${twoColumnShare}`,
      ).toBeGreaterThan(0.2);
    },
  );

  test.fixme('an sn-jnl document resolves and typesets', async ({ page }) => {
    test.setTimeout(360_000);

    await seedUser(page, 'e2e-snjnl');
    await page.goto('/');

    await setCodeMirrorContent(
      page,
      String.raw`\documentclass[pdflatex,sn-basic]{sn-jnl}
\usepackage{lipsum}
\begin{document}
\title{Springer Nature Resolution Test}
\author[1]{Playwright}
\affil[1]{Teeex}
\maketitle
\section{Body}
\lipsum[1-6]
\end{document}`,
    );

    const preview = page.getByRole('document', { name: 'Compiled document preview' });
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview.locator('canvas').first()).toBeVisible({ timeout: 300_000 });

    const { numPages } = await inspectDownloadedPdf(page);
    expect(numPages).toBeGreaterThan(0);
  });
});

async function seedUser(page: Page, id: string) {
  await page.addInitScript((userId) => {
    localStorage.setItem(
      'teeex_auth_user',
      JSON.stringify({
        id: userId,
        email: `${userId}@teeex.local`,
        fullName: 'Playwright',
        avatarColor: '#38bdf8',
        avatarUrl: '',
        isAnonymous: false,
        isAdmin: false,
        isApproved: true,
      }),
    );
    localStorage.removeItem('teeex_signed_out');
  }, id);
}

async function inspectDownloadedPdf(page: Page) {
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('button[title="Download the compiled PDF"]').click(),
  ]).then(([d]) => d);

  const fs = await import('node:fs/promises');
  const bytes = new Uint8Array(await fs.readFile((await download.path())!));
  expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const content = await firstPage.getTextContent();
  const xs = content.items
    .filter((item) => 'transform' in item && 'str' in item && (item as { str: string }).str.trim())
    .map((item) => (item as { transform: number[] }).transform[4]);

  const midpoint = viewport.width / 2;
  const left = xs.filter((x) => x < midpoint).length;
  const right = xs.filter((x) => x >= midpoint).length;
  const twoColumnShare = xs.length > 0 ? Math.min(left, right) / xs.length : 0;

  return { numPages: pdf.numPages, twoColumnShare };
}