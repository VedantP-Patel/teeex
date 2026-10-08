export interface BibEntry {
  key: string;
  type: string;
  title: string;
  author: string;
  year: string;
  journal?: string;
  booktitle?: string;
}

/**
 * High-speed BibTeX Parser
 * Parses .bib files into structured citation objects
 */
export function parseBibtex(bibContent: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const regex = /@([a-zA-Z]+)\s*\{\s*([^,]+),([\s\S]*?)(?=\n@|\n*$)/g;
  let match;

  while ((match = regex.exec(bibContent)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const body = match[3];

    const titleMatch = body.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const authorMatch = body.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const yearMatch = body.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
    const journalMatch = body.match(/journal\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const booktitleMatch = body.match(/booktitle\s*=\s*[\{"]([^"\}]+)[\}"]/i);

    entries.push({
      key,
      type,
      title: titleMatch ? titleMatch[1].trim() : 'Untitled Paper',
      author: authorMatch ? authorMatch[1].trim() : 'Unknown Author',
      year: yearMatch ? yearMatch[1].trim() : 'n.d.',
      journal: journalMatch ? journalMatch[1].trim() : undefined,
      booktitle: booktitleMatch ? booktitleMatch[1].trim() : undefined,
    });
  }

  return entries;
}
