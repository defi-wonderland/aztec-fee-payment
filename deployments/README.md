# Deployment Records

This directory contains deployment records for the Metered contract across different networks.

## Structure

- `devnet/` - Devnet deployment records
- `testnet/` - Testnet deployment records  
- `local-network/` - Local network deployment records

## Deployment Files

Deployment files are automatically generated with timestamps in the format:
`deployment-YYYY-MM-DD-HHMMSS.json`

Each deployment file contains:
- Contract address
- Salt used for deployment
- Deployer address
- Constructor artifact name
- Network information

## FeeJuice and Account Deployment

For information about how account deployment is sponsored and how to fund accounts with FeeJuice on devnet/testnet, see [FEEJUICE.md](./FEEJUICE.md).
