import { useState, useEffect } from 'react';

const playDolbyAtmosIntro = () => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 3);
  masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 9);
  masterGain.connect(ctx.destination);

  // 1. Deep Sub-Bass Rumble (Cinematic THX/Dolby style sweep - higher frequency for laptop speakers)
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sawtooth';
  subOsc.frequency.setValueAtTime(150, ctx.currentTime);
  subOsc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 6);

  const subOsc2 = ctx.createOscillator();
  subOsc2.type = 'square';
  subOsc2.frequency.setValueAtTime(75, ctx.currentTime);
  subOsc2.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 6);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(100, ctx.currentTime);
  rumbleFilter.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 5);
  rumbleFilter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 8);

  subOsc.connect(rumbleFilter);
  subOsc2.connect(rumbleFilter);
  rumbleFilter.connect(masterGain);

  subOsc.start(ctx.currentTime);
  subOsc2.start(ctx.currentTime);
  subOsc.stop(ctx.currentTime + 9);
  subOsc2.stop(ctx.currentTime + 9);

  // Helper to create white noise for whoosh effects
  const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const createWhoosh = (startTime: number, panStart: number, panEnd: number) => {
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.Q.value = 1.5;
    bpFilter.frequency.setValueAtTime(200, startTime);
    bpFilter.frequency.exponentialRampToValueAtTime(5000, startTime + 0.25);
    bpFilter.frequency.exponentialRampToValueAtTime(200, startTime + 0.6);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createPanner();
    if ((panner as StereoPannerNode).pan) {
      (panner as StereoPannerNode).pan.setValueAtTime(panStart, startTime);
      (panner as StereoPannerNode).pan.linearRampToValueAtTime(panEnd, startTime + 0.6);
    }

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, startTime);
    whooshGain.gain.linearRampToValueAtTime(0.4, startTime + 0.25);
    whooshGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6);

    noiseSrc.connect(bpFilter);
    bpFilter.connect(panner);
    panner.connect(whooshGain);
    whooshGain.connect(masterGain);

    noiseSrc.start(startTime);
    noiseSrc.stop(startTime + 0.6);
  };

  // 2. Spatial Pings and Whooshes for each letter expanding (E minor pentatonic)
  const freqs = [329.63, 392.00, 493.88, 587.33, 659.25, 783.99];
  for (let i = 0; i < 6; i++) {
    const t = ctx.currentTime + 2.1 + (i * 0.5);

    // Add Cinematic Whoosh (alternating pan direction for "surround" feel)
    const isEven = i % 2 === 0;
    createWhoosh(t - 0.1, isEven ? -1 : 1, isEven ? 1 : -1);

    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.value = freqs[i];

    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0, t);
    pingGain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    pingGain.gain.exponentialRampToValueAtTime(0.01, t + 2);

    ping.connect(pingGain);
    pingGain.connect(masterGain);

    ping.start(t);
    ping.stop(t + 2);
  }

  // 3. Remerge Burst (Phase 8 explosion)
  const burstT = ctx.currentTime + 5.2;
  const burst = ctx.createOscillator();
  burst.type = 'square';
  burst.frequency.setValueAtTime(110, burstT);
  burst.frequency.exponentialRampToValueAtTime(880, burstT + 0.3);

  const burstFilter = ctx.createBiquadFilter();
  burstFilter.type = 'bandpass';
  burstFilter.frequency.setValueAtTime(200, burstT);
  burstFilter.frequency.exponentialRampToValueAtTime(3000, burstT + 0.4);

  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0, burstT);
  burstGain.gain.linearRampToValueAtTime(0.4, burstT + 0.1);
  burstGain.gain.exponentialRampToValueAtTime(0.01, burstT + 3);

  burst.connect(burstFilter);
  burstFilter.connect(burstGain);
  burstGain.connect(masterGain);

  burst.start(burstT);
  burst.stop(burstT + 3);
};

export const IntroSequence = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState<number>(-3);

  const handleStart = () => {
    if (phase === -2) {
      setPhase(-1);
    }
  };

  useEffect(() => {
    if (phase === -3) {
      // Trigger slow fade-in on mount
      setTimeout(() => setPhase(-2), 100);
    } else if (phase === -1) {
      setTimeout(() => {
        setPhase(0);
        playDolbyAtmosIntro();
      }, 1000); // Fade out and wait 1s before audio/ASPIRE starts
    } else if (phase === 0) {
      setTimeout(() => setPhase(1), 100);
    } else if (phase === 1) {
      setTimeout(() => setPhase(2), 2000);
    } else if (phase >= 2 && phase <= 7) {
      setTimeout(() => setPhase(phase + 1), 500);
    } else if (phase === 8) {
      setTimeout(() => setPhase(9), 1500);
    } else if (phase === 9) {
      setTimeout(() => {
        setPhase(10);
        onComplete();
      }, 800);
    }
  }, [phase, onComplete]);

  const words = [
    { letter: 'A', full: 'AJIN' },
    { letter: 'S', full: 'SAM' },
    { letter: 'P', full: 'PRESTEN' },
    { letter: 'I', full: 'INTELLIGENT' },
    { letter: 'R', full: 'ROBOTIC' },
    { letter: 'E', full: 'ENVIRONMENT' }
  ];

  return (
    <div className={`fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden font-mono transition-opacity duration-1000 ${phase === 10 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

      {/* Production Intro (Phases -3, -2, -1) */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center z-50 transition-opacity duration-[3000ms] ease-in-out ${phase === -2 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="font-serif text-white/90 tracking-[0.4em] md:tracking-[0.6em] text-sm md:text-2xl uppercase font-light mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] text-center px-4">
          TEAM ASPIRE FROM KARUNYA
        </div>

        <div className="font-serif text-gray-400 tracking-[0.8em] text-[10px] md:text-sm uppercase font-light mb-16">
          PRESENTS
        </div>

        <button
          onClick={handleStart}
          className="mt-8 px-8 py-3 border border-white/20 text-white/60 font-serif tracking-[0.3em] text-xs uppercase hover:bg-white/10 hover:text-white transition-all duration-500 rounded-sm hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] cursor-pointer"
        >
          START EXPERIENCE
        </button>
      </div>

      {/* Ambient Grid Background - Appears after terminal */}
      <div className={`absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] transition-opacity duration-[2000ms] ${phase >= 1 ? 'opacity-30' : 'opacity-0'}`} />

      {/* ASPIRE Core Sequence */}
      <div className={`relative z-10 flex flex-col items-center justify-center transition-all duration-[2000ms] ${phase >= 1 && phase < 9 ? 'opacity-100 scale-100' : phase === 9 ? 'opacity-0 scale-50 -translate-y-[40vh] -translate-x-[40vw] !duration-1000' : 'opacity-0 scale-95 pointer-events-none'}`}>

        {/* The letters container */}
        <div className="flex gap-4 items-center">
          {words.map((item, index) => {
            const wordPhase = index + 2;
            const isCurrentExpansion = phase === wordPhase;

            // In Phase 1 and 8, just show ASPIRE
            const showOnlyLetter = phase === 1 || phase >= 8;

            return (
              <div
                key={item.letter}
                className={`relative flex items-center justify-center transition-all duration-300 ease-in-out
                  ${isCurrentExpansion ? 'scale-[2.0] z-50 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] glitch-effect' : ''}
                  ${showOnlyLetter ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''}
                  ${(!showOnlyLetter && !isCurrentExpansion) ? 'opacity-10 scale-90 blur-sm' : ''}
                `}
              >
                <span className={`text-5xl md:text-8xl font-black tracking-widest ${isCurrentExpansion ? 'hidden' : 'block'}`}>
                  {item.letter}
                </span>

                {/* Expanded Word */}
                <span className={`absolute whitespace-nowrap text-3xl md:text-6xl font-black tracking-widest transition-all duration-200
                  ${isCurrentExpansion ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}>
                  {item.full}
                </span>
              </div>
            );
          })}
        </div>

        {/* Final Merged Title (Phase 8) */}
        <div className={`absolute top-full mt-12 text-center transition-all duration-1000 delay-300 ${phase >= 8 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="text-cyan-400 font-bold tracking-[0.3em] mb-2 text-xs md:text-base">AJIN • SAM • PRESTEN</div>
          <div className="text-gray-400 font-light tracking-[0.2em] text-[10px] md:text-sm uppercase">Intelligent Robotic Environment</div>
        </div>

      </div>
    </div>
  );
};
