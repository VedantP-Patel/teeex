import React, { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { Checkpoint } from '../../services/checkpointsService';
import type {
  ProjectFile,
  Collaborator,
  Template,
  Project,
  ProjectRole,
  UserProfile,
  ParsedDocument,
} from '../../types/latex';
import type { PaperFormatId } from '../../services/paperFormats';

// Lazy-loaded modal dialogs for zero initial bundle overhead
const SymbolPaletteModal = lazy(() =>
  import('./SymbolPaletteModal').then((m) => ({ default: m.SymbolPaletteModal }))
);
const TableBuilderModal = lazy(() =>
  import('./TableBuilderModal').then((m) => ({ default: m.TableBuilderModal }))
);
const ShareModal = lazy(() =>
  import('./ShareModal').then((m) => ({ default: m.ShareModal }))
);
const TemplateModal = lazy(() =>
  import('./TemplateModal').then((m) => ({ default: m.TemplateModal }))
);
const ImageUploadModal = lazy(() =>
  import('./ImageUploadModal').then((m) => ({ default: m.ImageUploadModal }))
);
const VersionHistoryModal = lazy(() =>
  import('./VersionHistoryModal').then((m) => ({ default: m.VersionHistoryModal }))
);
const WordCountModal = lazy(() =>
  import('./WordCountModal').then((m) => ({ default: m.WordCountModal }))
);
const AuthModal = lazy(() =>
  import('./AuthModal').then((m) => ({ default: m.AuthModal }))
);
const ProjectsDashboardModal = lazy(() =>
  import('./ProjectsDashboardModal').then((m) => ({ default: m.ProjectsDashboardModal }))
);
const CommandPaletteModal = lazy(() =>
  import('./CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal }))
);
const AuditLogModal = lazy(() =>
  import('./AuditLogModal').then((m) => ({ default: m.AuditLogModal }))
);
const EncryptionModal = lazy(() =>
  import('./EncryptionModal').then((m) => ({ default: m.EncryptionModal }))
);

export function ModalLoadingFallback() {
  return (
    <div className="modal-loading-backdrop" aria-busy="true" aria-label="Loading dialog">
      <div className="modal-loading-card">
        <Loader2 size={18} className="spin" style={{ color: 'var(--accent-cyan)' }} />
        <span>Loading dialog...</span>
      </div>
    </div>
  );
}

export interface ModalContainerProps {
  // Modal visibility states
  isImageUploadOpen: boolean;
  setIsImageUploadOpen: (open: boolean) => void;
  isSymbolsOpen: boolean;
  setIsSymbolsOpen: (open: boolean) => void;
  symbolsInitialTab: 'symbols' | 'snippets' | 'macros';
  isTableBuilderOpen: boolean;
  setIsTableBuilderOpen: (open: boolean) => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  isWordCountOpen: boolean;
  setIsWordCountOpen: (open: boolean) => void;
  isShareOpen: boolean;
  setIsShareOpen: (open: boolean) => void;
  isTemplatesOpen: boolean;
  setIsTemplatesOpen: (open: boolean) => void;
  isAuthOpen: boolean;
  setIsAuthOpen: (open: boolean) => void;
  isProjectsHubOpen: boolean;
  setIsProjectsHubOpen: (open: boolean) => void;
  isEncryptionModalOpen: boolean;
  setIsEncryptionModalOpen: (open: boolean) => void;
  isAuditModalOpen: boolean;
  setIsAuditModalOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  commandPaletteInitialMode?: 'all' | 'files';

  // Handlers and data
  activeProject?: Project;
  activeProjectId: string;
  projectTitle: string;
  files: ProjectFile[];
  activeFile: ProjectFile;
  checkpoints: Checkpoint[];
  isCloudConnected: boolean;
  parsedDoc: ParsedDocument;
  wordCount: number;
  equationCount: number;
  roomId: string;
  peers: Collaborator[];
  selfUser: Collaborator;
  currentUser: UserProfile | null;
  currentRole: ProjectRole;
  projects: Project[];
  isTwoColumn: boolean;
  paperFormat: PaperFormatId;
  theme: 'dark' | 'light';

  // Modal action callbacks
  handleAddImageFile: (file: ProjectFile) => void;
  handleInsertCode: (snippet: string) => void;
  handleAddPreambleMacro: (macro: string) => void;
  handleCreateCheckpoint: (name: string) => void;
  handleRestoreCheckpoint: (cp: Checkpoint) => void;
  handleRestoreSingleFile: (file: ProjectFile) => void;
  handleDeleteCheckpoint: (cpId: string) => void;
  handleSyncCheckpointsCloud: () => void;
  handleInviteMember: (email: string, role: ProjectRole) => void;
  handleUpdateMemberRole: (memberId: string, role: ProjectRole) => void;
  handleRemoveMember: (memberId: string) => void;
  handleSelectTemplate: (template: Template) => void;
  handleAuthSuccess: (user: UserProfile) => void;
  handleSelectProject: (projectId: string) => void;
  handleCreateProject: (title: string, templateId?: string) => void;
  handleDuplicateProject: (projectId: string) => void;
  handleToggleArchiveProject: (projectId: string) => void;
  handleDeleteProject: (projectId: string) => void;
  handleToggleEncryption: (enabled: boolean, passphrase: string, salt: string) => Promise<void> | void;
  handleSelectFile: (fileId: string) => void;
  triggerCompile: () => void;
  handleFormatDocument: () => void;
  handleToggleTwoColumn: () => void;
  handleSelectFormat: (format: PaperFormatId) => void;
  toggleTheme: () => void;
  handleExportPdf: () => void;
  handleExportZip: () => void;
  setTargetLine: (line: number | null) => void;
  onToggleSidebar?: () => void;
  onSaveProject?: () => void;
  onForwardSync?: () => void;
}

export const ModalContainer: React.FC<ModalContainerProps> = ({
  isImageUploadOpen,
  setIsImageUploadOpen,
  isSymbolsOpen,
  setIsSymbolsOpen,
  symbolsInitialTab,
  isTableBuilderOpen,
  setIsTableBuilderOpen,
  isHistoryOpen,
  setIsHistoryOpen,
  isWordCountOpen,
  setIsWordCountOpen,
  isShareOpen,
  setIsShareOpen,
  isTemplatesOpen,
  setIsTemplatesOpen,
  isAuthOpen,
  setIsAuthOpen,
  isProjectsHubOpen,
  setIsProjectsHubOpen,
  isEncryptionModalOpen,
  setIsEncryptionModalOpen,
  isAuditModalOpen,
  setIsAuditModalOpen,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  commandPaletteInitialMode = 'all',

  activeProject,
  activeProjectId,
  projectTitle,
  files,
  activeFile,
  checkpoints,
  isCloudConnected,
  parsedDoc,
  wordCount,
  equationCount,
  roomId,
  peers,
  selfUser,
  currentUser,
  currentRole,
  projects,
  isTwoColumn,
  paperFormat,
  theme,

  handleAddImageFile,
  handleInsertCode,
  handleAddPreambleMacro,
  handleCreateCheckpoint,
  handleRestoreCheckpoint,
  handleRestoreSingleFile,
  handleDeleteCheckpoint,
  handleSyncCheckpointsCloud,
  handleInviteMember,
  handleUpdateMemberRole,
  handleRemoveMember,
  handleSelectTemplate,
  handleAuthSuccess,
  handleSelectProject,
  handleCreateProject,
  handleDuplicateProject,
  handleToggleArchiveProject,
  handleDeleteProject,
  handleToggleEncryption,
  handleSelectFile,
  triggerCompile,
  handleFormatDocument,
  handleToggleTwoColumn,
  handleSelectFormat,
  toggleTheme,
  handleExportPdf,
  handleExportZip,
  setTargetLine,
  onToggleSidebar,
  onSaveProject,
  onForwardSync,
}) => {
  const isAnyModalOpen =
    isImageUploadOpen ||
    isSymbolsOpen ||
    isTableBuilderOpen ||
    isHistoryOpen ||
    isWordCountOpen ||
    isShareOpen ||
    isTemplatesOpen ||
    isAuthOpen ||
    isProjectsHubOpen ||
    isEncryptionModalOpen ||
    isAuditModalOpen ||
    isCommandPaletteOpen;

  // Background Isolation via HTML `inert`
  useEffect(() => {
    const workspace = document.getElementById('root-workspace');
    if (!workspace) return;

    if (isAnyModalOpen) {
      workspace.setAttribute('inert', '');
    } else {
      workspace.removeAttribute('inert');
    }

    return () => {
      workspace.removeAttribute('inert');
    };
  }, [isAnyModalOpen]);

  if (!isAnyModalOpen) return null;

  return (
    <Suspense fallback={<ModalLoadingFallback />}>
      {isImageUploadOpen && (
        <ImageUploadModal
          isOpen={isImageUploadOpen}
          onClose={() => setIsImageUploadOpen(false)}
          onAddImageFile={handleAddImageFile}
          onInsertLatex={handleInsertCode}
        />
      )}

      {isSymbolsOpen && (
        <SymbolPaletteModal
          isOpen={isSymbolsOpen}
          onClose={() => setIsSymbolsOpen(false)}
          onInsert={handleInsertCode}
          onAddPreambleMacro={handleAddPreambleMacro}
          initialTab={symbolsInitialTab}
        />
      )}

      {isTableBuilderOpen && (
        <TableBuilderModal
          isOpen={isTableBuilderOpen}
          onClose={() => setIsTableBuilderOpen(false)}
          onInsert={handleInsertCode}
        />
      )}

      {isHistoryOpen && (
        <VersionHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          checkpoints={checkpoints}
          currentFiles={files}
          onCreateCheckpoint={handleCreateCheckpoint}
          onRestoreCheckpoint={handleRestoreCheckpoint}
          onRestoreSingleFile={handleRestoreSingleFile}
          onDeleteCheckpoint={handleDeleteCheckpoint}
          onSyncCloud={handleSyncCheckpointsCloud}
          isCloudConnected={isCloudConnected}
        />
      )}

      {isWordCountOpen && (
        <WordCountModal
          isOpen={isWordCountOpen}
          onClose={() => setIsWordCountOpen(false)}
          wordCount={wordCount}
          equationCount={equationCount}
          parsedDoc={parsedDoc}
          activeCode={activeFile.content}
        />
      )}

      {isShareOpen && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          roomId={roomId}
          peers={peers}
          selfUser={selfUser}
          currentUser={currentUser}
          projectMembers={activeProject?.members || []}
          onInviteMember={handleInviteMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          currentRole={currentRole}
        />
      )}

      {isTemplatesOpen && (
        <TemplateModal
          isOpen={isTemplatesOpen}
          onClose={() => setIsTemplatesOpen(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}

      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          currentUser={currentUser}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {isProjectsHubOpen && (
        <ProjectsDashboardModal
          isOpen={isProjectsHubOpen}
          onClose={() => setIsProjectsHubOpen(false)}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDuplicateProject={handleDuplicateProject}
          onToggleArchiveProject={handleToggleArchiveProject}
          onDeleteProject={handleDeleteProject}
          currentUser={currentUser}
        />
      )}

      {isEncryptionModalOpen && (
        <EncryptionModal
          isOpen={isEncryptionModalOpen}
          onClose={() => setIsEncryptionModalOpen(false)}
          isEncrypted={!!activeProject?.isEncrypted}
          encryptionSalt={activeProject?.encryptionSalt}
          files={files}
          onToggleEncryption={handleToggleEncryption}
        />
      )}

      {isAuditModalOpen && (
        <AuditLogModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          projectId={activeProjectId}
          projectTitle={projectTitle}
        />
      )}

      {isCommandPaletteOpen && (
        <CommandPaletteModal
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          files={files}
          onSelectFile={handleSelectFile}
          onCompile={triggerCompile}
          onFormatDocument={handleFormatDocument}
          onToggleTwoColumn={handleToggleTwoColumn}
          isTwoColumn={isTwoColumn}
          activeFormat={paperFormat}
          onSelectFormat={handleSelectFormat}
          theme={theme}
          onToggleTheme={toggleTheme}
          onExportPdf={handleExportPdf}
          onExportZip={handleExportZip}
          onOpenWordCount={() => setIsWordCountOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenProjectsHub={() => setIsProjectsHubOpen(true)}
          onOpenSymbols={() => {
            setIsSymbolsOpen(true);
          }}
          onOpenTableBuilder={() => setIsTableBuilderOpen(true)}
          onToggleSidebar={onToggleSidebar}
          onSaveProject={onSaveProject}
          onForwardSync={onForwardSync}
          sections={parsedDoc.sections}
          onJumpToLine={(line) => setTargetLine(line)}
          initialMode={commandPaletteInitialMode}
        />
      )}
    </Suspense>
  );
};

export default ModalContainer;
