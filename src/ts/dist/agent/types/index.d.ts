import { z } from "zod";
export type ErrorCode = "INVALID_REQUEST" | "INVALID_SIGNATURE" | "TX_NOT_FOUND" | "TX_REVERTED" | "TX_NOT_FINALIZED" | "WRONG_RECIPIENT" | "INVALID_AMOUNT" | "INVALID_CHAIN" | "RATE_LIMITED" | "INTERNAL_ERROR";
export interface AuthwitResponse {
    amount: string;
    secret: string;
    authwit: {
        innerHash: string;
        outerHash: string;
        witness: string[];
    };
}
export interface ErrorResponse {
    error: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
}
export declare const authwitRequestSchema: z.ZodObject<{
    evmTxHash: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
    evmChainId: z.ZodNumber;
    signature: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
}, "strip", z.ZodTypeAny, {
    evmTxHash: `0x${string}`;
    evmChainId: number;
    signature: `0x${string}`;
}, {
    evmTxHash: `0x${string}`;
    evmChainId: number;
    signature: `0x${string}`;
}>;
export declare const configSchema: z.ZodObject<{
    port: z.ZodDefault<z.ZodNumber>;
    host: z.ZodDefault<z.ZodString>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
    chains: z.ZodEffects<z.ZodRecord<z.ZodNumber, z.ZodObject<{
        name: z.ZodString;
        rpcUrl: z.ZodString;
        feeCollectorAddress: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
        aztTokenAddress: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
        requiredConfirmations: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations: number;
    }, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations?: number | undefined;
    }>>, Record<number, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations: number;
    }>, Record<number, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations?: number | undefined;
    }>>;
    spSigningKey: z.ZodType<`0x${string}`, z.ZodTypeDef, `0x${string}`>;
    minAmount: z.ZodDefault<z.ZodBigInt>;
    rateLimit: z.ZodDefault<z.ZodObject<{
        windowMs: z.ZodDefault<z.ZodNumber>;
        maxRequests: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        windowMs: number;
        maxRequests: number;
    }, {
        windowMs?: number | undefined;
        maxRequests?: number | undefined;
    }>>;
    aztec: z.ZodObject<{
        fpcAddress: z.ZodString;
        ownerAddress: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        fpcAddress: string;
        ownerAddress: string;
    }, {
        fpcAddress: string;
        ownerAddress: string;
    }>;
}, "strip", z.ZodTypeAny, {
    port: number;
    host: string;
    logLevel: "error" | "debug" | "info" | "warn";
    chains: Record<number, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations: number;
    }>;
    spSigningKey: `0x${string}`;
    minAmount: bigint;
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    aztec: {
        fpcAddress: string;
        ownerAddress: string;
    };
}, {
    chains: Record<number, {
        name: string;
        rpcUrl: string;
        feeCollectorAddress: `0x${string}`;
        aztTokenAddress: `0x${string}`;
        requiredConfirmations?: number | undefined;
    }>;
    spSigningKey: `0x${string}`;
    aztec: {
        fpcAddress: string;
        ownerAddress: string;
    };
    port?: number | undefined;
    host?: string | undefined;
    logLevel?: "error" | "debug" | "info" | "warn" | undefined;
    minAmount?: bigint | undefined;
    rateLimit?: {
        windowMs?: number | undefined;
        maxRequests?: number | undefined;
    } | undefined;
}>;
export type AuthwitRequestBody = z.infer<typeof authwitRequestSchema>;
export type ChainConfig = z.infer<typeof configSchema>["chains"][number];
export type AgentConfig = z.infer<typeof configSchema>;
//# sourceMappingURL=index.d.ts.map