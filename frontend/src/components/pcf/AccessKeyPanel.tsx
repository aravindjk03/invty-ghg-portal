/**
 * Where the presenter gives INSITY EDGE AI its access key on this computer.
 *
 * Shown only when no estimate service is reachable. The key goes into this
 * browser's storage and nowhere else: it is not sent to IINVTY, not part of the
 * site, and another visitor's browser never sees it.
 */
import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { clearAccessKey, setAccessKey } from '../../services/browserAi';

interface AccessKeyPanelProps {
  assistant: string;
  hasKey: boolean;
  onChange: () => void;
}

export const AccessKeyPanel: React.FC<AccessKeyPanelProps> = ({ assistant, hasKey, onChange }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const key = value.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
      setError('That does not look like a valid access key. It starts with "sk-ant-".');
      return;
    }
    setAccessKey(key);
    setValue('');
    setError(null);
    onChange();
  };

  const remove = () => {
    clearAccessKey();
    onChange();
  };

  if (hasKey) {
    return (
      <Card className="p-4 border-[#067647]/25">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-brand-body flex items-center gap-2">
            <ShieldCheck size={16} className="text-status-success flex-shrink-0" />
            <span>
              <span className="font-semibold text-brand-heading">{assistant} is connected on this computer.</span>{' '}
              The access key is stored in this browser only.
            </span>
          </p>
          <Button variant="ghost" size="sm" onClick={remove}>
            Remove key from this browser
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-[#A66300]/30">
      <form onSubmit={save} className="flex flex-col gap-3" noValidate>
        <div className="flex gap-3">
          <KeyRound size={18} className="text-status-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-brand-heading">Connect {assistant} on this computer</p>
            <p className="text-sm text-brand-body mt-0.5">
              Paste the access key once. It is saved in this browser only, is never sent to IINVTY or
              published with the site, and can be removed at any time.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <label className="flex-1">
            <span className="sr-only">Access key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              placeholder="sk-ant-…"
              className="w-full h-10 rounded-md border border-border bg-surface-raised px-3 text-sm font-mono text-brand-body focus-visible:outline-2 focus-visible:outline-blue-600"
            />
          </label>
          <Button type="submit" variant="primary" size="md">
            Connect
          </Button>
        </div>
        {error && <p className="text-xs text-status-danger">{error}</p>}
      </form>
    </Card>
  );
};
