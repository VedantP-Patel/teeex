import { createStore, useStore } from './createStore';
import type { Project, ProjectFile } from '../types/latex';
import type { PaperFormatId } from '../services/paperFormats';

export interface ProjectState {
  projects: Project[];
  activeProjectId: string;
  files: ProjectFile[];
  folders: string[];
  activeFileId: string;
  openFileIds: string[];
  projectTitle: string;
  paperFormat: PaperFormatId;
  isTwoColumn: boolean;
}

const initialPaperFormat = (typeof localStorage !== 'undefined'
  ? (localStorage.getItem('teeex_paper_format') as PaperFormatId) || 'ieee'
  : 'ieee') as PaperFormatId;

const initialTwoColumn = typeof localStorage !== 'undefined'
  ? localStorage.getItem('teeex_column_mode') !== '1'
  : true;

const initialState: ProjectState = {
  projects: [],
  activeProjectId: '',
  files: [],
  folders: ['sections', 'figures'],
  activeFileId: '',
  openFileIds: [],
  projectTitle: 'Untitled Project',
  paperFormat: initialPaperFormat,
  isTwoColumn: initialTwoColumn,
};

export const projectStore = createStore<ProjectState>(initialState);

export function setProjectState(partial: Partial<ProjectState> | ((prev: ProjectState) => Partial<ProjectState>)): void {
  projectStore.setState(partial);
}

export function setProjects(projects: Project[]): void {
  projectStore.setState({ projects });
}

export function setActiveProjectId(activeProjectId: string): void {
  projectStore.setState({ activeProjectId });
}

export function setFiles(files: ProjectFile[] | ((prev: ProjectFile[]) => ProjectFile[])): void {
  if (typeof files === 'function') {
    projectStore.setState(prev => ({ files: files(prev.files) }));
  } else {
    projectStore.setState({ files });
  }
}

export function setFolders(folders: string[] | ((prev: string[]) => string[])): void {
  if (typeof folders === 'function') {
    projectStore.setState(prev => ({ folders: folders(prev.folders) }));
  } else {
    projectStore.setState({ folders });
  }
}

export function setActiveFileId(activeFileId: string): void {
  projectStore.setState(prev => ({
    activeFileId,
    openFileIds: prev.openFileIds.includes(activeFileId)
      ? prev.openFileIds
      : [...prev.openFileIds, activeFileId],
  }));
}

export function setOpenFileIds(openFileIds: string[] | ((prev: string[]) => string[])): void {
  if (typeof openFileIds === 'function') {
    projectStore.setState(prev => ({ openFileIds: openFileIds(prev.openFileIds) }));
  } else {
    projectStore.setState({ openFileIds });
  }
}

export function setProjectTitle(projectTitle: string): void {
  projectStore.setState({ projectTitle });
}

export function setPaperFormat(paperFormat: PaperFormatId): void {
  try {
    localStorage.setItem('teeex_paper_format', paperFormat);
  } catch {}
  projectStore.setState({ paperFormat });
}

export function setIsTwoColumn(isTwoColumn: boolean): void {
  try {
    localStorage.setItem('teeex_column_mode', isTwoColumn ? '2' : '1');
  } catch {}
  projectStore.setState({ isTwoColumn });
}

export function updateFileContent(fileId: string, content: string): void {
  projectStore.setState(prev => ({
    files: prev.files.map(f => (f.id === fileId ? { ...f, content } : f)),
  }));
}

export function useProjectStore<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}
