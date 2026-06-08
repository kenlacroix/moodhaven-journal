import { useState } from 'react';
import { SettingSection } from '../SettingSection';
import {
  changeMasterPassword,
  reKeyBatch,
  type ChangeSummary,
} from '../../../lib/services/changePasswordService';

interface PrivacyChangePasswordProps {
  sessionPassword: string;
}

/**
 * Settings → Privacy → Change Password (active-plans/change-password.md §6).
 *
 * SCAFFOLD: the entry point and wiring to {@link changeMasterPassword} / {@link reKeyBatch}
 * are in place, but the backend command and the full re-encrypt modal are not implemented
 * yet, so the action is disabled. The implementation pass fills in the modal (current / new /
 * confirm + strength meter), the batched front-end re-encryption with progress, and the
 * post-change re-setup checklist rendered from {@link ChangeSummary}.
 */
export function PrivacyChangePassword({ sessionPassword }: PrivacyChangePasswordProps) {
  const [summary] = useState<ChangeSummary | null>(null);
  const ready = sessionPassword.length > 0;

  // Referenced so the wiring (and its types) stay live until the modal lands; the
  // implementation pass replaces this with the real current/new/confirm flow.
  void changeMasterPassword;
  void reKeyBatch;
  void summary;

  return (
    <SettingSection
      title="Change Password"
      description="Re-encrypts your journal under a new password. Requires your current password."
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {ready
            ? 'Changing your password re-encrypts every entry — coming soon.'
            : 'Lock and re-unlock to enable changing your password.'}
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 cursor-not-allowed"
        >
          Change Password
        </button>
      </div>
    </SettingSection>
  );
}
