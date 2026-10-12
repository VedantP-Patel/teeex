/**
 * Teeex — Pre-bundled academic templates and font metric assets.
 *
 * Pre-seeds popular academic packages (IEEEtran, cite, acmart) and essential
 * font metrics (Times, Helvetica, AMS Math) into the WebAssembly engine's
 * in-memory kpathsea tree on initialization.
 *
 * This eliminates the 20-30 sequential synchronous network calls across WAN
 * that previously caused 30-60 second compile times.
 */

export interface BundledPackageDef {
  name: string;
  format: number; // 26 = TeX/LaTeX class/style/source, 51 = TFM font metric
}

export const BUNDLED_PACKAGES: BundledPackageDef[] = [
  { name: 'IEEEtran.cls', format: 26 },
  { name: 'cite.sty', format: 26 },
  { name: 'acmart.cls', format: 26 },
  { name: 'ot1ptm.fd', format: 26 },
  { name: 'omlptm.fd', format: 26 },
  { name: 'omsptm.fd', format: 26 },
  { name: 't1ptm.fd', format: 26 },
  { name: 'ptmr7t.tfm', format: 51 },
  { name: 'ptmb7t.tfm', format: 51 },
  { name: 'ptmri7t.tfm', format: 51 },
  { name: 'ptmro7t.tfm', format: 51 },
  { name: 'ptmrc7t.tfm', format: 51 },
  { name: 'phvr7t.tfm', format: 51 },
  { name: 'pcrr7t.tfm', format: 51 },
  { name: 'msam10.tfm', format: 51 },
  { name: 'msbm10.tfm', format: 51 },
  { name: 'msam7.tfm', format: 51 },
  { name: 'msbm7.tfm', format: 51 },
  { name: 'msam5.tfm', format: 51 },
  { name: 'msbm5.tfm', format: 51 },
];

export interface LoadedPackage {
  name: string;
  format: number;
  content: Uint8Array;
}

const packageMemoryCache = new Map<string, Uint8Array>();
let loadPromise: Promise<LoadedPackage[]> | null = null;

export async function getBundledPackages(): Promise<LoadedPackage[]> {
  if (packageMemoryCache.size === BUNDLED_PACKAGES.length) {
    return BUNDLED_PACKAGES.map((pkg) => ({
      name: pkg.name,
      format: pkg.format,
      content: packageMemoryCache.get(pkg.name)!,
    }));
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const results: LoadedPackage[] = [];
    await Promise.all(
      BUNDLED_PACKAGES.map(async (pkg) => {
        try {
          const res = await fetch(`/packages/${pkg.name}`);
          if (res.ok) {
            const buf = new Uint8Array(await res.arrayBuffer());
            packageMemoryCache.set(pkg.name, buf);
            results.push({
              name: pkg.name,
              format: pkg.format,
              content: buf,
            });
          }
        } catch (_err) {
          // Graceful fallback if asset cannot be fetched
        }
      }),
    );
    return results;
  })();

  return loadPromise;
}

/**
 * Returns package content synchronously if already pre-loaded into memory.
 */
export function getCachedPackageContent(name: string): Uint8Array | undefined {
  return packageMemoryCache.get(name);
}
