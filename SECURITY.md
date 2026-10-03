# Security

Report vulnerabilities through GitHub's
[private vulnerability reporting](https://github.com/Starfie1d1272/cs2-c4-damage/security/advisories/new).
If it is unavailable, open an issue requesting a private contact without disclosing
exploit details. Include the package version and a minimal synthetic reproduction.
Do not include credentials, game resources or identifying telemetry.

Security fixes target the newest beta while the project is in prerelease development.
There is no formal security-response SLA.

## External inputs

The field parser and GSI decoder validate the data used by the model. Applications
hosting a GSI endpoint should enforce their own request authentication, payload limits
and freshness policy. The library provides calculation and decoding APIs, not an HTTP server.

The Node extraction API executes a caller-selected, SHA-256-pinned local decompiler.
Use a trusted executable and application-controlled paths. The core and GSI entries do
not launch processes. Keep tokens, real telemetry and game assets outside source control.
