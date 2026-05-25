import { useEffect, useRef, useState, type CSSProperties } from 'react';
import splashImage from '@/assets/Splash-i.png';
import { useMediaStore } from '@/stores/mediaStore';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { resolveAppRouteUrl } from '@/utils/appUrls';
import { cssUrl } from '@/utils/cssUrl';

interface SplashScreenProps {
  isAppLoading?: boolean;
  hasCompletedIntroExperience?: boolean;
  onReturningSplashComplete?: () => void;
}

const MIN_RETURNING_SPLASH_MS = 3000;
const MIN_FIRST_TIME_SPLASH_MS = 3000;
const LOADING_HOLD_PROGRESS = 92;

const backgroundStyle: CSSProperties = {
  backgroundImage: cssUrl(splashImage),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

const SplashScreen = ({
  isAppLoading = false,
  hasCompletedIntroExperience = false,
  onReturningSplashComplete,
}: SplashScreenProps) => {
  const { startIntro, audioEnabled, videoSoundsEnabled, setAudioEnabled, setVideoSoundsEnabled } = useMediaStore();
  const [revealProgress, setRevealProgress] = useState(0);
  const completedRef = useRef(false);
  const skipRequestedRef = useRef(false);
  const introStartedRef = useRef(false);
  const isAppLoadingRef = useRef(isAppLoading);
  const onCompleteRef = useRef(onReturningSplashComplete);
  const soundEnabled = audioEnabled && videoSoundsEnabled;

  const completeReturningSplash = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  };

  useEffect(() => {
    isAppLoadingRef.current = isAppLoading;
  }, [isAppLoading]);

  useEffect(() => {
    onCompleteRef.current = onReturningSplashComplete;
  }, [onReturningSplashComplete]);

  useEffect(() => {
    completedRef.current = false;
    skipRequestedRef.current = false;
    introStartedRef.current = false;
    setRevealProgress(0);
    let frameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const minSplashMs = hasCompletedIntroExperience ? MIN_RETURNING_SPLASH_MS : MIN_FIRST_TIME_SPLASH_MS;
      const baseProgress = Math.min((elapsed / minSplashMs) * 100, 100);
      const nextProgress = hasCompletedIntroExperience
        ? skipRequestedRef.current
          ? 100
          : isAppLoadingRef.current
            ? Math.min(baseProgress, LOADING_HOLD_PROGRESS)
            : baseProgress
        : baseProgress;

      setRevealProgress(nextProgress);

      if (!hasCompletedIntroExperience && nextProgress >= 100 && elapsed >= minSplashMs) {
        if (!introStartedRef.current) {
          introStartedRef.current = true;
          startIntro('full');
        }
        return;
      }

      const isComplete = nextProgress >= 100
        && !isAppLoadingRef.current
        && (skipRequestedRef.current || elapsed >= minSplashMs);
      if (isComplete) {
        completeReturningSplash();
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [hasCompletedIntroExperience, startIntro]);

  const handleDoubleClick = () => {
    if (!hasCompletedIntroExperience) {
      return;
    }

    skipRequestedRef.current = true;
    setRevealProgress(100);

    if (!isAppLoadingRef.current) {
      completeReturningSplash();
    }
  };

  const handleClick = () => {
    if (hasCompletedIntroExperience) {
      return;
    }
  };

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    setAudioEnabled(nextEnabled);
    setVideoSoundsEnabled(nextEnabled);

    if (!nextEnabled) {
      audioEngine.stop();
    }
  };

  const normalizedProgress = Math.max(0, Math.min(revealProgress, 100));
  const revealRadius = normalizedProgress * 0.68;
  const revealFeatherRadius = revealRadius + 10;
  const revealGlowRadius = revealRadius + 4;
  const titleOpacity = Math.min(1, Math.max(0, (revealProgress - 8) / 20));
  const colorLayerStyle: CSSProperties = {
    ...backgroundStyle,
    WebkitMaskImage: `radial-gradient(circle at center, #000 0, #000 ${revealRadius}vmax, rgba(0, 0, 0, 0.82) ${revealGlowRadius}vmax, rgba(0, 0, 0, 0.28) ${revealFeatherRadius}vmax, transparent ${revealFeatherRadius + 8}vmax)`,
    maskImage: `radial-gradient(circle at center, #000 0, #000 ${revealRadius}vmax, rgba(0, 0, 0, 0.82) ${revealGlowRadius}vmax, rgba(0, 0, 0, 0.28) ${revealFeatherRadius}vmax, transparent ${revealFeatherRadius + 8}vmax)`,
  };
  const revealHaloStyle: CSSProperties = hasCompletedIntroExperience
    ? {
        background: `radial-gradient(circle at center, rgba(255, 244, 210, 0.2) 0, rgba(255, 186, 91, 0.16) ${revealRadius}vmax, rgba(255, 140, 64, 0.08) ${revealFeatherRadius}vmax, transparent ${revealFeatherRadius + 12}vmax)`,
        opacity: Math.min(0.85, normalizedProgress / 100),
      }
    : {};

  return (
    <div
      className={`fixed inset-0 h-screen w-full overflow-hidden bg-black ${hasCompletedIntroExperience ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ zIndex: 9999 }}
    >
      <div
        className="absolute inset-0 h-full w-full opacity-95"
        style={{
          ...backgroundStyle,
          filter: 'grayscale(1) contrast(1.08) brightness(0.72)',
        }}
      />

      <div
        className="absolute inset-0 h-full w-full"
        style={colorLayerStyle}
      />

      {hasCompletedIntroExperience ? (
        <div
          className="absolute inset-0 h-full w-full"
          style={revealHaloStyle}
        />
      ) : null}

      {!hasCompletedIntroExperience && soundEnabled ? (
        <div className="absolute inset-0 h-full w-full bg-black/8" />
      ) : null}

      <div className="absolute inset-0 bg-black/20" />

      <div
        className="absolute inset-0 z-10 flex items-start justify-center transition-opacity duration-700"
        style={{
          fontFamily: '"MedievalSharp", "Almendra", cursive',
          paddingTop: 'clamp(3rem, 8vh, 8rem)',
          opacity: titleOpacity,
        }}
      >
        <div>
          <h1
            className="font-normal text-white"
            style={{
              fontSize: 'clamp(3rem, 12vw, 10rem)',
              letterSpacing: '0.3em',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.55), 0 0 42px rgba(255, 255, 255, 0.28)',
              marginBottom: '-0.4em',
            }}
          >
            KANVAS
          </h1>
          <p
            className="text-center font-bold uppercase text-white"
            style={{
              fontSize: 'clamp(0.8rem, 2.5vw, 1.8rem)',
              letterSpacing: '0.3em',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)',
              fontFamily: '"MedievalSharp", "Almendra", cursive',
              marginTop: '0.1em',
            }}
          >
            FOR THE VISUAL
          </p>
        </div>
      </div>

      <div
        className="absolute right-4 top-4 z-30"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={toggleSound}
          className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-white backdrop-blur-md hover:bg-black/60"
        >
          {soundEnabled ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </Button>
        <p className="mt-2 text-right text-[10px] uppercase tracking-[0.3em] text-white/70">
          Music + video sound
        </p>
      </div>

      <div
        className="absolute bottom-[clamp(1rem,3vh,2rem)] left-0 right-0 z-10 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-4 text-[clamp(0.6rem,1.5vw,0.8rem)] text-white/60">
          By interacting with this app you confirm you have read and understood the{' '}
          <a
            href={resolveAppRouteUrl('/terms-of-service')}
            className="text-white underline hover:opacity-100"
          >
            Terms & Conditions
          </a>
          {' '}and{' '}
          <a
            href={resolveAppRouteUrl('/privacy-policy')}
            className="text-white underline hover:opacity-100"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
