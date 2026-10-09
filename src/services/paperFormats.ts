/**
 * Teeex Studio — Publication & Academic Paper Formats
 * Provides standard default formats (IEEE Transactions) and user-selectable
 * presets (ACM, Nature/Springer, arXiv Preprint, Standard Article).
 */

export type PaperFormatId = 'ieee' | 'acm' | 'nature' | 'arxiv' | 'standard';

export interface PaperFormatConfig {
  id: PaperFormatId;
  name: string;
  badge: string;
  defaultColumns: 1 | 2;
  fontFamily: string;
  lineHeight: number;
  fontSize: string;
  columnGap: string;
  padding: string;
  maxWidth: string;
  headerMeta: string;
  footerMeta: string;
  description: string;
}

export const PAPER_FORMATS: Record<PaperFormatId, PaperFormatConfig> = {
  ieee: {
    id: 'ieee',
    name: 'IEEE Transactions (Standard)',
    badge: 'IEEE Standard',
    defaultColumns: 2,
    fontFamily: '"Times New Roman", Times, "Newsreader", Georgia, serif',
    lineHeight: 1.5,
    fontSize: '12.5px',
    columnGap: '28px',
    padding: '38px 34px',
    maxWidth: '640px',
    headerMeta: 'IEEE TRANSACTIONS ON COMPUTING & APPLIED MATHEMATICS, VOL. 14, NO. 3',
    footerMeta: 'Teeex Studio Typeset • IEEE Transactions Standard • Page 1',
    description: 'Default standard 2-column format with Roman section headers, IEEE abstract, and compact academic margins.',
  },
  acm: {
    id: 'acm',
    name: 'ACM Conference Proceedings',
    badge: 'ACM Conference',
    defaultColumns: 2,
    fontFamily: '"Times New Roman", Times, "Liberation Serif", serif',
    lineHeight: 1.48,
    fontSize: '12px',
    columnGap: '24px',
    padding: '36px 32px',
    maxWidth: '630px',
    headerMeta: 'ACM International Conference Proceedings Series (ICPS)',
    footerMeta: 'Teeex Studio Typeset • ACM Publication Spec • Page 1',
    description: 'ACM SIGGRAPH / CHI / KDD conference format with crisp typography and dual-column layout.',
  },
  nature: {
    id: 'nature',
    name: 'Nature / Springer',
    badge: 'Nature Portfolio',
    defaultColumns: 1,
    fontFamily: 'Georgia, "Newsreader", "Times New Roman", serif',
    lineHeight: 1.65,
    fontSize: '13.5px',
    columnGap: 'normal',
    padding: '48px 50px',
    maxWidth: '620px',
    headerMeta: 'Nature Computational Science | Research Article',
    footerMeta: 'Teeex Studio Typeset • Nature Portfolio • Page 1',
    description: 'High-impact single-column layout with generous margins and readable editorial typography.',
  },
  arxiv: {
    id: 'arxiv',
    name: 'arXiv Preprint',
    badge: 'arXiv Preprint',
    defaultColumns: 1,
    fontFamily: '"Computer Modern", "Latin Modern Roman", "Times New Roman", serif',
    lineHeight: 1.6,
    fontSize: '13px',
    columnGap: 'normal',
    padding: '44px 44px',
    maxWidth: '610px',
    headerMeta: 'arXiv:2603.04891v2 [cs.QC] 2026',
    footerMeta: 'Teeex Studio Typeset • arXiv Preprint Archive • Page 1',
    description: 'Standard preprint archive format modeled after classic LaTeX article and Cornell arXiv.',
  },
  standard: {
    id: 'standard',
    name: 'Standard LaTeX Article',
    badge: 'LaTeX Standard',
    defaultColumns: 1,
    fontFamily: '"Newsreader", "Times New Roman", Times, serif',
    lineHeight: 1.55,
    fontSize: '13px',
    columnGap: 'normal',
    padding: '44px 40px',
    maxWidth: '610px',
    headerMeta: 'Teeex Studio • Standard Academic Document',
    footerMeta: 'Teeex Studio Typeset • Standard Article • Page 1',
    description: 'Classic LaTeX \\documentclass{article} format suitable for general papers and essays.',
  },
};
