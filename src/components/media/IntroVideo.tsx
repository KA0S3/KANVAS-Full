import { useRef, useEffect, useState } from 'react';
import introVideo from '@/assets/full-splash-trans.mp4';
import { useMediaStore } from '@/stores/mediaStore';

const IntroVideo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { showLibrary, setTransitioning, videosEnabled, videoSoundsEnabled, audioVolume } = useMediaStore();
  const [isFadingIn, setIsFadingIn] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
  // If videos are disabled, immediately start fade transition
  if (!videosEnabled) {
    setTransitioning(true);
    setTimeout(() => {
      setIsFadingIn(true);
      setTimeout(() => {
        showLibrary();
      }, 1000);
    }, 500);
    return;
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
    showLibrary();
  };

  video.addEventListener('timeupdate', handleTimeUpdate);
  video.addEventListener('ended', handleEnded);

  // Auto-play video with sound
  video.volume = audioVolume; // Use volume from mediaStore
  video.play().catch(error => {
    console.error('Video autoplay failed:', error);
  });

  return () => {
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('ended', handleEnded);
  };
}, [showLibrary, setTransitioning, isFadingIn, videosEnabled, videoSoundsEnabled]);

// Update video muted state and volume when settings change
useEffect(() => {
  const video = videoRef.current;
  if (video) {
    video.muted = !videoSoundsEnabled;
    video.volume = audioVolume; // Use volume from mediaStore
  }
}, [videoSoundsEnabled, audioVolume]);

  const handleVideoClick = () => {
    setClickCount(prev => prev + 1);
    if (clickCount >= 1) { // Skip on second click
      setIsFadingIn(true);
      setTransitioning(true);
      setTimeout(() => {
        showLibrary();
      }, 500);
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
            muted={!videoSoundsEnabled}
            autoPlay
            onClick={handleVideoClick}
          >
            <source src={introVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
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
