export type FileType = 'tex' | 'bib' | 'sty' | 'image';

export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  type: FileType;
  isEntry?: boolean;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SuggestedFix {
  title: string;
  description: string;
  replacement: string;
  startLine: number;
  endLine: number;
}

export interface Diagnostic {
  id: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  message: string;
  rule: string;
  rawLog?: string;
  suggestedFix?: SuggestedFix;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  avatar: string;
  cursorLine: number;
  cursorCol: number;
  activeFile: string;
  status: 'active' | 'idle' | 'typing';
  isSelf?: boolean;
}

export interface CompileState {
  status: 'idle' | 'compiling' | 'success' | 'error';
  durationMs: number;
  timestamp: string;
  errorCount: number;
  warningCount: number;
  rawLogs: string[];
}

export interface ParsedDocument {
  title: string;
  authors: string[];
  date: string;
  abstract: string;
  sections: Array<{
    title: string;
    level: number;
    content: string;
    line: number;
  }>;
  mathBlocks: Array<{
    latex: string;
    display: boolean;
    line: number;
  }>;
  isTwoColumn: boolean;
  documentClass: string;
}

export interface Template {
  id: string;
  name: string;
  category: 'Academic Paper' | 'Resume / CV' | 'Presentation' | 'Report';
  description: string;
  badge: string;
  files: ProjectFile[];
}
