import Image from 'next/image';

/** Original, unmodified company asset; fixed ratio prevents layout shift. */
export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      className="brand-logo"
      src="/brand/psi-energy.png"
      alt="PSI Energy"
      width={260}
      height={87}
      priority={priority}
      unoptimized
    />
  );
}
