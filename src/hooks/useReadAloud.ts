import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderEngine } from "../reader/engine";
import { ReadAloud, type SpeechState } from "../reader/speech";

const hasSpeech = () => typeof speechSynthesis !== "undefined";

/** Read-aloud playback for the open book, plus the list of available system voices. */
export function useReadAloud(engine: ReaderEngine | null, rate: number, voiceURI: string | null) {
  const [state, setState] = useState<SpeechState>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ref = useRef<ReadAloud | null>(null);
  const available = !!engine?.capabilities.speech && hasSpeech();

  useEffect(() => {
    if (!engine || !available) return;
    const ra = new ReadAloud(engine.speech);
    ref.current = ra;
    const off = ra.onState(setState);
    return () => {
      off();
      ra.stop();
      ref.current = null;
      setState("idle");
    };
  }, [engine, available]);

  // Applies from the next paragraph on.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.rate = rate;
    ref.current.voiceURI = voiceURI;
  }, [rate, voiceURI, engine, available]);

  useEffect(() => {
    if (!hasSpeech()) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const toggle = useCallback(() => {
    const ra = ref.current;
    if (!ra) return;
    if (ra.state === "playing") ra.pause();
    else void ra.play();
  }, []);

  return {
    available,
    state,
    voices,
    toggle,
    stop: useCallback(() => ref.current?.stop(), []),
    skip: useCallback((d: 1 | -1) => void ref.current?.skip(d), []),
  };
}
