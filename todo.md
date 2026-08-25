# Firebox Baileys TODO

- [x] Add an HTTP service entrypoint so Railway receives a long-running process.
- [x] Add `/health` and panel-compatible bot status and pairing endpoints.
- [x] Add Firebox Hub event forwarding without exposing private bot credentials to clients.
- [x] Add Railway-compatible start script, port binding, and deployment documentation.
- [x] Preserve the library export and verify the package still builds and imports.
- [x] Add automated tests for health, status, pairing validation, and webhook forwarding.
- [x] Push the deployment fix to the firebox-baileys GitHub repository.
- [ ] Verify the Railway URL after redeploying the updated repository.

## Historical diagnosis

- [x] Confirm the deployed repository is `njogu26713-commits/firebox-baileys`.
- [x] Confirm the public Railway URL currently returns HTTP 502 because no HTTP application responds.

- [x] Diagnose and fix `QR refs attempts ended` pairing-code rejection in the deployed service.
- [x] Resolve the `Invalid or disabled bot key` Hub configuration mismatch and improve its diagnostics.
- [x] Add pairing-lifecycle regression coverage and push the repair.

- [x] Fix the new pairing-code timeout caused by waiting for the wrong socket lifecycle event.

- [x] Diagnose the post-pairing `logging in...` state and any subsequent disconnect or failure.

- [x] Handle WhatsApp code 515 (`restart required`) by reconnecting with the newly saved credentials.
