import type { UserProfile } from '../types/latex';
import { useProjectLifecycle } from './useProjectLifecycle';
import { useFileOperations } from './useFileOperations';

interface UseProjectManagerOptions {
  currentUser: UserProfile | null;
  onToast: (message: string) => void;
  triggerCompile: () => void;
  providerRef?: React.MutableRefObject<any>;
}

export function useProjectManager({
  currentUser,
  onToast,
  triggerCompile,
  providerRef,
}: UseProjectManagerOptions) {
  const lifecycle = useProjectLifecycle({
    currentUser,
    onToast,
    triggerCompile,
    providerRef,
  });

  const fileOps = useFileOperations({
    currentUser,
    activeProject: lifecycle.activeProject,
    onToast,
    triggerCompile,
    markDirty: lifecycle.markDirty,
    providerRef,
  });

  return {
    ...lifecycle,
    ...fileOps,
  };
}
