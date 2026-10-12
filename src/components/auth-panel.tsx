"use client";
import React, { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { startSignIn } from "../application/auth-actions";
import type {
  AuthProviderId,
  AuthProviderOption,
} from "../application/auth-providers";

export function ProviderIcon({ provider }: { provider: AuthProviderId }) {
  if (provider === "google")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" suppressHydrationWarning>
        <path
          suppressHydrationWarning
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.34Z"
        />
        <path
          suppressHydrationWarning
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.06.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.06v2.58A10 10 0 0 0 12 22Z"
        />
        <path
          suppressHydrationWarning
          fill="#FBBC05"
          d="M6.4 13.91a6 6 0 0 1 0-3.82V7.51H3.06a10 10 0 0 0 0 8.98l3.34-2.58Z"
        />
        <path
          suppressHydrationWarning
          fill="#EA4335"
          d="M12 5.96c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.51l3.34 2.58A6 6 0 0 1 12 5.96Z"
        />
      </svg>
    );
  if (provider === "facebook")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" suppressHydrationWarning>
        <path
          suppressHydrationWarning
          fill="#1877F2"
          d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" suppressHydrationWarning>
      <path
        suppressHydrationWarning
        fill="currentColor"
        d="M11.8102 19.1625C11.2327 19.1625 10.6841 19.0528 10.1643 18.8334C9.64459 18.6139 9.18259 18.3078 8.77834 17.9151C8.33944 18.0653 7.88322 18.1404 7.40967 18.1404C6.63582 18.1404 5.91972 17.9498 5.26137 17.5686C4.60302 17.1875 4.07172 16.6677 3.66747 16.0094C3.27477 15.351 3.07842 14.6176 3.07842 13.8091C3.07842 13.4742 3.12462 13.1103 3.21702 12.7176C2.75502 12.2903 2.39697 11.7994 2.14287 11.245C1.88877 10.679 1.76172 10.09 1.76172 9.47785C1.76172 8.85415 1.89454 8.25355 2.16019 7.67605C2.42584 7.09855 2.79544 6.6019 3.26899 6.1861C3.75409 5.75875 4.31427 5.46422 4.94952 5.30252C5.07657 4.64417 5.34222 4.05512 5.74647 3.53537C6.16227 3.00407 6.67047 2.58827 7.27107 2.28797C7.87167 1.98767 8.51269 1.83752 9.19414 1.83752C9.77164 1.83752 10.3203 1.94725 10.84 2.1667C11.3598 2.38615 11.8218 2.69222 12.226 3.08492C12.6649 2.93477 13.1211 2.8597 13.5947 2.8597C14.3685 2.8597 15.0846 3.05027 15.743 3.43142C16.4013 3.81257 16.9269 4.33232 17.3196 4.99067C17.7238 5.64902 17.9259 6.38245 17.9259 7.19095C17.9259 7.5259 17.8797 7.88973 17.7873 8.28242C18.2493 8.70977 18.6074 9.20643 18.8615 9.77238C19.1156 10.3268 19.2426 10.91 19.2426 11.5222C19.2426 12.1459 19.1098 12.7465 18.8442 13.324C18.5785 13.9015 18.2031 14.4039 17.718 14.8313C17.2445 15.2471 16.6901 15.5358 16.0548 15.6975C15.9278 16.3559 15.6564 16.9449 15.2406 17.4647C14.8363 17.996 14.3339 18.4118 13.7333 18.7121C13.1327 19.0124 12.4917 19.1625 11.8102 19.1625ZM7.53094 16.9969C8.10844 16.9969 8.61087 16.8756 9.03822 16.6331L12.2953 14.762C12.4108 14.6811 12.4686 14.5714 12.4686 14.4328V12.9429L8.27592 15.351C8.02182 15.5012 7.76772 15.5012 7.51362 15.351L4.23919 13.4626C4.23919 13.4973 4.23342 13.5377 4.22187 13.5839C4.22187 13.6301 4.22187 13.6994 4.22187 13.7918C4.22187 14.3808 4.36047 14.9237 4.63767 15.4203C4.92642 15.9054 5.32489 16.2866 5.83309 16.5638C6.34129 16.8525 6.90724 16.9969 7.53094 16.9969ZM7.70419 14.1729C7.77349 14.2076 7.83702 14.2249 7.89477 14.2249C7.95252 14.2249 8.01027 14.2076 8.06802 14.1729L9.36739 13.4279L5.19207 11.0024C4.93797 10.8523 4.81092 10.6271 4.81092 10.3268V6.56725C4.23342 6.82135 3.77142 7.21405 3.42492 7.74535C3.07842 8.2651 2.90517 8.8426 2.90517 9.47785C2.90517 10.0438 3.04954 10.5866 3.33829 11.1064C3.62704 11.6261 4.00242 12.0189 4.46442 12.2845L7.70419 14.1729ZM11.8102 18.0191C12.4224 18.0191 12.9768 17.8805 13.4734 17.6033C13.9701 17.3261 14.3628 16.9449 14.6515 16.4598C14.9403 15.9747 15.0846 15.4319 15.0846 14.8313V11.0891C15.0846 10.9505 15.0269 10.8465 14.9114 10.7772L13.5947 10.0149V14.8486C13.5947 15.1489 13.4676 15.3741 13.2135 15.5243L9.93912 17.4127C10.5051 17.817 11.1288 18.0191 11.8102 18.0191ZM12.4686 11.6781V9.32192L10.5108 8.21312L8.53579 9.32192V11.6781L10.5108 12.7869L12.4686 11.6781ZM7.40967 6.15145C7.40967 5.85115 7.53672 5.62592 7.79082 5.47577L11.0652 3.58735C10.4993 3.1831 9.87559 2.98097 9.19414 2.98097C8.58199 2.98097 8.02759 3.11957 7.53094 3.39677C7.03429 3.67397 6.64159 4.05512 6.35284 4.54022C6.07564 5.02532 5.93704 5.56817 5.93704 6.16878V9.89365C5.93704 10.0323 5.99479 10.142 6.11029 10.2228L7.40967 10.9851V6.15145ZM16.2108 14.4328C16.7883 14.1787 17.2445 13.786 17.5794 13.2547C17.9259 12.7234 18.0992 12.1459 18.0992 11.5222C18.0992 10.9562 17.9548 10.4134 17.6661 9.89365C17.3773 9.3739 17.0019 8.9812 16.5399 8.71555L13.3002 6.84445C13.2309 6.79825 13.1673 6.78092 13.1096 6.79248C13.0518 6.79248 12.9941 6.8098 12.9363 6.84445L11.637 7.5721L15.8296 10.0149C15.9567 10.0842 16.0491 10.1766 16.1068 10.2921C16.1761 10.3961 16.2108 10.5231 16.2108 10.6733V14.4328ZM12.7284 5.6317C12.9825 5.47 13.2366 5.47 13.4907 5.6317L16.7825 7.55477C16.7825 7.47393 16.7825 7.36997 16.7825 7.24292C16.7825 6.68852 16.6439 6.163 16.3667 5.66635C16.101 5.15815 15.7141 4.7539 15.2059 4.4536C14.7093 4.1533 14.1318 4.00315 13.4734 4.00315C12.8959 4.00315 12.3935 4.12442 11.9661 4.36697L8.70904 6.23808C8.59354 6.31892 8.53579 6.42865 8.53579 6.56725V8.0572L12.7284 5.6317Z"
      />
    </svg>
  );
}
function LoginError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  const message =
    error === "OAuthAccountNotLinked"
      ? "This email already has an account. Continue with the provider you used before. For an invited account, use Google with the same Gmail or Google Workspace email."
      : error === "AccessDenied"
        ? "This sign-in could not verify account ownership. Use the provider linked to your account."
        : error === "Configuration"
          ? "Sign-in needs configuration. Please contact the app owner."
          : "Couldn't sign in. Please try again.";
  return (
    <p className="error auth-error" role="alert">
      {message}
    </p>
  );
}
export function AuthPanel({
  providers,
  disabled = false,
}: {
  providers: AuthProviderOption[];
  disabled?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState("");
  function continueWith(provider: AuthProviderId) {
    setBusy(provider);
    setError("");
    startTransition(async () => {
      let destination: URL;
      try {
        destination = new URL(
          await startSignIn(provider),
          window.location.href,
        );
        if (
          destination.origin !== window.location.origin &&
          destination.protocol !== "https:"
        )
          throw new Error("Sign-in returned an unsafe destination.");
      } catch {
        setBusy(null);
        setError("Couldn't start sign-in. Please try again.");
        return;
      }
      window.location.assign(destination.href);
    });
  }
  return (
    <section className="auth-panel oauth-panel">
      <h1>
        Sign in to{" "}
        <span className="auth-title-brand wordmark">
          &nbsp;Voc4b&nbsp;&nbsp;
        </span>
      </h1>
      <div className="oauth-buttons">
        {providers.map((provider) => (
          <div key={provider.id}>
            <button
              className="oauth-button"
              disabled={disabled || !provider.enabled || busy !== null}
              aria-describedby={
                !provider.enabled ? `${provider.id}-setup` : undefined
              }
              onClick={() => void continueWith(provider.id)}
            >
              <ProviderIcon provider={provider.id} />
              <span>
                {busy === provider.id
                  ? "Connecting…"
                  : `Continue with ${provider.name}`}
              </span>
            </button>
            {!provider.enabled && (
              <span id={`${provider.id}-setup`} className="sr-only">
                {provider.name} sign-in is not configured. Contact the app
                owner.
              </span>
            )}
          </div>
        ))}
      </div>
      {providers.every((provider) => !provider.enabled) && (
        <p className="auth-setup" role="status">
          Sign-in is being set up.
        </p>
      )}
      <Suspense>
        <LoginError />
      </Suspense>
      {error && (
        <p className="error auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
