import { useRef, useEffect, useState } from 'react';
import entryVideo from '@/assets/book-trans-sound.mp4';
import { useMediaStore } from '@/stores/mediaStore';

interface BookEntryAnimationProps {
  onEntryComplete: () => void;
}

const BookEntryAnimation = ({ onEntryComplete }: BookEntryAnimationProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    enterBookView,
    videosEnabled,
    videoSoundsEnabled,
    audioEnabled,
    audioVolume,
    hasCompletedBookEntryExperience,
    markBookEntryExperienceComplete,
  } = useMediaStore();
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    if (hasCompletedBookEntryExperience) {
      enterBookView();
      onEntryComplete();
      return;
    }

    // If videos are disabled, just fade to black and complete immediately
    if (!videosEnabled) {
      const timer = window.setTimeout(() => {
        markBookEntryExperienceComplete();
        enterBookView();
        onEntryComplete();
      }, 500);

      return () => window.clearTimeout(timer);
    }

    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      markBookEntryExperienceComplete();
      enterBookView();
      onEntryComplete();
    };

    video.addEventListener('ended', handleEnded);
    video.muted = !videoSoundsEnabled || !audioEnabled;
    video.volume = audioVolume;

    // Auto-play video
    video.play().catch(error => {
      console.error('Entry video autoplay failed:', error);
    });

    return () => {
      video.removeEventListener('ended', handleEnded);
    };
  }, [
    enterBookView,
    onEntryComplete,
    videosEnabled,
    videoSoundsEnabled,
    audioEnabled,
    audioVolume,
    hasCompletedBookEntryExperience,
    markBookEntryExperienceComplete,
  ]);

// Update video muted state when setting changes
useEffect(() => {
  const video = videoRef.current;
  if (video) {
    video.muted = !videoSoundsEnabled || !audioEnabled;
  }
}, [videoSoundsEnabled, audioEnabled]);

  const handleVideoClick = () => {
    setClickCount(prev => prev + 1);
    if (clickCount >= 1) { // Skip on second click
      markBookEntryExperienceComplete();
      enterBookView();
      onEntryComplete();
    }
  };

  return (
    <div 
      className="fixed inset-0 w-full h-screen bg-black"
      style={{ zIndex: 9996 }}
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
          <source src={entryVideo} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : null}
    </div>
  );
};

export default BookEntryAnimation;
