import { useCallback, useEffect, useState } from "react";
import { api, type Annotation, type NewAnnotation } from "../lib/api";
import { sortByPosition } from "../reader/annotations";

/** A book's highlights and bookmarks, kept in reading order. */
export function useAnnotations(bookId: number, onError: (message: string) => void) {
  const [list, setList] = useState<Annotation[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .listAnnotations(bookId)
      .then((l) => !cancelled && setList(sortByPosition(l)))
      .catch((e) => onError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [bookId, onError]);

  const add = useCallback(
    async (a: NewAnnotation) => {
      try {
        const created = await api.addAnnotation(bookId, a);
        setList((l) => sortByPosition([...l, created]));
        return created;
      } catch (e) {
        onError(String(e));
        return null;
      }
    },
    [bookId, onError],
  );

  const update = useCallback(
    async (id: number, note: string | null, color?: string) => {
      try {
        const updated = await api.updateAnnotation(id, note, color);
        setList((l) => l.map((a) => (a.id === id ? updated : a)));
        return updated;
      } catch (e) {
        onError(String(e));
        return null;
      }
    },
    [onError],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await api.deleteAnnotation(id);
        setList((l) => l.filter((a) => a.id !== id));
      } catch (e) {
        onError(String(e));
      }
    },
    [onError],
  );

  return { list, add, update, remove };
}
