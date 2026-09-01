import { isValidCertNumber } from '@macgrading/shared';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500">
        MAC Grading — shared linked: {String(isValidCertNumber('000000001'))}
      </p>
    </main>
  );
}
