import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Book, type Metadata } from "../../lib/api";
import { revealLabel } from "../../lib/platform";
import { Modal } from "../Modal";
import { Button, Field, inputClass } from "../ui";
import { BookCover } from "./BookCover";

type Form = Record<keyof Metadata, string>;

const toForm = (b: Book): Form => ({
  title: b.title ?? "",
  authors: b.authors ?? "",
  series: b.series ?? "",
  seriesIndex: b.seriesIndex != null ? String(b.seriesIndex) : "",
  language: b.language ?? "",
  publisher: b.publisher ?? "",
  description: b.description ?? "",
});

export function fromForm(f: Form): Metadata {
  const s = (v: string) => v.trim() || null;
  const idx = parseFloat(f.seriesIndex);
  return {
    title: s(f.title),
    authors: s(f.authors),
    series: s(f.series),
    seriesIndex: Number.isFinite(idx) ? idx : null,
    language: s(f.language),
    publisher: s(f.publisher),
    description: s(f.description),
  };
}

const formatSize = (bytes: number | null) =>
  bytes == null ? "—" : bytes < 1e6 ? `${Math.round(bytes / 1e3)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

export function MetadataDialog({
  book,
  onClose,
  onSaved,
}: {
  book: Book | null;
  onClose: () => void;
  onSaved: (b: Book) => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [current, setCurrent] = useState<Book | null>(book);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (book) {
      setForm(toForm(book));
      setCurrent(book);
      setError(null);
    }
  }, [book]);

  if (!book || !form || !current) return null;

  const set = (k: keyof Metadata) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const changeCover = async () => {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof path !== "string") return;
    try {
      const updated = await api.setCoverFromFile(book.id, path);
      setCurrent(updated);
      onSaved(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await api.updateMetadata(book.id, fromForm(form)));
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit details"
      description="Changes are saved in your library; the book file isn't modified."
      width="max-w-2xl"
    >
      <form onSubmit={save} className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full shrink-0 sm:w-36">
          <BookCover book={current} />
          <Button className="mt-3 w-full justify-center" onClick={changeCover}>
            <ImagePlus size={14} /> Change cover…
          </Button>
          <dl className="mt-4 space-y-1.5 text-[11px] text-muted">
            <div>
              <dt className="inline font-medium text-fg">Format </dt>
              <dd className="inline uppercase">{book.format}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-fg">Size </dt>
              <dd className="inline">{formatSize(book.fileSize)}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">{book.managed ? "Stored in library" : "Linked file"}</dt>
              <dd className="break-all">{book.path}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => revealItemInDir(book.path).catch((e) => setError(String(e)))}
            className="mt-2 text-[11px] text-accent hover:underline"
          >
            {revealLabel}
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Field label="Title">
            <input autoFocus className={inputClass} value={form.title} onChange={set("title")} />
          </Field>
          <Field label="Authors" hint="Separate multiple authors with “&”.">
            <input className={inputClass} value={form.authors} onChange={set("authors")} />
          </Field>
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Series">
                <input className={inputClass} value={form.series} onChange={set("series")} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Number">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={form.seriesIndex}
                  onChange={set("seriesIndex")}
                  aria-invalid={form.seriesIndex.trim() !== "" && !Number.isFinite(parseFloat(form.seriesIndex))}
                />
              </Field>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Publisher">
                <input className={inputClass} value={form.publisher} onChange={set("publisher")} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Language">
                <input className={inputClass} value={form.language} onChange={set("language")} placeholder="en" />
              </Field>
            </div>
          </div>
          <Field label="Description">
            <textarea
              className={`${inputClass} h-28 resize-y py-2 leading-relaxed`}
              value={form.description}
              onChange={set("description")}
            />
          </Field>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
