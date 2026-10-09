/**
 * Teeex Studio — DOI & BibTeX Citation Service
 * Real-time bibliographic metadata resolution via CrossRef and DOI Content Negotiation
 */

export interface FetchedCitation {
  key: string;
  bibtex: string;
  title: string;
  author: string;
  year: string;
  journal?: string;
  doi: string;
}

/**
 * Fetch formatted BibTeX from DOI (e.g. 10.1038/s41586-024-07153-6 or https://doi.org/...)
 */
export async function fetchBibtexByDoi(doiInput: string): Promise<FetchedCitation> {
  let cleanDoi = doiInput.trim();
  cleanDoi = cleanDoi.replace(/^https?:\/\/doi\.org\//i, '');
  cleanDoi = cleanDoi.replace(/^doi:\s*/i, '');

  if (!cleanDoi.includes('/')) {
    throw new Error('Invalid DOI format. Expected format: 10.xxxx/yyyy');
  }

  // 1. Direct Content Negotiation with doi.org
  const url = `https://doi.org/${encodeURIComponent(cleanDoi)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/x-bibtex; charset=utf-8',
    },
  });

  if (!response.ok) {
    // Fallback: CrossRef API
    return await fetchFromCrossRef(cleanDoi);
  }

  const bibtex = await response.text();
  if (!bibtex || !bibtex.includes('@')) {
    return await fetchFromCrossRef(cleanDoi);
  }

  return parseBibtexMetadata(bibtex, cleanDoi);
}

async function fetchFromCrossRef(doi: string): Promise<FetchedCitation> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to locate DOI "${doi}". Please verify the identifier.`);
  }

  const data = await res.json();
  const item = data.message;

  const title = item.title?.[0] || 'Untitled Work';
  const authorList = item.author?.map((a: { given?: string; family?: string }) => `${a.family || ''}, ${a.given || ''}`).join(' and ') || 'Unknown Author';
  const firstAuthorFamily = (item.author?.[0]?.family || 'citation').toLowerCase().replace(/[^a-z0-9]/g, '');
  const year = item.created?.['date-parts']?.[0]?.[0]?.toString() || new Date().getFullYear().toString();
  const journal = item['container-title']?.[0] || '';
  const key = `${firstAuthorFamily}${year}${title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  const bibtex = `@article{${key},
  title={${title}},
  author={${authorList}},
  journal={${journal}},
  year={${year}},
  doi={${doi}}
}`;

  return {
    key,
    bibtex,
    title,
    author: authorList,
    year,
    journal,
    doi,
  };
}

function parseBibtexMetadata(bibtex: string, doi: string): FetchedCitation {
  const keyMatch = bibtex.match(/@\w+\s*\{\s*([^,\s]+)/);
  const key = keyMatch ? keyMatch[1].trim() : 'citation' + Date.now();

  const titleMatch = bibtex.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
  const authorMatch = bibtex.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
  const yearMatch = bibtex.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
  const journalMatch = bibtex.match(/journal\s*=\s*[\{"]([^"\}]+)[\}"]/i);

  return {
    key,
    bibtex: bibtex.trim(),
    title: titleMatch ? titleMatch[1].trim() : 'Fetched Article',
    author: authorMatch ? authorMatch[1].trim() : 'Unknown',
    year: yearMatch ? yearMatch[1].trim() : new Date().getFullYear().toString(),
    journal: journalMatch ? journalMatch[1].trim() : undefined,
    doi,
  };
}
