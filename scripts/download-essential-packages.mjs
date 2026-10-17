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
  'totpages.sty',
  'environ.sty',
  'ACM-Reference-Format.bst',
  'program.sty',
  'breakurl.sty',
];

const UPSTREAM_BASE = 'https://texlive2026.texlyre.org/26';
const SPECIAL_SOURCES = {
  'sn-jnl.cls': 'https://raw.githubusercontent.com/godkingjay/springer-nature-latex-template/master/sn-jnl.cls',
  'sn-basic.bst': 'https://raw.githubusercontent.com/godkingjay/springer-nature-latex-template/master/sn-basic.bst',
};

async function main() {
  const allTargets = [
    ...ESSENTIAL_PACKAGES.map((pkg) => ({ name: pkg, url: `${UPSTREAM_BASE}/${pkg}` })),
    ...Object.entries(SPECIAL_SOURCES).map(([pkg, url]) => ({ name: pkg, url })),
  ];

  console.log(`Downloading ${allTargets.length} packages into ${PACKAGES_DIR}...`);

  for (const { name: pkg, url } of allTargets) {
    const dest = path.join(PACKAGES_DIR, pkg);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      console.log(`[skip] ${pkg} already exists (${fs.statSync(dest).size} bytes)`);
      continue;
    }

    try {
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
