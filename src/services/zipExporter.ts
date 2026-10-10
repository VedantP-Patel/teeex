import JSZip from 'jszip';
import type { ProjectFile } from '../types/latex';
import { dataUrlToUint8Array } from './virtualFileSystem';

/**
 * Packages all LaTeX files, bibliographies, and uploaded images into a clean .zip bundle
 * Ready for submission to arXiv, IEEE, ACM, or Overleaf.
 */
export async function exportProjectAsZip(projectTitle: string, files: ProjectFile[]): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    if (file.type === 'image' && file.dataUrl) {
      const buffer = dataUrlToUint8Array(file.dataUrl);
      zip.file(file.name, buffer, { binary: true });
    } else {
      zip.file(file.name, file.content);
    }
  }

  // Generate README inside zip
  zip.file('README_TEEEX.txt', `Project: ${projectTitle}\nExported from Teeex Studio (Collaborative LaTeX Platform)\nReady for compiling with pdflatex or tectonic.\nDate: ${new Date().toISOString()}\n`);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  a.href = url;
  a.download = `${safeName}_latex_bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
