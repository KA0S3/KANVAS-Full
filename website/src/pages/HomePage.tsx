import { Link } from "react-router-dom";
import { MonitorDown, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

const SPLASH_DURATION_MS = 3000;

export function HomePage() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frameId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const nextProgress = Math.min(((now - start) / SPLASH_DURATION_MS) * 100, 100);
      setProgress(nextProgress);
      if (nextProgress < 100) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const revealRadius = progress * 0.68;
  const revealFeather = revealRadius + 10;
  const titleOpacity = Math.min(1, Math.max(0, (progress - 8) / 20));
  const colorLayerStyle = {
    "--reveal-radius": `${revealRadius}vmax`,
    "--reveal-glow": `${revealRadius + 4}vmax`,
    "--reveal-feather": `${revealFeather}vmax`,
    "--reveal-edge": `${revealFeather + 8}vmax`,
  } as CSSProperties;

  return (
    <main className="splash-page">
      <div className="splash-bg splash-bg-mono" />
      <div className="splash-bg splash-bg-color" style={colorLayerStyle} />
      <div className="splash-bg splash-bg-halo" />
      <section className="splash-hero" aria-label="KANVAS" style={{ opacity: titleOpacity }}>
        <div className="splash-copy">
          <h1>KANVAS</h1>
          <p>FOR THE VISUAL</p>
          <div className="splash-actions" style={{ opacity: titleOpacity, pointerEvents: titleOpacity > 0.85 ? "auto" : "none" }}>
            <Link className="button primary large splash-button" to="/demo">
              <Play size={18} />
              Test demo app
            </Link>
            <Link className="button large splash-button" to="/download">
              <MonitorDown size={18} />
              Download full app
            </Link>
          </div>
        </div>
      </section>
      <p className="splash-terms">
        By interacting with this app you confirm you have read and understood the{" "}
        <a href="/terms-of-service">Terms & Conditions</a> and <a href="/privacy-policy">Privacy Policy</a>
      </p>
    </main>
  );
}
