## 2024-10-18 - [CRITICAL] Prevent HMAC secret predictability

**Vulnerability:** A hardcoded HMAC secret (`default-dev-signing-secret-key-32`) was used as a fallback if the `COOKIE_SIGNING_SECRET` environment variable was missing. This allows predictability and potential token forgery if the environment variable is misconfigured or omitted in production.

**Learning:** Always fail securely by enforcing the presence of critical secrets via environment variables, rather than providing a default fallback.

**Prevention:** Throw an explicit error or fail fast if critical environment variables like HMAC signing keys are not provided. Never hardcode fallback secrets.