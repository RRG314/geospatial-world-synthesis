# Security policy

## Supported versions

Security fixes are provided for the latest released 0.x minor version.

## Reporting

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing credentials, exploitable payloads, private provider URLs, or personal data. Include the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an initial response within seven days.

## Scope and deployment guidance

The library does not store credentials or run a network service by itself. Network adapters accept URLs, headers, and an injectable `fetch`; a server that accepts untrusted provider configuration must enforce its own URL allowlist, egress controls, DNS/IP policy, response-size limits, authentication boundaries, and log redaction. Client-side credentials must not be embedded in the GitHub Pages demo or browser bundles.

Provider URLs placed in provenance are stripped of usernames, passwords, and credential-like query parameters. Errors are bounded before inclusion in output. Consumers should still treat provider responses and metadata as untrusted input.
