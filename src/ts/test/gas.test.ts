import { describe, it, expect } from "vitest";
import { Gas, GasFees, GasSettings } from "@aztec/stdlib/gas";

import {
  DEFAULT_FEE_MULTIPLIER,
  maxGasCostFor,
  maxFeesPerGasFromBaseFees,
} from "../utils/gas.js";

describe("maxGasCostFor", () => {
  it("computes feePerDa * daGas + feePerL2 * l2Gas", () => {
    const maxFeesPerGas = new GasFees(3n, 5n);
    const gasLimits = Gas.from({ daGas: 1000, l2Gas: 2000 });

    // 3 * 1000 + 5 * 2000 = 13_000
    expect(maxGasCostFor(maxFeesPerGas, gasLimits)).toBe(13_000n);
  });

  it("matches GasSettings.getFeeLimit() — the protocol fee cap", () => {
    const maxFeesPerGas = new GasFees(7n, 11n);
    const gasLimits = Gas.from({ daGas: 5000, l2Gas: 10_000 });
    const teardownGasLimits = Gas.from({ daGas: 1000, l2Gas: 2000 });

    const settings = GasSettings.from({
      gasLimits,
      teardownGasLimits,
      maxFeesPerGas,
      maxPriorityFeesPerGas: GasFees.empty(),
    });

    // getFeeLimit() == maxFeesPerGas * gasLimits (teardown NOT included in protocol cap)
    expect(maxGasCostFor(maxFeesPerGas, gasLimits)).toBe(
      settings.getFeeLimit().toBigInt(),
    );
  });

  it("does NOT double-count teardown gas", () => {
    const maxFeesPerGas = new GasFees(2n, 4n);
    const gasLimits = Gas.from({ daGas: 1000, l2Gas: 2000 });
    const teardownGasLimits = Gas.from({ daGas: 500, l2Gas: 500 });

    const cost = maxGasCostFor(maxFeesPerGas, gasLimits);

    // Correct: 2*1000 + 4*2000 = 10_000
    expect(cost).toBe(10_000n);

    // Double-counting formula would give: 2*(1000+500) + 4*(2000+500) = 13_000
    const doubleCount =
      BigInt(maxFeesPerGas.feePerDaGas) *
        (BigInt(gasLimits.daGas) + BigInt(teardownGasLimits.daGas)) +
      BigInt(maxFeesPerGas.feePerL2Gas) *
        (BigInt(gasLimits.l2Gas) + BigInt(teardownGasLimits.l2Gas));

    expect(cost).not.toBe(doubleCount);
    expect(cost).toBeLessThan(doubleCount);
  });

  it("maxFeesPerGasFromBaseFees scales fees by a custom multiplier", () => {
    const da = 100n;
    const l2 = 200n;
    const multiplier = 5n;
    const fees = maxFeesPerGasFromBaseFees(
      { feePerDaGas: da, feePerL2Gas: l2 },
      multiplier,
    );
    expect(fees.feePerDaGas).toBe(da * multiplier);
    expect(fees.feePerL2Gas).toBe(l2 * multiplier);
  });

  it("maxFeesPerGasFromBaseFees uses DEFAULT_FEE_MULTIPLIER by default", () => {
    const da = 50n;
    const l2 = 80n;
    const fees = maxFeesPerGasFromBaseFees({
      feePerDaGas: da,
      feePerL2Gas: l2,
    });
    expect(fees.feePerDaGas).toBe(da * DEFAULT_FEE_MULTIPLIER);
    expect(fees.feePerL2Gas).toBe(l2 * DEFAULT_FEE_MULTIPLIER);
  });
});
