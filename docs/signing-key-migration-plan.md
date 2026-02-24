# Signing Key Migration Plan: SP_SIGNING_KEY Protection

**Date:** 2026-02-19
**Based on:** `docs/reviews/signing-key-security-review.md` (v3.0)
**Approach:** Option A — Secrets Manager + ECS/Fargate

---

## Overview

Migrate `SP_SIGNING_KEY` from a plaintext environment variable to AWS Secrets Manager. The agent fetches the key on startup — no architectural changes, no new Lambda, no interface extraction. A separate key generation ceremony ensures the private key never touches developer machines, and the account contract is deployed using only the derived public key.

**Total estimated effort:** ~3-5 days with one developer.

---

## Milestone 1: Key Generation Ceremony

Generate the `SP_SIGNING_KEY` in an isolated environment and store it directly in Secrets Manager. No human should see the private key.

### Task 1.1: Write the key generation script

A standalone Node.js script that:

1. Generates 32 cryptographically random bytes (`crypto.getRandomValues`)
2. Interprets them as a big-endian unsigned integer
3. Checks if the value is in `[1, BN254_FR_MODULUS - 1]` where `BN254_FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`
4. If out of range, discards and retries (reject-and-retry — do NOT use modular reduction, which introduces bias)
5. Stores the hex-encoded key in AWS Secrets Manager via `@aws-sdk/client-secrets-manager`
6. Derives and prints the **Grumpkin public key** (`GrumpkinScalar.fromString(key)` → multiply by Grumpkin generator) — this is the only output visible to the operator
7. Derives and prints the **secp256k1 public key** (for documentation / verification)
8. Prints NO private key material to stdout, stderr, or logs

**BN254 range validation is critical.** Without it:
- Libraries may silently reduce `key mod BN254_Fr`, producing a different effective key
- The Grumpkin public key derived at generation time would not match the one the agent computes
- Signatures would fail verification on the Aztec network

**Expected retry rate:** ~25% of random 32-byte values exceed BN254 Fr. Average attempts to get a valid key: ~1.33.

### Task 1.2: Create CI job for ceremony execution

A one-time GitHub Actions workflow (or equivalent) that:

1. Runs on a hardened, ephemeral runner
2. Has AWS credentials (OIDC or short-lived) with ONLY `secretsmanager:PutSecretValue` and `kms:Encrypt` permissions
3. Executes the key generation script from Task 1.1
4. Outputs the Grumpkin public key as a CI artifact / job output
5. The runner is destroyed after the job completes — no persistent storage

**Alternative:** Run the script in AWS CloudShell if CI infrastructure is not available. CloudShell sessions are logged in CloudTrail and have no persistent filesystem between sessions.

### Task 1.3: Execute the ceremony

1. Run the CI job (or CloudShell script)
2. Record the Grumpkin public key output
3. Record the secp256k1 public key output
4. Verify the secret exists in Secrets Manager: `aws secretsmanager describe-secret --secret-id aztec-fpc/sp-signing-key`
5. Do NOT attempt to read the secret value — no human should see it

**Exit criteria:** Private key stored in Secrets Manager. Grumpkin and secp256k1 public keys documented. No private key material in CI logs, local filesystems, or chat history.

---

## Milestone 2: AWS Infrastructure

Provision the supporting AWS resources. Can be done in parallel with Milestone 1 (the ceremony creates the secret; this milestone creates the encryption key and IAM role).

### Task 2.1: Create KMS Customer Managed Key (CMK)

```
Service:  AWS KMS
Key spec: SYMMETRIC_DEFAULT (AES-256)
Alias:    alias/aztec-fpc-agent-secrets
Purpose:  Encrypts the Secrets Manager secret containing SP_SIGNING_KEY
```

- Enable automatic key rotation (every 365 days)
- Key policy: restrict `kms:Decrypt` to the agent's ECS task execution role (Task 2.3)

### Task 2.2: Associate CMK with the secret

After the ceremony (Milestone 1) creates the secret, update it to use the CMK:

```bash
aws secretsmanager update-secret \
  --secret-id aztec-fpc/sp-signing-key \
  --kms-key-id alias/aztec-fpc-agent-secrets
```

Tag the secret: `project:aztec-fpc`, `environment:production`.

### Task 2.3: Create agent IAM role / policy

The ECS task role (or EC2 instance role) needs these permissions:

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `arn:aws:secretsmanager:<region>:<account>:secret:aztec-fpc/sp-signing-key-*` | Fetch the signing key |
| `kms:Decrypt` | `arn:aws:kms:<region>:<account>:key/<cmk-key-id>` | Decrypt the secret's envelope |

No other permissions. No wildcard resources. The agent should NOT have `secretsmanager:PutSecretValue` — it can read but never write the key.

### Task 2.4: IaC (recommended)

Write CloudFormation, CDK, or Terraform templates for:
- KMS CMK + alias
- Secrets Manager secret (reference, not value — the value is set by the ceremony)
- IAM policy
- ECS task definition updates (if ECS is already IaC-managed)

This ensures the infrastructure is reproducible across staging/production environments.

**Exit criteria:** KMS CMK created and associated with the secret. IAM role scoped to least privilege. Agent can call `GetSecretValue` successfully from its execution environment.

---

## Milestone 3: Agent Config Refactor

The only code change: replace the `SP_SIGNING_KEY` env var read with a Secrets Manager fetch on startup.

### Task 3.1: Add `@aws-sdk/client-secrets-manager` dependency

Add to the agent's `package.json`:

```
@aws-sdk/client-secrets-manager
```

Ensure it doesn't break existing agent tests or bundle size. The AWS SDK v3 is modular and tree-shakeable.

### Task 3.2: Add Secrets Manager fetch to config loading

Modify `src/ts/agent/config/index.ts` to support two modes:

**Mode 1 — Secrets Manager (production):**
- New env vars: `SP_KEY_SECRET_ID` (the Secrets Manager secret name/ARN) and `AWS_REGION`
- On startup, fetch the secret and extract `SP_SIGNING_KEY` from the JSON value
- `SP_SIGNING_KEY` env var is NOT required

**Mode 2 — Local env var (development, default):**
- `SP_SIGNING_KEY` env var is read directly, as today
- No AWS dependency needed for local development

Selection logic: if `SP_KEY_SECRET_ID` is set, use Secrets Manager. Otherwise, fall back to `SP_SIGNING_KEY` env var. This is simpler than a `SIGNER_MODE` toggle — the presence of the secret ID is the signal.

### Task 3.3: Add BN254 range validation on startup

After fetching the key (from either source), validate it falls within `[1, BN254_FR_MODULUS - 1]`. If it doesn't, throw a fatal error at startup with a clear message (without logging the key value). This catches:

- Misconfigured secrets (wrong value stored)
- Key generation bugs that skipped range validation
- Accidental key truncation or corruption

### Task 3.4: Update `server.ts` initialization

The change is minimal. Before:

```
const config = loadConfig();  // reads SP_SIGNING_KEY from env
```

After:

```
const config = await loadConfig();  // may fetch from Secrets Manager (async)
```

The rest of `server.ts` is unchanged — `SecretGenerator` and `AuthwitGenerator` are instantiated with `config.spSigningKey` exactly as before.

### Task 3.5: Log sanitization audit

Verify that no log statement in the agent can leak the key:

- `config/index.ts` — ensure the fetched secret value is not logged
- `server.ts` — ensure `config.spSigningKey` is not logged during initialization
- Middleware — ensure request/response logging does not include signing outputs in full
- Error handlers — ensure stack traces from signing errors don't include key material

### Task 3.6: Tests

- **Config tests:** Verify `loadConfig()` fetches from Secrets Manager when `SP_KEY_SECRET_ID` is set (mock the AWS client)
- **Config tests:** Verify `loadConfig()` falls back to `SP_SIGNING_KEY` env var when `SP_KEY_SECRET_ID` is not set
- **Validation tests:** Verify startup fails if key is outside BN254 Fr range
- **Existing tests:** Verify all existing agent tests still pass (they use the env var path)

**Exit criteria:** Agent starts with either Secrets Manager or env var config. BN254 validation on startup. No key material in logs. All tests pass.

---

## Milestone 4: Account Contract Deployment

Deploy an **Owner Account Contract (OAC)** on Aztec using the Grumpkin public key from the ceremony. The deployer never handles the private key.

**Phase 2 dependency:** This milestone requires the Phase 2 FPC contract upgrade — adding `initialize(owner)` and on-chain authwit verification. In Phase 1, `mint()` is permissionless and there is no on-chain owner. Milestones 1-3 (key ceremony, infra, agent config) can proceed independently and should not be blocked by this.

### Task 4.1: Receive the public key

The deployer receives the Grumpkin public key from the ceremony output (Milestone 1, Task 1.3). This can be communicated via:

- CI artifact from the ceremony job
- Secure internal channel (encrypted Slack, 1Password shared vault, etc.)
- Direct copy from AWS CloudShell output

The deployer should verify the public key format (a valid Grumpkin point) before using it.

### Task 4.2: Deploy the Owner Account Contract (OAC)

The OAC is a `SingleKeyAccountContract` — Aztec's standard account contract that stores a Grumpkin public key and verifies Schnorr signatures via its `is_valid_impl()` method.

1. Instantiate `SingleKeyAccountContract` with the Grumpkin public key from the ceremony
2. Deploy via `AccountManager.deploy()` (or equivalent deployment script)
3. Record the deployed OAC address — this becomes `OWNER_ADDRESS`

The deployer only needs the **Grumpkin public key**, not the private key. The `SingleKeyAccountContract` stores the public key and uses it to verify Schnorr signatures in `is_valid()`.

### Task 4.3: Register the OAC as the FPC owner

This step requires the **Phase 2 FPC contract upgrade** (not yet implemented):

1. The FPC contract must be updated with:
   - `PublicImmutable<AztecAddress>` owner storage
   - `initialize(owner: AztecAddress)` constructor
   - Authwit verification in `mint()` that calls `OAC.is_valid(outer_hash, witness)`
2. Deploy the updated FPC (or call `initialize(OWNER_ADDRESS)` if the contract supports post-deploy initialization)
3. Update the agent's `FPC_ADDRESS` config if the FPC was redeployed

### Task 4.4: Update agent config

Set the agent's environment variables:

- `OWNER_ADDRESS` = the deployed OAC address (from Task 4.2)
- `FPC_ADDRESS` = the FPC contract address (updated if redeployed in Task 4.3)

These are already part of the agent's Zod config schema — no code changes needed, just config values.

### Task 4.5: Verify end-to-end

After deployment, verify the full chain works:

1. Start the agent (pointing to Secrets Manager for the signing key)
2. Submit an EVM transaction that triggers an authwit request
3. Agent generates secret (secp256k1 ECDSA) and authwit (Grumpkin Schnorr)
4. Submit the authwit to the FPC's `mint()` function
5. FPC calls `OAC.is_valid()` — verify the Schnorr signature is accepted
6. Verify the mint succeeds and the user receives tokens minus gas cost

**Exit criteria:** OAC deployed with the ceremony's Grumpkin public key. FPC initialized with the OAC as owner. Agent's authwits are accepted on-chain end-to-end.

---

## Milestone 5: Testing

End-to-end verification that the Secrets Manager integration works correctly.

### Task 5.1: Staging environment

1. Run the key ceremony (Milestone 1) targeting a staging Secrets Manager
2. Deploy the agent to staging with `SP_KEY_SECRET_ID` pointing to the staging secret
3. Deploy a test account contract with the ceremony's public key

### Task 5.2: Byte-identical comparison

Verify that the agent produces identical outputs regardless of key source:

1. Run the agent in local mode with a known test key (`SP_SIGNING_KEY` env var)
2. Store the same test key in staging Secrets Manager
3. Run the agent in Secrets Manager mode (`SP_KEY_SECRET_ID`)
4. Send identical requests to both instances
5. Assert byte-identical secrets and authwits

### Task 5.3: Failure mode testing

- **Secrets Manager unavailable at startup:** Agent should retry with backoff, then fail with a clear error (no crash loop)
- **Secrets Manager available at startup, unavailable later:** Agent should continue operating (key is cached in memory)
- **Invalid key in Secrets Manager (out of BN254 range):** Agent should refuse to start with a descriptive error
- **Empty or malformed secret value:** Agent should refuse to start

### Task 5.4: Key rotation dry run

Execute the key rotation procedure (Milestone 7) in staging:

1. Generate a new key → store in Secrets Manager (new version)
2. Register the new public key on the test account contract
3. Restart the agent → confirm it picks up the new key
4. Verify new authwits are accepted by the contract
5. Verify old secrets (already generated) are still valid on-chain

**Exit criteria:** Staging deployment works end-to-end. Failure modes handled gracefully. Key rotation tested.

---

## Milestone 6: Production Deployment

### Task 6.1: Pre-deployment checklist

- [ ] Key ceremony completed (Milestone 1) — key in production Secrets Manager
- [ ] KMS CMK created and associated with secret (Milestone 2)
- [ ] IAM role scoped to least privilege (Milestone 2)
- [ ] Agent code deployed with Secrets Manager support (Milestone 3)
- [ ] Account contract deployed with ceremony public key (Milestone 4)
- [ ] Staging tests passed (Milestone 5)

### Task 6.2: Cutover

1. Set `SP_KEY_SECRET_ID=aztec-fpc/sp-signing-key` in the agent's production environment
2. Remove `SP_SIGNING_KEY` from the agent's production environment
3. Restart the agent
4. Monitor startup logs — confirm Secrets Manager fetch succeeds
5. Send a test authwit request — confirm it returns a valid response

### Task 6.3: Post-cutover verification

- Check CloudTrail for `secretsmanager:GetSecretValue` events from the agent's role
- Verify no `SP_SIGNING_KEY` remains in any environment variable, `.env` file, CI secret, or deployment config
- Run a production smoke test (real authwit request end-to-end)

### Task 6.4: Rollback plan

If Secrets Manager mode fails in production:

1. Set `SP_SIGNING_KEY` env var back to the plaintext key value
2. Remove `SP_KEY_SECRET_ID` from the environment
3. Restart the agent
4. The agent falls back to the env var path — zero code changes needed

**Important:** For rollback, someone needs access to the actual key value. Designate a break-glass procedure: a single authorized operator can call `aws secretsmanager get-secret-value` to retrieve the key for rollback. This should be an exceptional procedure, not routine.

### Task 6.5: Monitoring

Set up CloudWatch alarms:

| Alarm | Threshold | Action |
|-------|-----------|--------|
| Agent startup failures | > 0 in 5 minutes | PagerDuty / Slack |
| `GetSecretValue` errors in CloudTrail | > 0 | Warning notification |
| KMS `Decrypt` errors | > 0 | Warning notification |
| Unauthorized `GetSecretValue` attempts | > 0 | Security alert |

**Exit criteria:** Agent running in production with Secrets Manager. No plaintext key in environment. Monitoring active. Rollback procedure documented.

---

## Milestone 7: Key Rotation Runbook

Document and test the procedure for rotating `SP_SIGNING_KEY`.

### Task 7.1: Write the runbook

**Step-by-step key rotation procedure:**

1. **Drain pending requests** — Ensure no in-flight EVM transactions are waiting for authwit processing. The old key's secrets are deterministic — once the key changes, the agent cannot reproduce secrets generated with the old key for pending transactions.

2. **Run the key generation ceremony** (Milestone 1 tasks) — Same procedure, new key. The ceremony stores the new key as a new version in the same Secrets Manager secret.

3. **Derive the new Grumpkin public key** — Output from the ceremony.

4. **Register the new public key** on the Aztec account contract — The account contract must accept signatures from the new key. Depending on the contract design:
   - If the contract supports multiple authorized signers: add the new key, keep the old one temporarily
   - If single-signer only: update the registered key (this is the cutover moment)

5. **Restart the agent** — On restart, the agent fetches the new key from Secrets Manager and begins signing with it.

6. **Verify** — Send a test authwit request and confirm it's accepted by the contract.

7. **Deregister the old public key** (if multi-signer) — After confirming the new key works and no pending transactions remain.

**Critical timing consideration:** Between steps 4 and 5, there is a window where the contract expects the new key but the agent is still signing with the old key (if still running). Minimize this window by performing step 5 immediately after step 4. For zero-downtime rotation with multi-signer support, register the new key first, restart the agent, then deregister the old key.

### Task 7.2: Define the grace period policy

Two options for handling the transition:

**Option A: Drain-and-cutover (simpler)**
1. Stop accepting new authwit requests
2. Wait for all pending EVM transactions to be processed
3. Rotate the key
4. Resume accepting requests

**Option B: Overlapping keys (zero downtime, if contract supports it)**
1. Register the new key as an additional authorized signer
2. Rotate the key in Secrets Manager and restart the agent
3. New requests use the new key; old pending transactions were already processed
4. After a grace period, deregister the old key

Recommend Option A for simplicity unless zero-downtime rotation is a hard requirement.

### Task 7.3: Test in staging

Execute the full runbook in the staging environment:
- Generate new key, register new public key, restart agent, verify
- Confirm old secrets remain valid on-chain (they're committed, not re-verified)
- Confirm new requests produce different secrets (expected — different key)

**Exit criteria:** Runbook written, tested in staging, grace period policy decided.

---

## Summary

| Milestone | Dependencies | Estimated Effort | Notes |
|-----------|-------------|-----------------|-------|
| 1. Key Generation Ceremony | None | 0.5-1 day | |
| 2. AWS Infrastructure | None | 0.5-1 day | |
| 3. Agent Config Refactor | None | 1-2 days | |
| 4. Account Contract Deployment | M1 (public key) + **Phase 2 contract upgrade** | 1-2 days | **Blocked by Phase 2** |
| 5. Testing | M1, M2, M3 (M4 for end-to-end) | 1-2 days | Can test M1-M3 without M4 |
| 6. Production Deployment | M5 | 0.5 day | |
| 7. Key Rotation Runbook | M6 | 0.5-1 day | |

**Parallelism:** Milestones 1, 2, and 3 can all run in parallel. Milestone 4 needs the public key from Milestone 1 AND the Phase 2 FPC contract upgrade (adding `initialize(owner)` and authwit verification).

**What can ship without Phase 2:** Milestones 1-3 and 5-7 are independent of the Phase 2 contract upgrade. The agent can start fetching the key from Secrets Manager immediately — this eliminates the plaintext env var regardless of whether on-chain authwit verification exists yet. Milestone 4 (OAC deployment + FPC owner registration) is the only step that requires Phase 2.

**Total estimated (M1-M3, M5-M7):** ~3-5 days with one developer, ~2-3 days with two.
**Milestone 4 additionally:** ~1-2 days, but blocked on Phase 2 contract work.

**Comparison with previous Lambda approach:** The Lambda-based plan (v1.0) estimated 2-3 weeks and required a new Lambda function, interface extraction, factory pattern, Lambda client implementations, and a separate deployment pipeline. This plan achieves the same security outcome (key encrypted at rest, IAM-scoped access, CloudTrail audit) with a fraction of the complexity.
