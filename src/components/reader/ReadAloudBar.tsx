import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { languageCode } from "../../reader/lookup";
import type { SpeechState } from "../../reader/speech";
import { IconButton } from "../ui";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const selectClass =
  "h-8 rounded-md border border-border bg-surface px-1.5 text-[12px] text-fg focus:border-accent focus:outline-none";

/** Floating playback controls shown while reading aloud. */
export function ReadAloudBar({
  state,
  rate,
  voiceURI,
  voices,
  bookLanguage,
  onToggle,
  onSkip,
  onStop,
  onRate,
  onVoice,
}: {
  state: SpeechState;
  rate: number;
  voiceURI: string | null;
  voices: SpeechSynthesisVoice[];
  bookLanguage?: string | null;
  onToggle: () => void;
  onSkip: (d: 1 | -1) => void;
  onStop: () => void;
  onRate: (r: number) => void;
  onVoice: (v: string | null) => void;
}) {
  const lang = languageCode(bookLanguage);
  // Voices for the book's language first, then the rest, each alphabetically.
  const sorted = [...voices].sort(
    (a, b) =>
      Number(languageCode(b.lang) === lang) - Number(languageCode(a.lang) === lang) || a.name.localeCompare(b.name),
  );
  const rates = RATES.includes(rate) ? RATES : [...RATES, rate].sort((a, b) => a - b);
  const playing = state === "playing";

  return (
    <div
      role="toolbar"
      aria-label="Read aloud"
      className="fixed bottom-14 left-1/2 z-30 flex -translate-x-1/2 animate-fade-in items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-panel"
    >
      <IconButton label="Previous paragraph" onClick={() => onSkip(-1)}>
        <SkipBack size={15} />
      </IconButton>
      <IconButton label={playing ? "Pause" : "Resume"} onClick={onToggle}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </IconButton>
      <IconButton label="Next paragraph" onClick={() => onSkip(1)}>
        <SkipForward size={15} />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <select aria-label="Speed" className={selectClass} value={rate} onChange={(e) => onRate(Number(e.target.value))}>
        {rates.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      <select
        aria-label="Voice"
        className={`${selectClass} max-w-44`}
        value={voiceURI ?? ""}
        onChange={(e) => onVoice(e.target.value || null)}
      >
        <option value="">Automatic</option>
        {sorted.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      <IconButton label="Stop reading aloud" onClick={onStop}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
