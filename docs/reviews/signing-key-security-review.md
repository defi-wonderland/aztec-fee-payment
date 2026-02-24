# Signing Key Security Review: SP_SIGNING_KEY Protection

**Date:** 2026-02-19
**Status:** Proposal
**Version:** 3.0

---

## 1. Executive Summary

The off-chain agent stores `SP_SIGNING_KEY` as a plaintext environment variable. This single 32-byte secp256k1 private key drives two distinct cryptographic operations on two different elliptic curves:

1. **secp256k1 ECDSA** (RFC 6979) — deterministic secret generation
2. **Grumpkin Schnorr** — authwit signature generation via Barretenberg WASM

AWS KMS cannot natively perform either operation: it does not support deterministic (RFC 6979) ECDSA, and it has no Schnorr or Grumpkin curve support. This means KMS cannot replace the signing operations — it can only protect the key at rest.

**Recommended approach:** Store `SP_SIGNING_KEY` in AWS Secrets Manager (encrypted by a KMS CMK). The existing Express agent (deployed on ECS/Fargate or EC2) fetches the key from Secrets Manager on startup instead of reading it from an environment variable. No architectural changes to the agent — only the key source changes. A separate key generation ceremony ensures the private key never touches developer machines, and account contract deployment uses only the derived public key.

---

## 2. Current Architecture: How SP_SIGNING_KEY Is Used

### 2.1 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Environment                                                │
│  SP_SIGNING_KEY=0x...  (plaintext in .env / container env)  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  loadConfig()                │
│  config/index.ts:29          │
│  env.SP_SIGNING_KEY → config │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ SecretGen    │  │ AuthwitGen       │
│ server.ts:65 │  │ server.ts:66-70  │
│              │  │                  │
│ secp256k1    │  │ Grumpkin Schnorr │
│ ECDSA        │  │ (Barretenberg)   │
│ (RFC 6979)   │  │                  │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────────┐
│  authwit route handler               │
│  routes/authwit.ts:85  → secret      │
│  routes/authwit.ts:89  → authwit     │
└──────────────────────────────────────┘
```

### 2.2 SecretGenerator — secp256k1 ECDSA (RFC 6979)

**File:** `src/ts/agent/services/crypto/secret.ts`

| Step | Code Location | Operation |
|------|---------------|-----------|
| Input | `secret.ts:42` | `generateSecret(txHash, sender)` |
| Concatenate | `secret.ts:43-47` | `combined = txHashBytes \|\| senderBytes` |
| Hash | `secret.ts:48` | `message = sha256(combined)` |
| Sign | `secret.ts:49` | `secp256k1.sign(message, signingKey)` — deterministic via RFC 6979 |
| Extract r | `secret.ts:50` | `signature.toCompactRawBytes().slice(0, 32)` |
| Reduce | `secret.ts:51` | `r mod BN254_FR_MODULUS` |

**Critical property:** RFC 6979 guarantees the same `(message, key)` pair always produces the same signature. This determinism is the entire point — the secret must be reproducible without storing state. KMS's `ECC_SECG_P256K1` key type uses the HSM's hardware RNG for nonce generation, making it **non-deterministic** and incompatible.

### 2.3 AuthwitGenerator — Grumpkin Schnorr

**File:** `src/ts/agent/services/crypto/authwit.ts`

| Step | Code Location | Operation |
|------|---------------|-----------|
| Parse key | `authwit.ts:37` | `GrumpkinScalar.fromString(ownerSigningKey)` — interprets the same hex key as a Grumpkin scalar |
| Inner hash | `authwit.ts:51` | `computeInnerAuthWitHash([amount, secret])` — Poseidon2 hash |
| Outer hash | `authwit.ts:54-58` | `computeOuterAuthWitHash(fpcAddress, chainId, version, innerHash)` — Poseidon2 hash |
| Sign | `authwit.ts:62-65` | `schnorr.constructSignature(outerHash, ownerSigningKey)` — Schnorr on Grumpkin curve via Barretenberg WASM |
| Serialize | `authwit.ts:66` | `signature.toFields()` — array of Fr elements |

**Critical property:** Uses Barretenberg's WASM-based Schnorr implementation on the Grumpkin curve (a BN254 companion curve). No cloud HSM supports Grumpkin.

### 2.4 Key Reuse Across Curves

The same `SP_SIGNING_KEY` hex string is used as:
- A **secp256k1 private key** in `SecretGenerator` (`secret.ts:28`)
- A **Grumpkin scalar** in `AuthwitGenerator` (`authwit.ts:37`)

Both constructors receive `config.spSigningKey` from the same config field (`server.ts:65,69`). While this works (both are 256-bit scalars in fields of similar order), it is a non-standard practice — a key compromise on either curve exposes the other operation.

### 2.5 Instantiation

**File:** `src/ts/agent/server.ts:64-70`

```typescript
const secretGenerator = new SecretGenerator(config.spSigningKey);       // line 65
const authwitGenerator = new AuthwitGenerator({                          // line 66
  fpcAddress: config.aztec.fpcAddress,
  ownerAddress: config.aztec.ownerAddress,
  ownerSigningKey: config.spSigningKey,                                  // line 69
});
```

The key lives in process memory for the lifetime of the Express server.

---

## 3. AWS KMS Compatibility Analysis

### 3.1 Requirement Matrix

| Crypto Requirement | AWS KMS | CloudHSM | Secrets Manager + Lambda | Nitro Enclaves |
|--------------------|---------|----------|--------------------------|----------------|
| secp256k1 ECDSA (RFC 6979, deterministic) | **No** — uses HSM RNG for k-value | **No** — same HSM RNG issue | **Yes** — runs `@noble/curves` in Lambda | **Yes** — runs custom code |
| Grumpkin Schnorr (BN254 companion) | **No** — no Grumpkin/Schnorr support | **No** — no custom curves | **Yes** — runs Barretenberg WASM in Lambda | **Yes** — runs custom code |
| Key-at-rest encryption | **Yes** — AES-256-GCM envelope | **Yes** — FIPS 140-2 L3 | **Yes** — Secrets Manager uses KMS CMK | **Yes** — attestation-based |
| Key never leaves hardware | **Yes** | **Yes** | **No** — key in Lambda RAM | **Partial** — key in enclave RAM |
| Audit trail | **Yes** — CloudTrail | **Yes** — CloudTrail | **Yes** — CloudTrail + Lambda logs | **Yes** — attestation logs |
| Custom curve support | **No** | **No** (limited PKCS#11) | **Yes** — arbitrary code | **Yes** — arbitrary code |

### 3.2 Key Blockers for Native KMS Signing

**Blocker 1: Non-deterministic ECDSA**

KMS supports `ECC_SECG_P256K1` for ECDSA signing, but the HSM generates the nonce `k` using its internal hardware RNG (per FIPS 186-4). RFC 6979 requires `k = HMAC-DRBG(private_key, message_hash)` — deterministic from the key and message. Since the agent relies on determinism to reproduce the same secret for the same `(txHash, sender)` without state, KMS ECDSA is incompatible.

**Blocker 2: No Schnorr / Grumpkin**

KMS and CloudHSM support NIST P-256, P-384, P-521, and secp256k1 for ECDSA only. There is no Schnorr signature scheme, no BN254 curve, and no Grumpkin curve. The Aztec authwit system requires Schnorr signatures on Grumpkin — this can only be computed in software (Barretenberg WASM).

### 3.3 Conclusion

KMS's role is limited to **key-at-rest protection** (encrypting the stored key). All signing must happen in software with access to the raw private key bytes.

---

## 4. Approach Evaluation

Options are presented in order of recommendation (best first). For the full weighted scoring analysis, see `docs/reviews/kms-options-ranking.md`.

### 4.1 Option A: Secrets Manager + ECS/Fargate (Recommended)

Keep the existing Express agent architecture. Replace the plaintext `SP_SIGNING_KEY` env var with a Secrets Manager fetch on startup. Deploy the agent on ECS/Fargate (or EC2) as a long-running service.

The agent calls `secretsmanager:GetSecretValue` once during initialization, instantiates `SecretGenerator` and `AuthwitGenerator` with the fetched key, and operates exactly as it does today. No new Lambda, no interface extraction, no `SIGNER_MODE` toggle.

**Pros:**
- **Minimal migration** — only the key source changes, no architectural refactor
- **No cold starts** — the agent is always warm, predictable latency
- **Scales horizontally** — add more ECS tasks / EC2 instances behind a load balancer
- **Handles high throughput** — no per-invocation concurrency limits, no burst scaling delays
- **Same security win** — key-at-rest protection via KMS CMK, IAM-scoped access, CloudTrail audit
- **Key rotation** via Secrets Manager (restart agent to pick up new key)

**Cons:**
- Key lives in process memory for the lifetime of the service (same as current architecture, but now encrypted at rest)
- Requires container orchestration (ECS/Fargate) vs. current bare deployment

### 4.2 Option B: Nitro Enclaves

Run the signing logic inside an AWS Nitro Enclave — an isolated VM with no persistent storage, no network, and attestation-based key release. The enclave's attestation document proves the code identity to KMS, which only releases the key to verified enclave code.

**Pros:** Strongest isolation (key never in main VM memory), attestation-bound access, hardware-grade protection.
**Cons:** Requires EC2 (not serverless), significant operational complexity, vsock-based communication, enclave image build pipeline, longest migration timeline.

### 4.3 Option C: Secrets Manager + Lambda

Store `SP_SIGNING_KEY` in AWS Secrets Manager (encrypted by a KMS CMK). A Lambda function fetches the key on cold start, caches it in module-scoped memory, and exposes two internal endpoints for secret generation and authwit signing.

**Pros:** No plaintext key in env vars, IAM-scoped access, CloudTrail audit, key rotation via Secrets Manager, pay-per-invocation at low volume.
**Cons:** Key exists in Lambda RAM during execution (not hardware-isolated), cold starts from Barretenberg WASM init, throughput limited by concurrency model, significant refactoring required.

### 4.4 Scalability Analysis: Why Lambda Is Problematic at High Volume

Under sustained high request volume, Lambda's serverless model introduces issues that negate its security advantages:

**Cold start storms:** When traffic bursts from 0 to N concurrent requests, all N hit cold starts (~1.5-3.5s each due to Barretenberg WASM init). Lambda's burst concurrency limit is 500-3,000 depending on region, then scales at only 500 additional instances per minute.

**The "short-lived memory" argument evaporates:** Lambda's primary selling point is that environments are "short-lived." But under sustained load, warm instances persist for hours — the key sits in memory just as long as it would in an Express server. Provisioned concurrency (needed for latency SLAs) makes this even more explicit: those instances run continuously.

**Per-invocation overhead:** Each Lambda invocation handles exactly one request. At ~50ms warm execution, a single instance handles ~20 req/s. For 10,000 req/s sustained, you need 500 concurrent instances — all holding the key in memory simultaneously. An ECS service achieves the same throughput with far fewer instances since the Express server can handle concurrent requests in the same process.

**Cost crossover:** Lambda's pay-per-invocation pricing is cheap at low volume but crosses over ECS/Fargate at moderate sustained load. At 512MB and 100ms average duration:
- 1M requests/month: Lambda ~$1 vs. Fargate ~$15 → Lambda wins
- 50M requests/month: Lambda ~$40 vs. Fargate ~$30 → Fargate wins
- 500M requests/month: Lambda ~$400 vs. Fargate ~$60 → Fargate dominates

**Conclusion:** For the expected high request volume, a long-running compute service (ECS/Fargate/EC2) provides better latency, simpler scaling, and lower cost — while achieving the same key-at-rest security benefit via Secrets Manager.

### 4.5 Comparison

| Criterion | A: SM + ECS/Fargate | B: Nitro Enclaves | C: SM + Lambda |
|-----------|---------------------|-------------------|----------------|
| **Security** | Good — key in process RAM | Excellent — enclave RAM | Good — key in Lambda RAM |
| **Complexity** | **Low** (config change only) | High | Medium (new Lambda + interfaces) |
| **Migration effort** | **~2-3 days** | ~4-6 weeks | ~1-2 weeks |
| **Cost (low volume)** | ~$15-30/mo | ~$200+/mo | ~$5-20/mo |
| **Cost (high volume)** | **Fixed per-instance** | Fixed per-instance | Scales linearly per-request |
| **Cold start latency** | **None** | 5-10s (boot only) | 1.5-3.5s (per cold start) |
| **High throughput** | **Horizontal scaling** | Limited by instance count | Limited by concurrency + cold starts |
| **Key rotation** | SM native + restart | Enclave redeployment | SM native + cold start |
| **Architectural change** | **None** | New infra, vsock | New Lambda, interfaces, factory |

**Recommendation:** Option A provides the same key-at-rest protection as Option C with dramatically less complexity and better scalability characteristics. The real security improvement — eliminating the plaintext env var — is identical across Options A and C. Lambda's "short-lived memory" advantage disappears under sustained load. Option B remains the future upgrade path if hardware-grade isolation becomes a requirement.

---

## 5. Key Generation Requirements

### 5.1 BN254 Field Constraint

The `SP_SIGNING_KEY` must be a valid scalar in both fields it operates on:

| Field | Order | Approx. Bits |
|-------|-------|-------------|
| secp256k1 (n) | `0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141` | ~256 |
| BN254 Fr (q) | `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001` | ~254 |

The key must satisfy `1 <= key < BN254_Fr_order` since BN254 Fr is the smaller field. A random 32-byte value has only ~75% probability of falling within this range.

**Critical:** Key generation MUST use **reject-and-retry** (generate random bytes, check if < BN254 Fr, retry if not). Do NOT use modular reduction (`key mod BN254_Fr`) — reduction introduces statistical bias toward lower values, which is cryptographically unacceptable for a signing key.

### 5.2 Key Generation Ceremony

The private key must never touch a developer's machine. The ceremony should run in an isolated, auditable environment:

**Option 1: Dedicated CI Job (Recommended)**

1. A CI pipeline (GitHub Actions, etc.) runs a one-time key generation job in a hardened runner
2. The job generates random bytes, validates they fall in `[1, BN254_Fr - 1]`
3. The job stores the private key directly into AWS Secrets Manager via `aws secretsmanager put-secret-value`
4. The job derives the **Grumpkin public key** (`privateKey * G_grumpkin`) and outputs it to the job log / artifact
5. The job derives the **secp256k1 public key** and outputs it (for verification / future use)
6. The runner is ephemeral — key material only exists in Secrets Manager after the job completes
7. CI logs are audited to confirm no private key leakage

**Option 2: AWS CloudShell / Secure Workstation**

1. An authorized operator runs a key generation script in AWS CloudShell (already authenticated, no local storage)
2. Same validation and Secrets Manager storage as Option 1
3. The operator sees only the public keys in the terminal output
4. CloudShell sessions are logged in CloudTrail

**Both options produce the same outputs:**
- Private key → stored in Secrets Manager (never visible to humans)
- Grumpkin public key → handed to the deployer for account contract registration
- secp256k1 public key → documented for verification purposes

### 5.3 Account Contract Deployment Separation

The account contract deployment and the key generation are deliberately separated so that **no single person or system holds both the private key and the ability to deploy**.

| Role | Has Access To | Does NOT Have Access To |
|------|---------------|------------------------|
| Key generator (CI job) | Private key (transiently), Secrets Manager write | Aztec deployment tooling |
| Deployer | Grumpkin public key, Aztec deployment tooling | Private key, Secrets Manager read |
| Agent (runtime) | Private key (via Secrets Manager), signing operations | Deployment tooling |

**Deployment flow:**

1. Key ceremony produces Grumpkin public key (section 5.2)
2. Public key is communicated to the deployer out-of-band (CI artifact, secure channel, etc.)
3. Deployer deploys an **Owner Account Contract (OAC)** — a `SingleKeyAccountContract` initialized with the Grumpkin public key. This produces `OWNER_ADDRESS`.
4. Deployer updates the FPC contract to reference `OWNER_ADDRESS` as its owner (requires Phase 2 contract upgrade — `initialize(owner)` function)
5. Deployer never needs or receives the private key
6. Agent fetches the private key from Secrets Manager at runtime and performs signing

**Note: Phase 2 dependency.** Steps 3-4 require the Phase 2 contract upgrade (adding `initialize(owner)` and authwit verification to the FPC). In Phase 1, `mint()` is permissionless and there is no on-chain owner. The key ceremony and Secrets Manager migration (steps 1-2, 5-6) can proceed independently.

**The private key never needs to be exposed to humans after generation.** The agent fetches it programmatically from Secrets Manager on startup via IAM-scoped access. The account contract only needs the public key to verify signatures — the standard public-key cryptography separation.

---

## 6. Detailed Implementation Plan (Option A: Secrets Manager + ECS/Fargate)

The implementation plan is maintained separately in `docs/signing-key-migration-plan.md`. It covers:

1. Key Generation Ceremony — BN254-safe key generation, Secrets Manager storage, public key derivation
2. AWS Infrastructure — KMS CMK, Secrets Manager secret, IAM roles
3. Agent Config Refactor — Replace env var with Secrets Manager fetch on startup
4. Account Contract Deployment — Public-key-only deployment, role separation
5. Testing — Byte-identical comparison, Secrets Manager integration, key rotation dry run
6. Production Deployment — Cutover from plaintext env var to Secrets Manager
7. Key Rotation Runbook — Tested procedure for rotating the signing key

---

## 7. Limitations & Risks

### 7.1 Key in Process Memory

The private key exists in plaintext in the agent's process memory for the service lifetime. This is identical to the current architecture — the only change is that the key is now encrypted at rest in Secrets Manager rather than stored as a plaintext env var.

**Mitigation:** ECS Fargate provides task-level isolation (each task runs in its own microVM). Memory is not shared between tasks and is encrypted at rest. This is the same security posture as a warm Lambda instance under sustained load.

### 7.2 Single Key Across Two Curves

The current design reuses one key as both a secp256k1 scalar and a Grumpkin scalar. While both fields have similar order (~2^256), this is non-standard. A compromise via one curve's operations could theoretically weaken security on the other.

**Mitigation (future):** Derive two separate keys from a master key using HKDF. E.g., `secret_key = HKDF(master, "secp256k1-secret")` and `authwit_key = HKDF(master, "grumpkin-authwit")`. This would require updating the Aztec-side registration to use the new authwit public key.

### 7.3 BN254 Key Range

If a key is generated without validating it falls within `[1, BN254_Fr - 1]`, libraries may silently reduce it modulo the field order, producing a different effective key than intended. This could cause mismatches between the agent's signing key and the registered public key.

**Mitigation:** The key generation ceremony (section 5.2) enforces reject-and-retry validation. Add a startup assertion in the agent that validates the fetched key is within range before instantiating the signing services.

### 7.4 Secrets Manager Availability

If Secrets Manager is unavailable during agent startup, the agent cannot initialize. Unlike a plaintext env var, this introduces a runtime dependency on an AWS service.

**Mitigation:** Secrets Manager has a 99.99% SLA. The agent should retry with exponential backoff on startup. If Secrets Manager is persistently down, the rollback plan (section in migration plan) restores the plaintext env var within minutes.

### 7.5 Future Upgrade: Option B (Nitro Enclaves)

For organizations requiring hardware-grade isolation, Option A can be upgraded to Option B (Nitro Enclaves):

1. Package the signing logic as an enclave image (EIF)
2. Use KMS attestation-based key release — KMS only decrypts the key for verified enclave code
3. Communication via vsock (no network access from enclave)
4. The agent calls the enclave instead of signing in-process

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-18 | Initial review — four options. Recommended Lambda approach. |
| 2.0 | 2026-02-19 | Added ECS/Fargate option, scalability analysis, key generation ceremony, BN254 constraints, account contract deployment separation. Changed recommendation to ECS/Fargate. |
| 3.0 | 2026-02-19 | Removed KMS Envelope option (strictly dominated). Relabeled and reordered remaining options by rank: A (SM + ECS/Fargate), B (Nitro Enclaves), C (SM + Lambda). |

---

## 9. References

- [AWS KMS Key Spec Reference](https://docs.aws.amazon.com/kms/latest/developerguide/asymmetric-key-specs.html) — supported curves and algorithms
- [AWS Secrets Manager User Guide](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) — secret storage and rotation
- [AWS Lambda Execution Environment](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) — lifecycle, cold starts, memory
- [AWS Nitro Enclaves](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave.html) — attestation and isolation model
- [AWS ECS on Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html) — task-level isolation, microVM architecture
- [RFC 6979](https://datatracker.ietf.org/doc/html/rfc6979) — deterministic ECDSA nonce generation
- [noble-curves secp256k1](https://github.com/paulmillr/noble-curves) — the ECDSA library used by `SecretGenerator`
- [Aztec Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg) — Schnorr/Grumpkin implementation
- [BN254 Curve Parameters](https://eips.ethereum.org/EIPS/eip-197) — field order and curve specification
