# Security policy

## Supported versions

Security fixes are provided for the latest released 0.x minor version.

## Reporting

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing credentials, exploitable payloads, private provider URLs, or personal data. Include the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an initial response within seven days.

## Scope and deployment guidance

The library does not store credentials or run a network service by itself. Network adapters accept URLs, headers, and an injectable `fetch`; a server that accepts untrusted provider configuration must enforce its own URL allowlist, egress controls, DNS/IP policy, response-size limits, authentication boundaries, and log redaction. Client-side credentials must not be embedded in the GitHub Pages demo or browser bundles.

Provider URLs placed in provenance are stripped of usernames, passwords, and credential-like query parameters. Errors are bounded before inclusion in output. Consumers should still treat provider responses and metadata as untrusted input.

The local-file adapter reads paths chosen by the host application; do not expose arbitrary path configuration to untrusted users. The Node-only Overture provider executes the configured binary directly (never through a shell), but an untrusted `command` or `commandArgs` value is still arbitrary process execution and must not be accepted from untrusted workflow files. The JSON directory store writes complete snapshots, which may include personal or sensitive source attributes if the host allowed them through. Protect store permissions and backups accordingly. The PostGIS helper accepts only a validated simple schema identifier and parameterizes record values, but database credentials, network policy, roles, retention, and row-level access remain the deployer's responsibility.
