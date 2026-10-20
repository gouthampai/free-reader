import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { Button, inputClass } from "../ui";

/** Small dialog asking for a single name (create/rename collection). */
export function NameDialog({
  open,
  title,
  initial = "",
  confirmLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  initial?: string;
  confirmLabel: string;
  /** Rejects with a user-facing message to keep the dialog open. */
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={title} width="max-w-sm">
      <form onSubmit={submit}>
        <input
          autoFocus
          className={inputClass}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Name"
          aria-label="Name"
          aria-invalid={!!error}
        />
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
