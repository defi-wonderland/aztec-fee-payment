use dep::aztec::protocol_types::traits::Packable;

/// ECDSA secp256k1 public key.
/// Stores the X and Y coordinates as 32-byte arrays.
#[derive(Eq)]
pub struct EcdsaPublicKey {
    pub x: [u8; 32],
    pub y: [u8; 32],
}

// Packable implementation: 4 Fields (2 per coordinate, each holding 16 bytes / 128 bits)
impl Packable for EcdsaPublicKey {
    let N: u32 = 4;

    fn pack(self) -> [Field; Self::N] {
        [
            pack_bytes(self.x, 0),
            pack_bytes(self.x, 16),
            pack_bytes(self.y, 0),
            pack_bytes(self.y, 16),
        ]
    }

    fn unpack(fields: [Field; Self::N]) -> Self {
        let mut x: [u8; 32] = [0; 32];
        let mut y: [u8; 32] = [0; 32];

        unpack_bytes(fields[0], &mut x, 0);
        unpack_bytes(fields[1], &mut x, 16);
        unpack_bytes(fields[2], &mut y, 0);
        unpack_bytes(fields[3], &mut y, 16);

        Self { x, y }
    }
}

/// Packs 16 bytes (big-endian) from the given offset into a Field.
fn pack_bytes(bytes: [u8; 32], offset: u32) -> Field {
    let mut result: Field = 0;
    for i in 0..16 {
        result = result * 256 + bytes[offset + i] as Field;
    }
    result
}

/// Unpacks a Field into 16 bytes (big-endian) at the given offset.
fn unpack_bytes(value: Field, bytes: &mut [u8; 32], offset: u32) {
    let mut v: u128 = value as u128;
    for i in 0..16 {
        bytes[offset + 15 - i] = (v % 256) as u8;
        v = v / 256;
    }
}
