import S1 from '@/assets/S1.mp3';
import S2 from '@/assets/S2.mp3';
import S3 from '@/assets/S3.mp3';
import S4 from '@/assets/S4.mp3';
import { useMediaStore } from '@/stores/mediaStore';

class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private tracks = [S1, S2, S3, S4];
  private currentTrackIndex = 0;
  private isPlaying = false;
  private isLoading = false;
  private volume = 0.08; // Default to 8% for barely audible background music
  private eventListenersAttached = false;

  constructor() {
    // Audio will be initialized when needed
  }

  private getCurrentVolume(): number {
    const { audioVolume } = useMediaStore.getState();
    return audioVolume;
  }

  private cleanupAudio(): void {
    if (this.audio) {
      // Remove all event listeners to prevent memory leaks
      this.audio.removeEventListener('ended', this.handleTrackEnd);
      this.audio.removeEventListener('error', this.handleAudioError);
      this.audio.removeEventListener('canplay', this.handleCanPlay);
      
      // Pause and reset
      this.audio.pause();
      this.audio.currentTime = 0;
      
      // Clear source to abort any pending loads
      this.audio.src = '';
      this.audio.load(); // This triggers abort of any pending load requests
      
      this.audio = null;
    }
    this.eventListenersAttached = false;
    this.isPlaying = false;
    this.isLoading = false;
  }

  private handleTrackEnd = (): void => {
    console.log('Track ended, playing next track');
    this.playNextTrack();
  };

  private handleAudioError = (e: Event): void => {
    console.error('Audio error:', e);
    // Prevent error from bubbling up to React
    e.preventDefault?.();
    e.stopPropagation?.();
  };

  private handleCanPlay = (): void => {
    console.log('Audio can play');
  };

  private attachEventListeners(): void {
    if (this.audio && !this.eventListenersAttached) {
      this.audio.addEventListener('ended', this.handleTrackEnd);
      this.audio.addEventListener('error', this.handleAudioError);
      this.audio.addEventListener('canplay', this.handleCanPlay);
      this.eventListenersAttached = true;
    }
  }

  public async startWithUserInteraction(): Promise<void> {
    if (this.isPlaying || this.isLoading) {
      console.log('Audio already playing or loading, ignoring start request');
      return;
    }

    // Check if audio is enabled in settings
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio is disabled in settings, skipping playback');
      return;
    }

    try {
      console.log('Starting audio engine with user interaction');
      this.isLoading = true;
      
      // Clean up any existing audio before creating new instance
      this.cleanupAudio();
      
      this.audio = new Audio(this.tracks[this.currentTrackIndex]);
      this.audio.volume = this.getCurrentVolume();
      this.audio.loop = false; // We'll handle looping manually
      
      this.attachEventListeners();

      await this.audio.play();
      console.log('Audio playing successfully with user interaction');
      this.isPlaying = true;
    } catch (error) {
      console.error('Audio playback failed:', error);
      this.cleanupAudio(); // Clean up on error
    } finally {
      this.isLoading = false;
    }
  }

  public async start(): Promise<void> {
    if (this.isPlaying || this.isLoading) {
      console.log('Audio already playing or loading, ignoring start request');
      return;
    }

    // Check if audio is enabled in settings
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio is disabled in settings, skipping playback');
      return;
    }

    try {
      console.log('Starting audio engine with track:', this.tracks[this.currentTrackIndex]);
      this.isLoading = true;
      
      // Clean up any existing audio before creating new instance
      this.cleanupAudio();
      
      this.audio = new Audio(this.tracks[this.currentTrackIndex]);
      this.audio.volume = this.getCurrentVolume();
      this.audio.loop = false; // We'll handle looping manually
      
      this.attachEventListeners();

      // Try to play, but handle autoplay policy restrictions
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('Audio playing successfully');
          this.isPlaying = true;
        }).catch(error => {
          console.error('Audio autoplay blocked:', error);
          console.log('User interaction required to start audio');
          this.cleanupAudio(); // Clean up on autoplay block
        }).finally(() => {
          this.isLoading = false;
        });
      } else {
        this.isLoading = false;
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
      this.cleanupAudio(); // Clean up on error
      this.isLoading = false;
    }
  }

  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.isPlaying = false;
    this.isLoading = false;
  }

  public setVolume(volume: number): void {
    // Update the store instead of internal volume
    const { setAudioVolume } = useMediaStore.getState();
    setAudioVolume(Math.max(0, Math.min(1, volume)));
    
    if (this.audio) {
      this.audio.volume = this.getCurrentVolume();
    }
  }

  public updateVolume(): void {
    // Update the volume of currently playing audio to match store
    if (this.audio && this.isPlaying) {
      this.audio.volume = this.getCurrentVolume();
    }
  }

  private playNextTrack(): void {
    // Check if audio is still enabled before playing next track
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio became disabled, stopping playback');
      this.stop();
      return;
    }

    // Prevent concurrent track changes
    if (this.isLoading) {
      console.log('Already loading a track, skipping next track');
      return;
    }

    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
    console.log('Playing next track:', this.currentTrackIndex, this.tracks[this.currentTrackIndex]);
    
    if (this.audio) {
      this.isLoading = true;
      
      // Pause current playback before changing source
      this.audio.pause();
      
      // Remove event listeners temporarily
      if (this.eventListenersAttached) {
        this.audio.removeEventListener('ended', this.handleTrackEnd);
        this.audio.removeEventListener('error', this.handleAudioError);
        this.audio.removeEventListener('canplay', this.handleCanPlay);
        this.eventListenersAttached = false;
      }
      
      // Change source and load new track
      this.audio.src = this.tracks[this.currentTrackIndex];
      this.audio.volume = this.getCurrentVolume();
      
      // Re-attach event listeners
      this.attachEventListeners();
      
      // Play the new track
      this.audio.play().then(() => {
        console.log('Next track playing successfully');
      }).catch(error => {
        console.error('Next track playback failed:', error);
        // Don't let the error bubble up to React
        this.cleanupAudio(); // Clean up on error
      }).finally(() => {
        this.isLoading = false;
      });
    }
  }

  public getCurrentTrack(): number {
    return this.currentTrackIndex;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public checkAudioSettings(): void {
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled && this.isPlaying) {
      console.log('Audio disabled in settings, stopping playback');
      this.stop();
    }
  }

  public cleanup(): void {
    this.cleanupAudio();
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
