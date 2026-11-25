/** Purely decorative background pieces shared by login, landing and ETL. */

export function Blobs({ fixed = false }: { fixed?: boolean }) {
  return (
    <div aria-hidden="true" className={`${fixed ? "fixed" : "absolute"} inset-0 -z-10 overflow-hidden`}>
      <div className="blob blob-blue -left-24 -top-24 h-80 w-80" />
      <div className="blob blob-teal -right-20 top-1/3 h-72 w-72" />
      <div className="blob blob-orange bottom-[-6rem] left-1/3 h-72 w-72" />
      <div className="dot-grid absolute inset-0" />
    </div>
  );
}

/** Stylised virus particle drawn with currentColor. */
export function VirusGlyph({ className = "" }: { className?: string }) {
  const spikes = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className} fill="currentColor">
      {spikes.map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <rect x="48.5" y="6" width="3" height="16" rx="1.5" />
          <circle cx="50" cy="7" r="5" />
        </g>
      ))}
      <circle cx="50" cy="50" r="27" />
      <circle cx="41" cy="44" r="4" fillOpacity="0.35" fill="var(--card)" />
      <circle cx="58" cy="56" r="5" fillOpacity="0.3" fill="var(--card)" />
      <circle cx="55" cy="39" r="2.5" fillOpacity="0.3" fill="var(--card)" />
    </svg>
  );
}
