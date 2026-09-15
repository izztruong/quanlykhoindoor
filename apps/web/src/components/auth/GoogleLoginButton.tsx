"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Khai kiểu tối thiểu cho Google Identity Services — chỉ những gì dùng tới, không cài thêm package.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(
        parent: HTMLElement,
        options: { theme?: string; size?: string; text?: string; width?: number; locale?: string },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

interface GoogleLoginButtonProps {
  /** Nhận ID token để gửi lên `/api/auth/google`. */
  onCredential: (credential: string) => void;
}

/** Không cấu hình `NEXT_PUBLIC_GOOGLE_CLIENT_ID` thì không hiện gì. */
export function GoogleLoginButton({ onCredential }: GoogleLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Script chỉ initialize một lần với callback lúc đó; đi qua ref để luôn gọi bản handler mới nhất.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  function renderButton() {
    const google = window.google;
    if (!google || !containerRef.current || !GOOGLE_CLIENT_ID) return;
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => onCredentialRef.current(response.credential),
    });
    google.accounts.id.renderButton(containerRef.current, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      // Google giới hạn tối đa 400px.
      width: Math.min(containerRef.current.offsetWidth, 400),
      locale: "vi",
    });
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={renderButton} />
      {/* Chừa sẵn chiều cao nút để khung đăng nhập không giật khi script tải xong. */}
      <div ref={containerRef} className="flex min-h-10 w-full justify-center" />
    </>
  );
}
