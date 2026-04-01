import { describe, expect, it, vi } from "vitest";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Gas, GasFees } from "@aztec/stdlib/gas";

import {
  DEFAULT_FEE_MULTIPLIER,
  estimateGasSettings,
  maxFeesPerGasFromBaseFees,
  maxPriorityFeesPerGasFromMaxFees,
} from "../utils/gas.js";

describe("gas utilities", () => {
  it("scales base fees by the default 6/5 multiplier with ceiling", () => {
    const fees = maxFeesPerGasFromBaseFees({
      feePerDaGas: 5n,
      feePerL2Gas: 6n,
    });

    expect(fees.feePerDaGas).toBe(6n);
    expect(fees.feePerL2Gas).toBe(8n);
    expect(DEFAULT_FEE_MULTIPLIER).toEqual({ numerator: 6n, denominator: 5n });
  });

  it("accepts explicit numeric multipliers for non-default cases", () => {
    const fees = maxFeesPerGasFromBaseFees(
      {
        feePerDaGas: 10n,
        feePerL2Gas: 20n,
      },
      1.5,
    );

    expect(fees.feePerDaGas).toBe(15n);
    expect(fees.feePerL2Gas).toBe(30n);
  });

  it("mirrors max fees into priority fees", () => {
    const maxFees = new GasFees(11n, 13n);
    const priorityFees = maxPriorityFeesPerGasFromMaxFees(maxFees);

    expect(priorityFees).not.toBe(maxFees);
    expect(priorityFees.feePerDaGas).toBe(11n);
    expect(priorityFees.feePerL2Gas).toBe(13n);
  });

  it("estimates gas settings from simulation metadata", async () => {
    const from = AztecAddress.random();
    const paymentMethod = {
      getAsset: vi.fn(),
      getFeePayer: vi.fn(),
      getExecutionPayload: vi.fn(),
      getGasSettings: vi.fn(),
    };
    const simulatedGasLimits = Gas.from({ daGas: 123n, l2Gas: 456n });
    const simulatedTeardownGasLimits = Gas.from({ daGas: 7n, l2Gas: 8n });
    const interaction = {
      simulate: vi.fn().mockResolvedValue({
        estimatedGas: {
          gasLimits: simulatedGasLimits,
          teardownGasLimits: simulatedTeardownGasLimits,
        },
      }),
    };
    const aztecNode = {
      getCurrentMinFees: vi.fn().mockResolvedValue(new GasFees(10n, 20n)),
    };

    const gasSettings = await estimateGasSettings(interaction, {
      aztecNode,
      from,
      paymentMethod,
      additionalScopes: [AztecAddress.random()],
    });

    expect(aztecNode.getCurrentMinFees).toHaveBeenCalledOnce();
    expect(interaction.simulate).toHaveBeenCalledOnce();
    expect(interaction.simulate).toHaveBeenCalledWith({
      from,
      additionalScopes: expect.any(Array),
      includeMetadata: true,
      fee: {
        paymentMethod,
        estimatedGasPadding: 0.1,
        gasSettings: {
          gasLimits: expect.any(Gas),
          teardownGasLimits: expect.any(Gas),
          maxFeesPerGas: expect.objectContaining({
            feePerDaGas: 12n,
            feePerL2Gas: 24n,
          }),
          maxPriorityFeesPerGas: expect.objectContaining({
            feePerDaGas: 12n,
            feePerL2Gas: 24n,
          }),
        },
      },
    });
    expect(gasSettings.gasLimits).toBe(simulatedGasLimits);
    expect(gasSettings.teardownGasLimits).toBe(simulatedTeardownGasLimits);
    expect(gasSettings.maxFeesPerGas.feePerDaGas).toBe(12n);
    expect(gasSettings.maxFeesPerGas.feePerL2Gas).toBe(24n);
    expect(gasSettings.maxPriorityFeesPerGas.feePerDaGas).toBe(12n);
    expect(gasSettings.maxPriorityFeesPerGas.feePerL2Gas).toBe(24n);
  });
});
