import React, { useRef, useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { authService } from '../services/authService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { UserCircle2, Camera, KeyRound, Trash2 } from 'lucide-react';

/**
 * Your account: name, organisation, picture, password, and deleting it.
 *
 * None of this could be done before. An account that signed up by email could
 * never have a picture, nobody could change a password, and there was no way
 * to delete an account at all.
 */

/** The longest edge of a stored picture, in pixels. */
const AVATAR_SIZE = 128;

/**
 * Shrinks a chosen image to a small square in the browser and returns it
 * inline. The original file never leaves the machine, and what is stored is
 * something this page drew itself — not a link to somewhere else.
 */
function toAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Please choose a PNG, JPEG or WebP image.'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('That image is over 8 MB. Please choose a smaller one.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error('This browser could not prepare the picture.'));
        return;
      }
      // Centre-crop to a square, then scale down.
      context.drawImage(
        image,
        (image.width - side) / 2, (image.height - side) / 2, side, side,
        0, 0, AVATAR_SIZE, AVATAR_SIZE,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = url;
  });
}

export const AccountCard: React.FC = () => {
  const { currentUser, setCurrentUser, addToast, logout } = useGHG();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(currentUser?.name ?? '');
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (!currentUser) return null;

  const identifier = currentUser.email && !currentUser.email.endsWith('@invty-auth.local')
    ? currentUser.email
    : currentUser.phone ?? currentUser.email;
  const hasPassword = (currentUser.authProvider ?? 'email') === 'email';
  const trial = authService.isTrialSession();

  const run = async (work: () => Promise<void>, setBusy: (busy: boolean) => void) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => run(async () => {
    if (name.trim().length < 2) throw new Error('Please enter your name.');
    setCurrentUser(await authService.updateProfile({ name: name.trim() }));
    addToast('success', 'Your name has been updated.');
  }, setSaving);

  const choosePicture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    run(async () => {
      const avatarUrl = await toAvatar(file);
      setCurrentUser(await authService.updateProfile({ avatarUrl }));
      addToast('success', 'Your picture has been updated.');
    }, setSaving);
  };

  const removePicture = () => run(async () => {
    setCurrentUser(await authService.updateProfile({ avatarUrl: null }));
    addToast('info', 'Your picture has been removed.');
  }, setSaving);

  const changePassword = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      const message = await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      addToast('success', message);
    }, setChanging);
  };

  const deleteAccount = () => run(async () => {
    await authService.deleteAccount(confirmDelete);
    addToast('info', 'Your account has been deleted.');
    await logout();
  }, setDeleting);

  return (
    <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
      <div className="flex items-center gap-2 mb-4">
        <UserCircle2 size={18} className="text-brand-primary" />
        <h2 className="text-base font-bold text-brand-heading">Your account</h2>
      </div>

      {/* Picture and name */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
              {currentUser.name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={choosePicture}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => fileInput.current?.click()}
              leftIcon={<Camera size={14} />}
            >
              {currentUser.avatarUrl ? 'Change picture' : 'Add a picture'}
            </Button>
            {currentUser.avatarUrl && (
              <button
                type="button"
                onClick={removePicture}
                disabled={saving}
                className="text-[11px] text-brand-muted hover:text-red-600 text-left"
              >
                Remove picture
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-brand-body mb-1">Your name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={saveName}
            disabled={saving || name.trim() === currentUser.name}
          >
            Save name
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-brand-muted mt-3">
        Signed in as <strong className="text-brand-heading">{identifier}</strong>
        {trial && ' · this account is stored in this browser only'}
      </p>

      {/* Password */}
      {hasPassword && (
        <form onSubmit={changePassword} className="mt-5 pt-5 border-t border-border">
          <h3 className="text-xs font-bold text-brand-heading flex items-center gap-1.5 mb-3">
            <KeyRound size={14} /> Change password
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">Current password</label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">New password</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 12 characters"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={changing || !currentPassword || newPassword.length < 12}
            >
              {changing ? 'Changing…' : 'Change password'}
            </Button>
          </div>
          {!trial && (
            <p className="text-[11px] text-brand-muted mt-2">
              Changing it signs you out on every other device.
            </p>
          )}
        </form>
      )}

      {/* Delete */}
      <div className="mt-5 pt-5 border-t border-border">
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-xs text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1.5"
          >
            <Trash2 size={13} /> Delete my account
          </button>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50/60 p-4">
            <p className="text-xs text-red-900 leading-relaxed mb-3">
              This removes your account{trial ? ' from this browser' : ' and everything stored with it on the server'}.
              It cannot be undone.{' '}
              {trial && 'Your inventory stays in this browser until you clear it in the section below. '}
              Type <strong>{identifier}</strong> to confirm.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder={identifier}
              />
              <Button
                variant="danger"
                size="sm"
                onClick={deleteAccount}
                disabled={deleting || confirmDelete.trim().toLowerCase() !== identifier.toLowerCase()}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowDelete(false); setConfirmDelete(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default AccountCard;
