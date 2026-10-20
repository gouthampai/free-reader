/**
 * Read aloud with the OS voices via the Web Speech API (AVSpeechSynthesizer under WebKit on macOS,
 * SAPI/OneCore under WebView2 on Windows). Text comes from the engine's SpeechSource as SSML, one
 * block at a time; word boundary events move the sentence highlight.
 */
import type { SpeechSource } from "./engine";

export interface SpokenBlock {
  text: string;
  /** Sentence marks with their character offset into `text`. */
  marks: { name: string; offset: number }[];
  lang?: string;
}

const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** Flattens an SSML block to speakable text, recording where each <mark> falls. */
export function ssmlToSpoken(ssml: string): SpokenBlock {
  const doc = new DOMParser().parseFromString(ssml, "application/xml");
  let text = "";
  const marks: SpokenBlock["marks"] = [];
  const add = (s: string) => {
    const t = s.replace(/\s+/g, " ");
    text += text.endsWith(" ") && t.startsWith(" ") ? t.slice(1) : t;
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) add(child.textContent ?? "");
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (el.localName === "mark") marks.push({ name: el.getAttribute("name") ?? "", offset: text.length });
        else if (el.localName === "break") add(" ");
        else walk(el);
      }
    }
  };
  walk(doc.documentElement);
  const lead = text.length - text.trimStart().length;
  const root = doc.documentElement;
  return {
    text: text.trim(),
    marks: marks.map((m) => ({ ...m, offset: Math.max(0, m.offset - lead) })),
    lang: root.getAttributeNS(XML_NS, "lang") || root.getAttribute("xml:lang") || undefined,
  };
}

/** The last mark at or before `charIndex`. */
export function markAt(marks: SpokenBlock["marks"], charIndex: number): string | null {
  let found: string | null = null;
  for (const m of marks) {
    if (m.offset > charIndex) break;
    found = m.name;
  }
  return found;
}

type Voice = Pick<SpeechSynthesisVoice, "voiceURI" | "lang" | "default" | "name">;

/** The chosen voice if available, else the best match for the book's language, else the default. */
export function pickVoice<V extends Voice>(voices: V[], voiceURI: string | null, lang?: string): V | null {
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  if (lang) {
    const l = lang.toLowerCase();
    const base = l.split("-")[0];
    const matches = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base);
    const best =
      matches.find((v) => v.lang.toLowerCase().replace("_", "-") === l && v.default) ??
      matches.find((v) => v.lang.toLowerCase().replace("_", "-") === l) ??
      matches.find((v) => v.default) ??
      matches[0];
    if (best) return best;
  }
  return voices.find((v) => v.default) ?? null;
}

export type SpeechState = "idle" | "playing" | "paused";

export interface Synth {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export class ReadAloud {
  #source: SpeechSource;
  #synth: Synth;
  #makeUtterance: (text: string) => SpeechSynthesisUtterance;
  #state: SpeechState = "idle";
  #listeners = new Set<(s: SpeechState) => void>();
  /** Bumped whenever playback is redirected, so callbacks from cancelled utterances are ignored. */
  #token = 0;
  rate = 1;
  voiceURI: string | null = null;

  constructor(
    source: SpeechSource,
    synth: Synth = speechSynthesis,
    makeUtterance: (text: string) => SpeechSynthesisUtterance = (t) => new SpeechSynthesisUtterance(t),
  ) {
    this.#source = source;
    this.#synth = synth;
    this.#makeUtterance = makeUtterance;
  }

  get state() {
    return this.#state;
  }

  onState(cb: (s: SpeechState) => void) {
    this.#listeners.add(cb);
    return () => void this.#listeners.delete(cb);
  }

  #set(state: SpeechState) {
    if (state === this.#state) return;
    this.#state = state;
    this.#listeners.forEach((cb) => cb(state));
  }

  async play() {
    if (this.#state === "paused") {
      this.#synth.resume();
      this.#set("playing");
      return;
    }
    if (this.#state === "playing") return;
    this.#set("playing");
    const token = ++this.#token;
    const ssml = await this.#source.start();
    if (token === this.#token) this.#speak(ssml, token);
  }

  pause() {
    if (this.#state !== "playing") return;
    this.#synth.pause();
    this.#set("paused");
  }

  stop() {
    this.#token++;
    this.#synth.cancel();
    this.#source.stop();
    this.#set("idle");
  }

  /** Skips to the next or previous block. */
  async skip(direction: 1 | -1) {
    if (this.#state === "idle") return;
    const token = ++this.#token;
    this.#synth.cancel();
    const ssml = await (direction > 0 ? this.#source.next() : this.#source.prev());
    if (token !== this.#token) return;
    this.#set("playing");
    this.#speak(ssml, token);
  }

  #speak(ssml: string | null, token: number) {
    if (ssml == null) return this.stop(); // end of the book
    const block = ssmlToSpoken(ssml);
    if (!block.text) return void this.#advance(token);

    const u = this.#makeUtterance(block.text);
    u.rate = this.rate;
    if (block.lang) u.lang = block.lang;
    u.voice = pickVoice(this.#synth.getVoices(), this.voiceURI, block.lang);

    let last: string | null = null;
    const highlight = (charIndex: number) => {
      const mark = markAt(block.marks, charIndex);
      if (mark && mark !== last) {
        last = mark;
        this.#source.mark(mark);
      }
    };
    highlight(0);
    u.onboundary = (e) => token === this.#token && highlight(e.charIndex);
    u.onend = () => {
      if (token === this.#token && this.#state === "playing") void this.#advance(token);
    };
    u.onerror = (e) => {
      if (token !== this.#token || e.error === "interrupted" || e.error === "canceled") return;
      console.error("Read aloud failed:", e.error);
      this.stop();
    };
    this.#synth.speak(u);
  }

  async #advance(token: number) {
    const ssml = await this.#source.next();
    if (token === this.#token) this.#speak(ssml, token);
  }
}
