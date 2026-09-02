'use client';

import Script from 'next/script';
import { useRef } from 'react';

interface GsiCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GsiCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme: string; size: string; width: number },
          ) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Renders Google's own sign-in button; hands the ID token to the caller. */
export function GoogleSignInButton({
  onCredential,
}: {
  onCredential: (idToken: string) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  if (!CLIENT_ID) {
    return null;
  }
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => {
          if (!window.google || !slotRef.current) return;
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response) => onCredential(response.credential),
          });
          window.google.accounts.id.renderButton(slotRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
          });
        }}
      />
      <div ref={slotRef} className="flex justify-center" />
    </>
  );
}
