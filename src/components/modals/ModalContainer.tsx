import React, { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useModalStore, closeModal, openModal } from '../../stores/modalStore';
import type { Checkpoint, WorkingTreeStatus } from '../../services/checkpointsService';
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
import type { EngineId } from '../../services/latexCompiler';

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
  activeProject?: Project;
  activeProjectId?: string;
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
  selectedEngine?: EngineId;
  onSelectEngine?: (engine: EngineId) => void;
  theme: 'dark' | 'light';

  // Action Handlers
  handleAddImageFile: (file: ProjectFile) => void;
  handleInsertCode: (snippet: string) => void;
  handleAddPreambleMacro: (macro: string) => void;
  handleCreateCheckpoint: (name: string) => void;
  handleRestoreCheckpoint: (cp: Checkpoint) => void;
  handleRestoreSingleFile: (file: ProjectFile) => void;
  handleDeleteCheckpoint: (cpId: string) => void;
  handleSyncCheckpointsCloud: () => void;
  handleInviteMember: (email: string, role: ProjectRole) => void;
  handleUpdateMemberRole: (memberId: string, newRole: ProjectRole) => void;
  handleRemoveMember: (memberId: string) => void;
  handleSelectTemplate: (template: Template) => void;
  handleAuthSuccess: (user: UserProfile) => void;
  handleSelectProject: (id: string) => void;
  handleCreateProject: (title: string, templateId?: string) => void;
  handleDuplicateProject: (id: string) => void;
  handleToggleArchiveProject: (id: string) => void;
  handleDeleteProject: (id: string) => void;
  handleToggleEncryption: (enabled: boolean, pass: string, salt: string) => Promise<void>;
  handleSelectFile: (id: string) => void;
  triggerCompile: () => void;
  handleFormatDocument: () => void;
  handleToggleTwoColumn: () => void;
  handleSelectFormat: (format: PaperFormatId) => void;
  toggleTheme: () => void;
  handleExportPdf: () => void;
  handleExportZip: () => void;
  setTargetLine: (line: number | null) => void;
  onToggleSidebar: () => void;
  onSaveProject: () => void;
  onForwardSync: () => void;
  isDeskPetEnabled?: boolean;
  onToggleDeskPet?: () => void;
  workingTreeStatus?: WorkingTreeStatus;
  handleCreateCommit?: (message: string, description?: string) => void;
  handlePushCommits?: () => Promise<void>;
  handlePullCommits?: () => Promise<void>;
  activeBranch?: string;
  branches?: string[];
  onSwitchBranch?: (branchName: string, checkoutHead?: boolean) => void;
  onCreateBranch?: (branchName: string) => void;
  onDeleteBranch?: (branchName: string) => void;
}

export const ModalContainer: React.FC<ModalContainerProps> = ({
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
  selectedEngine,
  onSelectEngine,
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
  isDeskPetEnabled,
  onToggleDeskPet,
  workingTreeStatus,
  handleCreateCommit,
  handlePushCommits,
  handlePullCommits,
  activeBranch,
  branches,
  onSwitchBranch,
  onCreateBranch,
  onDeleteBranch,
}) => {
  const activeModal = useModalStore((s) => s.activeModal);
  const modalProps = useModalStore((s) => s.props);

  const isAnyModalOpen = activeModal !== null;

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
      {activeModal === 'imageUpload' && (
        <ImageUploadModal
          isOpen={true}
          onClose={closeModal}
          onAddImageFile={handleAddImageFile}
          onInsertLatex={handleInsertCode}
        />
      )}

      {activeModal === 'symbolPalette' && (
        <SymbolPaletteModal
          isOpen={true}
          onClose={closeModal}
          onInsert={handleInsertCode}
          onAddPreambleMacro={handleAddPreambleMacro}
          initialTab={(modalProps.initialTab as 'symbols' | 'snippets' | 'macros') || 'symbols'}
        />
      )}

      {activeModal === 'tableBuilder' && (
        <TableBuilderModal
          isOpen={true}
          onClose={closeModal}
          onInsert={handleInsertCode}
        />
      )}

      {activeModal === 'versionHistory' && (
        <VersionHistoryModal
          isOpen={true}
          onClose={closeModal}
          checkpoints={checkpoints}
          currentFiles={files}
          workingTreeStatus={workingTreeStatus}
          onCreateCommit={handleCreateCommit}
          onCreateCheckpoint={handleCreateCheckpoint}
          onRestoreCheckpoint={handleRestoreCheckpoint}
          onRestoreSingleFile={handleRestoreSingleFile}
          onDeleteCheckpoint={handleDeleteCheckpoint}
          onPushCommits={handlePushCommits}
          onPullCommits={handlePullCommits}
          onSyncCloud={handleSyncCheckpointsCloud}
          isCloudConnected={isCloudConnected}
          activeProjectId={activeProjectId || activeProject?.id}
          activeBranch={activeBranch}
          branches={branches}
          onSwitchBranch={onSwitchBranch}
          onCreateBranch={onCreateBranch}
          onDeleteBranch={onDeleteBranch}
        />
      )}

      {activeModal === 'wordCount' && (
        <WordCountModal
          isOpen={true}
          onClose={closeModal}
          wordCount={wordCount}
          equationCount={equationCount}
          parsedDoc={parsedDoc}
          activeCode={activeFile.content}
        />
      )}

      {activeModal === 'share' && (
        <ShareModal
          isOpen={true}
          onClose={closeModal}
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

      {activeModal === 'template' && (
        <TemplateModal
          isOpen={true}
          onClose={closeModal}
          onSelectTemplate={handleSelectTemplate}
        />
      )}

      {activeModal === 'auth' && (
        <AuthModal
          isOpen={true}
          onClose={closeModal}
          currentUser={currentUser}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {activeModal === 'projectsHub' && (
        <ProjectsDashboardModal
          isOpen={true}
          onClose={closeModal}
          projects={projects}
          activeProjectId={activeProjectId || ''}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDuplicateProject={handleDuplicateProject}
          onToggleArchiveProject={handleToggleArchiveProject}
          onDeleteProject={handleDeleteProject}
          currentUser={currentUser}
        />
      )}

      {activeModal === 'encryption' && (
        <EncryptionModal
          isOpen={true}
          onClose={closeModal}
          isEncrypted={!!activeProject?.isEncrypted}
          encryptionSalt={activeProject?.encryptionSalt}
          files={files}
          onToggleEncryption={handleToggleEncryption}
        />
      )}

      {activeModal === 'auditLog' && (
        <AuditLogModal
          isOpen={true}
          onClose={closeModal}
          projectId={activeProjectId || ''}
          projectTitle={projectTitle}
        />
      )}

      {activeModal === 'commandPalette' && (
        <CommandPaletteModal
          isOpen={true}
          onClose={closeModal}
          files={files}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onSelectFile={handleSelectFile}
          onCompile={triggerCompile}
          onFormatDocument={handleFormatDocument}
          onToggleTwoColumn={handleToggleTwoColumn}
          isTwoColumn={isTwoColumn}
          activeFormat={paperFormat}
          onSelectFormat={handleSelectFormat}
          selectedEngine={selectedEngine}
          onSelectEngine={onSelectEngine}
          theme={theme}
          onToggleTheme={toggleTheme}
          onExportPdf={handleExportPdf}
          onExportZip={handleExportZip}
          onOpenWordCount={() => openModal('wordCount')}
          onOpenHistory={() => openModal('versionHistory')}
          onOpenProjectsHub={() => openModal('projectsHub')}
          onOpenSymbols={() => openModal('symbolPalette')}
          onOpenTableBuilder={() => openModal('tableBuilder')}
          onToggleSidebar={onToggleSidebar}
          onSaveProject={onSaveProject}
          onForwardSync={onForwardSync}
          sections={parsedDoc.sections}
          onJumpToLine={(line) => setTargetLine(line)}
          initialMode={(modalProps.initialMode as 'all' | 'files') || 'all'}
          isDeskPetEnabled={isDeskPetEnabled}
          onToggleDeskPet={onToggleDeskPet}
        />
      )}
    </Suspense>
  );
};

export default ModalContainer;
