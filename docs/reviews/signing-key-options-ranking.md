# Signing Key Options Ranking: Full Comparative Review

**Date:** 2026-02-19
**Based on:** `docs/reviews/signing-key-security-review.md` (v3.0)
**Purpose:** Evaluate all three approaches for protecting `SP_SIGNING_KEY`, rank them for our specific constraints, and justify the final recommendation.

---

## Constraints Unique to This System

Before ranking, it's important to name the constraints that make this problem different from a generic "put your key in KMS" scenario:

1. **RFC 6979 determinism** — The secret generation MUST be deterministic. Same `(txHash, sender, key)` → same secret, every time, with no stored state. This eliminates any HSM that uses hardware RNG for ECDSA nonce generation.

2. **Grumpkin/Schnorr** — The authwit signing uses Schnorr signatures on the Grumpkin curve (BN254 companion). No cloud HSM supports this. Signing MUST happen in software with access to raw key bytes.

3. **BN254 scalar compatibility** — The key must be a valid element of BN254 Fr (`< 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`, ~254 bits). This is smaller than secp256k1's field order, so the BN254 constraint is the binding one.

4. **High request volume** — The system is expected to handle a large volume of authwit requests. Cold starts, per-invocation limits, and burst scaling delays are real operational concerns.

5. **Account contract deployment** — Labs must deploy an Aztec account contract registered to this key's Grumpkin public key. The deployment process must be safe (deployer should not handle the private key).

**The hard truth:** Because of constraints 1 and 2, no cloud HSM can perform the actual signing. Every option ends up with the raw private key in some process's RAM. The only question is: how is the key protected **at rest** (storage) and **in transit** (from storage to the signing process)?

---

## The Three Options

### Option A: Secrets Manager + ECS/Fargate

Keep the existing Express agent. Replace the `SP_SIGNING_KEY` env var with a Secrets Manager fetch on startup. Deploy on ECS/Fargate (or EC2). No architectural changes to the agent code.

### Option B: Nitro Enclaves

Run signing logic inside an AWS Nitro Enclave — an isolated microVM with no network, no persistent storage, and attestation-based key release. KMS only releases the key to verified enclave code. Communication via vsock.

### Option C: Secrets Manager + Lambda

Store key in Secrets Manager. Build a dedicated Lambda function that fetches the key on cold start, caches it in module scope, and exposes `generateSecret` / `generateAuthwit` endpoints. The Express agent calls the Lambda instead of signing locally.

---

## Evaluation Criteria

Each option is scored on 8 criteria, rated 1-5 (5 = best):

| # | Criterion | Weight | What it measures |
|---|-----------|--------|------------------|
| 1 | **Key-at-rest security** | High | Is the key encrypted when not in use? Who can access it? |
| 2 | **Runtime key exposure** | Medium | How long and how broadly is the key exposed in RAM? |
| 3 | **Throughput under load** | High | Can it handle sustained high request volume without degradation? |
| 4 | **Latency predictability** | High | Are there cold starts, warm-up delays, or variable response times? |
| 5 | **Migration complexity** | High | How much code, infrastructure, and testing is needed? |
| 6 | **Operational overhead** | Medium | Ongoing maintenance, monitoring, debugging difficulty |
| 7 | **Cost at scale** | Medium | Monthly cost at high request volume |
| 8 | **Key ceremony compatibility** | Medium | How well does it support safe key generation and account contract deployment? |

---

## Detailed Scoring

### 1. Key-at-Rest Security

All three options store the key in Secrets Manager (or KMS-wrapped equivalent). The key is encrypted with AES-256 via a KMS CMK. Access is IAM-scoped and CloudTrail-audited.

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 4/5 | Secrets Manager + KMS CMK. Strong encryption, IAM-scoped, audited. |
| B | 5/5 | Attestation-based: KMS will only release the key to verified enclave code. Strongest access control. |
| C | 4/5 | Identical to A — same Secrets Manager, same KMS CMK, same IAM controls. |

**Analysis:** Options A and C are effectively identical here — Secrets Manager already encrypts with KMS. Option B is genuinely stronger because of attestation: even a compromised IAM principal can't decrypt without running inside the verified enclave.

### 2. Runtime Key Exposure

This measures how long and how broadly the raw key bytes exist in process memory.

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 2/5 | Key in Express server process memory for the service lifetime. Same as current architecture. |
| B | 5/5 | Key in enclave RAM only. Enclave has no network, no persistent storage, no shell access. Even the host EC2 instance cannot read enclave memory. |
| C | 3/5 | Key in Lambda RAM. Short-lived at low volume, but warm instances persist for hours under load. Under sustained traffic, equivalent to a long-running process. |

**Analysis:** This is where the "Lambda is more secure" argument was originally made. But it's misleading at scale:

- **Low volume (< 1 req/min):** Lambda environments are recycled after ~5-15 min of inactivity. The key genuinely exists in memory for shorter periods. Score for C would be 4/5 here.
- **High volume (sustained traffic):** Warm Lambda instances persist for hours. 500 concurrent instances each hold the key in RAM. At this point, there are MORE copies of the key in memory than with a single ECS service. Score for C drops to 2/5 — worse than A.
- **Provisioned concurrency:** If you add provisioned concurrency to avoid cold starts (which you'd need for latency SLAs), instances run 24/7 — identical to a long-running process.

**At the expected high volume, Options A and C have equivalent runtime exposure.** Only Option B provides genuine isolation.

### 3. Throughput Under Load

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 5/5 | Express server handles concurrent requests within a single process (Node.js event loop + worker threads if needed). Horizontal scaling via ECS task count or EC2 auto-scaling. No per-invocation limits. No burst concurrency caps. |
| B | 3/5 | Limited by EC2 instance size and vsock throughput. Can handle many concurrent requests per instance (signing is CPU-bound, parallelizable). Horizontal scaling requires multiple EC2 instances. |
| C | 2/5 | One request per Lambda instance. Max ~20 req/s per warm instance. Burst limited to 500-3,000 concurrent invocations per region, then scales at 500/min. Requires reserved/provisioned concurrency for predictability. |

**Analysis:** Lambda's one-request-per-instance model is the fundamental bottleneck. For a "TON of requests," you'd need hundreds of concurrent Lambda instances, each initialized with Barretenberg WASM. ECS/Fargate scales by adding more tasks, each handling many concurrent requests. The scaling efficiency is dramatically different.

### 4. Latency Predictability

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 5/5 | No cold starts. Agent is always running. Latency is purely signing computation time (~5-50ms depending on operation). Fully predictable. |
| B | 3/5 | Enclave boot: 5-10s. But once running, the enclave is persistent — no cold starts per request. vsock adds ~1-5ms per call. Predictable after boot. |
| C | 2/5 | Cold starts: 1.5-3.5s (Barretenberg WASM + Secrets Manager fetch). Warm: ~50-100ms. Bimodal latency distribution. Provisioned concurrency mitigates but doesn't eliminate (scales slowly under burst). |

**Analysis:** Latency predictability matters for downstream systems waiting on authwit responses. Bimodal distributions (fast warm, slow cold) are harder to plan around than consistent latency. Option A's always-warm model gives the most predictable p99.

### 5. Migration Complexity

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 5/5 | Add `@aws-sdk/client-secrets-manager`. Modify `loadConfig()` to fetch from Secrets Manager when `SP_KEY_SECRET_ID` is set. Add BN254 range validation. No new services, no new interfaces, no factory pattern. **~2-3 days.** |
| B | 1/5 | EC2 infrastructure. Enclave image build pipeline (Docker → EIF). vsock communication layer. Attestation-based KMS policy. Completely new deployment model. ~4-6 weeks. |
| C | 2/5 | New Lambda function (bundling Barretenberg WASM, esbuild pipeline, deployment). New interfaces (`ISecretGenerator`, `IAuthwitGenerator`). Factory pattern in `server.ts`. New `SIGNER_MODE` config. Lambda client implementations. ~1-2 weeks. |

**Analysis:** This is the most decisive differentiator. Option C requires building and maintaining a separate signing service. Option B requires a fundamentally different infrastructure model. Option A requires changing ~50 lines of config code.

### 6. Operational Overhead

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 5/5 | One service to monitor — the same agent that exists today. Standard ECS/Fargate monitoring. No new operational concepts. |
| B | 1/5 | EC2 instance management. Enclave image versioning. Enclave health monitoring. vsock debugging is opaque. Enclave crashes require EC2-level investigation. |
| C | 2/5 | Two services to monitor (agent + Lambda). Lambda-specific monitoring (cold starts, throttles, concurrent executions). Separate deployment pipeline for the Lambda. WASM binary versioning. |

### 7. Cost at Scale

Estimated monthly cost at three volume tiers:

| Option | Low (1M req/mo) | Medium (50M req/mo) | High (500M req/mo) |
|--------|-----------------|--------------------|--------------------|
| A | ~$20 (Fargate + SM) | ~$30 (Fargate + SM) | ~$60 (more tasks) |
| B | ~$220 (EC2 minimum) | ~$220 (same instance) | ~$440+ (multiple instances) |
| C | ~$6 (Lambda + SM) | ~$45 (Lambda + SM + concurrency) | ~$420 (Lambda dominates) |

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 4/5 | Moderate floor, flat scaling. Most cost-efficient at medium-to-high volume. |
| B | 1/5 | High floor cost (~$200+/mo for the EC2 enclave instance) even at zero traffic. |
| C | 3/5 | Cheap at low volume, expensive at scale due to per-invocation pricing. |

### 8. Key Ceremony Compatibility

How well does each option support the safe key generation ceremony (BN254 validation, no human access to private key, public-key-only deployment)?

| Option | Score | Rationale |
|--------|-------|-----------|
| A | 4/5 | Ceremony stores in SM, agent reads from SM. Clean separation. |
| B | 5/5 | Strongest: attestation ensures only verified code can access the key. Even a compromised ceremony is mitigated if the enclave is the only thing that can decrypt. |
| C | 4/5 | Key stored in Secrets Manager. Ceremony outputs to SM. Lambda reads from SM. Clean separation. |

---

## Final Ranking

### Weighted Scores

| Criterion | Weight | A | B | C |
|-----------|--------|---|---|---|
| Key-at-rest security | 3x | 4 (12) | 5 (15) | 4 (12) |
| Runtime key exposure | 2x | 2 (4) | 5 (10) | 3 (6) |
| Throughput under load | 3x | 5 (15) | 3 (9) | 2 (6) |
| Latency predictability | 3x | 5 (15) | 3 (9) | 2 (6) |
| Migration complexity | 3x | 5 (15) | 1 (3) | 2 (6) |
| Operational overhead | 2x | 5 (10) | 1 (2) | 2 (4) |
| Cost at scale | 2x | 4 (8) | 1 (2) | 3 (6) |
| Key ceremony compatibility | 2x | 4 (8) | 5 (10) | 4 (8) |
| **TOTAL** | | **87** | **60** | **54** |

### Rankings

```
#1  Option A: Secrets Manager + ECS/Fargate  ████████████████████  87/100
#2  Option B: Nitro Enclaves                 ████████████         60/100
#3  Option C: Secrets Manager + Lambda        ███████████          54/100
```

---

## Ranking Justification

### #1 — Option A: Secrets Manager + ECS/Fargate (87/100)

**Why it wins:** It delivers the same key-at-rest security improvement as Option C (the real win: no plaintext env var) with a fraction of the complexity. At high volume, it has better latency, better throughput, lower cost, and fewer moving parts than Lambda-based approaches. The migration is ~2-3 days vs. 1-2 weeks.

**The honest framing:** Option A doesn't improve runtime security over the current architecture — the key still lives in process memory. But neither does Option C under sustained load (warm Lambda instances hold the key for hours too). The genuine security improvement in Options A and C is identical: encrypted at rest, IAM-scoped, CloudTrail-audited. Option A achieves this with the least disruption.

**When to NOT pick A:** If the threat model specifically requires protecting the key from a compromised host OS or container runtime (e.g., state-level attackers with access to the ECS host). In that case, skip to Option B.

### #2 — Option B: Nitro Enclaves (60/100)

**Why it's second:** It's the only option that provides genuinely stronger runtime isolation. The key exists only inside an enclave — no shell, no network, no memory access from the host. Attestation-based key release ensures even a compromised IAM role can't access the key outside the enclave. This is a real, meaningful security upgrade that the other options cannot match.

**Why it's not first:** The operational cost is prohibitive for the current phase. $200+/month minimum (EC2 enclave instance), 4-6 week migration, EC2 management (not serverless/containerized), enclave image build pipeline, vsock debugging. It's the right answer for a later phase when the system is mature and the threat model demands hardware-grade isolation.

**The upgrade path:** Option A → Option B is clean. The agent's `loadConfig()` already fetches the key from Secrets Manager. Moving the signing into an enclave means the agent calls the enclave via vsock instead of signing in-process. The config layer stays the same.

### #3 — Option C: Secrets Manager + Lambda (54/100)

**Why it's last:** It was the original recommendation (v1.0) but its advantages don't hold up under the updated constraints:

- **"Short-lived key exposure"** — True at low volume, false at high volume. Under sustained load, Lambda instances are as long-lived as any server.
- **Complexity penalty** — Requires a separate Lambda function (with Barretenberg WASM bundling), new TypeScript interfaces, a factory pattern, a `SIGNER_MODE` toggle, and a separate deployment pipeline. This is 5-10x the code change of Option A for the same security outcome.
- **Cold start latency** — 1.5-3.5s cold starts from Barretenberg WASM init. Provisioned concurrency mitigates but adds cost and still doesn't handle burst traffic well.
- **Throughput ceiling** — One request per Lambda instance, burst concurrency limits, scaling at 500 instances/min. Not suitable for "a TON of requests."

**When Option C makes sense:** Low-volume, bursty workloads where the agent is idle most of the time and cost matters more than latency. In that scenario, Lambda's pay-per-invocation model is genuinely cheaper, and the short-lived execution environments do provide a security benefit (key in memory for minutes, not hours).

---

## Recommendation

**Implement Option A now. Plan Option B as a future upgrade if the threat model evolves.**

Option A gives us:
- Key encrypted at rest (Secrets Manager + KMS CMK)
- IAM-scoped access (only the agent's task role can read the key)
- CloudTrail audit trail (every key access is logged)
- BN254-safe key generation ceremony (no human sees the private key)
- Public-key-only account contract deployment (deployer never handles the private key)
- No cold starts, predictable latency, horizontal scaling
- 2-3 day migration, minimal code change

The only thing it doesn't give us that Option B would: hardware-grade isolation of the key at runtime. That's a real gap, but it's the same gap that exists today, and it's the same gap that Lambda (Option C) has under sustained load. If we need to close it later, the A→B upgrade path is straightforward.

---

## Decision Matrix (Quick Reference)

| If your priority is... | Choose | Because |
|------------------------|--------|---------|
| Fastest time to production | **A** | 2-3 days, minimal code change |
| Best security per dollar | **A** | Same key-at-rest protection as C, 1/10th the complexity |
| Handling high throughput | **A** | No cold starts, no concurrency limits, horizontal scaling |
| Maximum key isolation (state-level threats) | **B** | Only option where key is hardware-isolated at runtime |
| Low-volume, cost-minimized | **C** | Pay-per-invocation is cheapest when idle most of the time |
