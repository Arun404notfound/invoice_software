export interface RsaSigner {
  /** DER-encoded X.509 certificate for the signing key. */
  getCertificateDer(): Promise<Buffer>;
  /** DER-encoded intermediate/root certs, if available (chain-building). */
  getExtraCertificatesDer(): Promise<Buffer[]>;
  /**
   * RSASSA-PKCS1-v1_5 signs SHA-256(data) and returns the raw signature
   * bytes. `data` is raw bytes, not a pre-hashed digest -- the hash happens
   * inside this call (combined mechanism), matching what CMS needs.
   */
  sign(data: Buffer): Promise<Buffer>;
  /** Human-readable info for the API response / UI, e.g. "CN=Jane Doe". */
  describe(): Promise<{ subject: string }>;
}
