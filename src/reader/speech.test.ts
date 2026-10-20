// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { SpeechSource } from "./engine";
import { markAt, pickVoice, ReadAloud, ssmlToSpoken, type Synth } from "./speech";

const SSML = (body: string, lang = "en-GB") =>
  `<speak xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">${body}</speak>`;

describe("ssmlToSpoken", () => {
  it("flattens text and records sentence mark offsets", () => {
    const b = ssmlToSpoken(
      SSML(`\n  <mark name="0"/>It was   cold. <mark name="1"/><emphasis>Very</emphasis> cold.<break/>`),
    );
    expect(b.text).toBe("It was cold. Very cold.");
    expect(b.marks).toEqual([
      { name: "0", offset: 0 },
      { name: "1", offset: 13 },
    ]);
    expect(b.lang).toBe("en-GB");
  });

  it("finds the mark for a character index", () => {
    const marks = [
      { name: "0", offset: 0 },
      { name: "1", offset: 13 },
    ];
    expect(markAt(marks, 0)).toBe("0");
    expect(markAt(marks, 12)).toBe("0");
    expect(markAt(marks, 13)).toBe("1");
    expect(markAt([], 5)).toBeNull();
  });
});

describe("pickVoice", () => {
  const v = (voiceURI: string, lang: string, isDefault = false) => ({
    voiceURI,
    name: voiceURI,
    lang,
    default: isDefault,
  });
  const voices = [v("us", "en-US", true), v("gb", "en-GB"), v("fr", "fr-FR"), v("fr-ca", "fr_CA")];

  it("prefers the chosen voice, then the book language, then the default", () => {
    expect(pickVoice(voices, "fr", "en")?.voiceURI).toBe("fr");
    expect(pickVoice(voices, null, "en-GB")?.voiceURI).toBe("gb");
    expect(pickVoice(voices, null, "fr-CA")?.voiceURI).toBe("fr-ca");
    expect(pickVoice(voices, null, "fr")?.voiceURI).toBe("fr");
    expect(pickVoice(voices, "missing", "de")?.voiceURI).toBe("us");
    expect(pickVoice([], null, "en")).toBeNull();
  });
});

type FakeUtterance = {
  text: string;
  rate: number;
  lang: string;
  voice: unknown;
  onboundary: ((e: { charIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function setup(blocks: (string | null)[]) {
  const spoken: FakeUtterance[] = [];
  const calls: string[] = [];
  const synth: Synth = {
    speak: (u) => void spoken.push(u as unknown as FakeUtterance),
    cancel: () => calls.push("cancel"),
    pause: () => calls.push("pause"),
    resume: () => calls.push("resume"),
    getVoices: () => [],
  };
  const marks: string[] = [];
  let i = 0;
  const source: SpeechSource = {
    start: async () => blocks[(i = 0)],
    next: async () => blocks[++i] ?? null,
    prev: async () => blocks[(i = Math.max(0, i - 1))],
    mark: (m) => void marks.push(m),
    stop: () => calls.push("source-stop"),
  };
  const make = (text: string) =>
    ({
      text,
      rate: 1,
      lang: "",
      voice: null,
      onboundary: null,
      onend: null,
      onerror: null,
    }) as unknown as SpeechSynthesisUtterance;
  const ra = new ReadAloud(source, synth, make);
  const states: string[] = [];
  ra.onState((s) => states.push(s));
  return { ra, spoken, calls, marks, states };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ReadAloud", () => {
  it("speaks blocks in order, highlighting sentences, and stops at the end", async () => {
    const { ra, spoken, marks, states, calls } = setup([
      SSML(`<mark name="a"/>One. <mark name="b"/>Two.`),
      SSML(`<mark name="c"/>Three.`),
      null,
    ]);
    ra.rate = 1.5;
    await ra.play();
    expect(spoken[0].text).toBe("One. Two.");
    expect(spoken[0].rate).toBe(1.5);
    expect(marks).toEqual(["a"]);
    spoken[0].onboundary!({ charIndex: 2 });
    spoken[0].onboundary!({ charIndex: 5 });
    expect(marks).toEqual(["a", "b"]);

    spoken[0].onend!();
    await tick();
    expect(spoken[1].text).toBe("Three.");
    spoken[1].onend!();
    await tick();
    expect(ra.state).toBe("idle");
    expect(states).toEqual(["playing", "idle"]);
    expect(calls).toContain("source-stop");
  });

  it("pauses, resumes and ignores callbacks from cancelled utterances", async () => {
    const { ra, spoken, calls, marks } = setup([SSML(`<mark name="a"/>One.`), SSML(`<mark name="b"/>Two.`), null]);
    await ra.play();
    ra.pause();
    expect(ra.state).toBe("paused");
    await ra.play();
    expect(calls).toEqual(["pause", "resume"]);
    expect(ra.state).toBe("playing");

    await ra.skip(1);
    expect(spoken.map((u) => u.text)).toEqual(["One.", "Two."]);
    // The skipped utterance's late callbacks must not advance or highlight.
    spoken[0].onboundary!({ charIndex: 0 });
    spoken[0].onend!();
    await tick();
    expect(spoken).toHaveLength(2);
    expect(marks).toEqual(["a", "b"]);

    ra.stop();
    expect(ra.state).toBe("idle");
    spoken[1].onend!();
    await tick();
    expect(spoken).toHaveLength(2);
  });

  it("stops on a real error but not on interruptions", async () => {
    const { ra, spoken } = setup([SSML(`One.`), null]);
    await ra.play();
    spoken[0].onerror!({ error: "interrupted" });
    expect(ra.state).toBe("playing");
    const original = console.error;
    console.error = () => {};
    spoken[0].onerror!({ error: "synthesis-failed" });
    console.error = original;
    expect(ra.state).toBe("idle");
  });
});
