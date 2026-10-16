import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, '../public/packages');

if (!fs.existsSync(PACKAGES_DIR)) {
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
}

const ESSENTIAL_PACKAGES = [
  'booktabs.sty',
  'setspace.sty',
  'enumitem.sty',
  'titlesec.sty',
  'float.sty',
  'caption.sty',
  'caption3.sty',
  'ragged2e.sty',
  'microtype.sty',
  'microtype-pdftex.def',
  'everysel.sty',
  'fancyhdr.sty',
  'tabularx.sty',
  'longtable.sty',
  'array.sty',
  'bm.sty',
  'hypcap.sty',
  'tfrupee.sty',
  'xcolor.sty',
  'colortbl.sty',
  'multicol.sty',
  'multirow.sty',
  'subcaption.sty',
  'listings.sty',
  'algorithm.sty',
  'algorithmic.sty',
  'algpseudocode.sty',
  'wrapfig.sty',
  'lipsum.sty',
  'lipsum.ltd',
];

const UPSTREAM_BASE = 'https://texlive2026.texlyre.org/26';

async function main() {
  console.log(`Downloading ${ESSENTIAL_PACKAGES.length} essential packages into ${PACKAGES_DIR}...`);

  for (const pkg of ESSENTIAL_PACKAGES) {
    const dest = path.join(PACKAGES_DIR, pkg);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      console.log(`[skip] ${pkg} already exists (${fs.statSync(dest).size} bytes)`);
      continue;
    }

    try {
      const url = `${UPSTREAM_BASE}/${pkg}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[fail] ${pkg} returned status ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log(`[ok] ${pkg} downloaded (${buf.length} bytes)`);
    } catch (err) {
      console.error(`[error] Failed to download ${pkg}:`, err);
    }
  }

  console.log('Essential packages sync completed!');
}

main();
