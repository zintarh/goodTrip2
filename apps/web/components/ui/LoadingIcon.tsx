// Reusable loading indicator built from the app's own logo mark (the rounded
// purple square shown on the home screen) instead of generic "Loading…" text
// — pulsating so it still reads as "busy" without spinner/text noise.
export function LoadingIcon({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`mx-auto bg-brand-purple border-b-4 border-brand-purpleDark animate-logo-pulse ${className}`}
      // Fixed rounded-2xl corners look circular at small sizes — scale the
      // radius with size instead, so this reads as the same squircle logo
      // whether it's a 22px inline button icon or a 64px full-screen one.
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    />
  );
}
