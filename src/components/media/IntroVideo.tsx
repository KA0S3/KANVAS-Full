import { useRef, useEffect, useState } from 'react';
import introVideo from '@/assets/full-splash-trans.mp4';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';
import { Button } from '@/components/ui/button';

const IntroVideo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    showLibrary,
    setTransitioning,
    videosEnabled,
    videoSoundsEnabled,
    audioEnabled,
    audioVolume,
    hasCompletedIntroExperience,
    markIntroExperienceComplete,
  } = useMediaStore();
  const [isFadingIn, setIsFadingIn] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [requiresInteraction, setRequiresInteraction] = useState(false);

  useEffect(() => {
    if (hasCompletedIntroExperience) {
      showLibrary();
      return;
    }

    // If videos are disabled, immediately start fade transition
    if (!videosEnabled) {
      setTransitioning(true);
      let libraryTimer: number | undefined;
      const fadeTimer = window.setTimeout(() => {
        setIsFadingIn(true);
        libraryTimer = window.setTimeout(() => {
          markIntroExperienceComplete();
          showLibrary();
        }, 1000);
      }, 500);

      return () => {
        window.clearTimeout(fadeTimer);
        if (libraryTimer !== undefined) {
          window.clearTimeout(libraryTimer);
        }
      };
    }

    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // Start fade-in when 2 seconds remain
      const timeRemaining = video.duration - video.currentTime;
      if (timeRemaining <= 2 && timeRemaining > 1.9 && !isFadingIn) {
        setIsFadingIn(true);
        setTransitioning(true);
      }
    };

    const handleEnded = () => {
      markIntroExperienceComplete();
      showLibrary();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    // Auto-play video with sound
    video.volume = audioVolume;
    video.muted = !videoSoundsEnabled || !audioEnabled;
    setRequiresInteraction(false);
    video.play().catch(error => {
      console.error('Video autoplay failed:', error);
      setRequiresInteraction(true);
    });

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [
    showLibrary,
    setTransitioning,
    isFadingIn,
    videosEnabled,
    videoSoundsEnabled,
    audioEnabled,
    audioVolume,
    hasCompletedIntroExperience,
    markIntroExperienceComplete,
  ]);

  // Update video muted state and volume when settings change
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !videoSoundsEnabled || !audioEnabled;
      video.volume = audioVolume;
    }
  }, [videoSoundsEnabled, audioEnabled, audioVolume]);

  const handleVideoClick = () => {
    if (requiresInteraction) {
      return;
    }

    setClickCount(prev => prev + 1);
    if (clickCount >= 1) { // Skip on second click
      setIsFadingIn(true);
      setTransitioning(true);
      setTimeout(() => {
        markIntroExperienceComplete();
        showLibrary();
      }, 500);
    }
  };

  const handleEnterVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (videoSoundsEnabled && audioEnabled) {
        await audioEngine.startWithUserInteraction();
      }
      video.muted = !videoSoundsEnabled || !audioEnabled;
      video.volume = audioVolume;
      await video.play();
      setRequiresInteraction(false);
    } catch (error) {
      console.error('Video manual start failed:', error);
    }
  };

  return (
    <>
      {/* Video Layer or Black Screen */}
      <div 
        className="fixed inset-0 w-full h-screen bg-black"
        style={{ zIndex: 9998 }}
      >
        {videosEnabled ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover cursor-pointer"
            playsInline
            muted={!videoSoundsEnabled || !audioEnabled}
            autoPlay
            onClick={handleVideoClick}
          >
            <source src={introVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ) : null}

        {requiresInteraction ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-6">
            <div className="flex flex-col items-center gap-4 text-center text-white">
              <p
                className="uppercase text-white/85"
                style={{
                  fontSize: 'clamp(0.8rem, 1.6vw, 1rem)',
                  letterSpacing: '0.24em',
                  fontFamily: '"Cinzel", serif',
                }}
              >
                Click To Enter
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleEnterVideo}
                className="rounded-full border border-white/20 bg-black/55 px-6 py-2 text-white backdrop-blur-md hover:bg-black/70"
              >
                Start Intro
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Fade-in overlay for library content */}
      {isFadingIn && (
        <div 
          className="fixed inset-0 w-full h-screen bg-black pointer-events-none"
          style={{
            zIndex: 9997,
            animation: 'fadeOut 2s ease-in-out forwards',
          }}
        />
      )}
    </>
  );
};

export default IntroVideo;
