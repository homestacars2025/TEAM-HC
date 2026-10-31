let context: AudioContext | null = null;

/** Two soft notes, synthesised so there is no audio file to ship or cache. */
export function playNotificationSound(): void {
  try {
    context = context ?? new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});

    const start = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const at = start + index * 0.12;
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      oscillator.connect(gain).connect(context!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.26);
    });
  } catch { /* no audio available */ }
}
