import * as asn1js from "asn1js";
import {
  Attribute,
  Certificate,
  ContentInfo,
  EncapsulatedContentInfo,
  AlgorithmIdentifier,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
} from "pkijs";

const OID_CONTENT_TYPE = "1.2.840.113549.1.9.3";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_RSA_ENCRYPTION = "1.2.840.113549.1.1.1";

export interface BuildCmsParams {
  /** SHA-256 digest of the PDF's ByteRange content (the `gapPdf` buffer). */
  messageDigest: Buffer;
  signingTime: Date;
  /** DER-encoded X.509 certificate of the signer (from the token). */
  certificateDer: Buffer;
  /** DER-encoded intermediate/root certs, if the token exposes the chain. */
  extraCertificatesDer?: Buffer[];
  /**
   * Performs the actual RSA operation: RSASSA-PKCS1-v1_5 signing of
   * SHA-256(data). `data` is the DER encoding of signedAttrs (already
   * re-tagged as a universal SET per RFC 5652 §5.4) -- NOT a pre-hashed
   * digest, since PKCS#11's combined CKM_SHA256_RSA_PKCS mechanism (and
   * Node's `crypto.sign`) hash internally.
   */
  sign: (data: Buffer) => Promise<Buffer>;
}

/**
 * Builds a detached CMS/PKCS#7 SignedData blob (PAdES-BES / adbe.pkcs7.detached)
 * suitable for embedding directly into a PDF's `/Contents` signature field.
 *
 * The signedAttrs-retagging trick below mirrors pkijs's own
 * `SignedData.prototype.sign()` implementation exactly (see node_modules/pkijs
 * SignedData.sign: it computes `signedAttrs.toSchema().toBER()` then
 * overwrites byte 0 from 0xA0 to 0x31 before hashing/signing) -- reusing that
 * logic here instead of pkijs's higher-level `sign()` because that method
 * expects a WebCrypto-shaped key, and our private key lives on a PKCS#11
 * token that can't be wrapped as one.
 */
export async function buildDetachedCms({
  messageDigest,
  signingTime,
  certificateDer,
  extraCertificatesDer = [],
  sign,
}: BuildCmsParams): Promise<Buffer> {
  const cert = Certificate.fromBER(toArrayBuffer(certificateDer));
  const extraCerts = extraCertificatesDer.map((der) =>
    Certificate.fromBER(toArrayBuffer(der)),
  );

  const signedAttrs = new SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new Attribute({
        type: OID_CONTENT_TYPE,
        values: [new asn1js.ObjectIdentifier({ value: ContentInfo.DATA })],
      }),
      new Attribute({
        type: OID_SIGNING_TIME,
        values: [new asn1js.UTCTime({ valueDate: signingTime })],
      }),
      new Attribute({
        type: OID_MESSAGE_DIGEST,
        values: [
          new asn1js.OctetString({ valueHex: toArrayBuffer(messageDigest) }),
        ],
      }),
    ],
  });

  const attrsBer = signedAttrs.toSchema().toBER(false);
  const dataToSign = Buffer.from(attrsBer);
  dataToSign[0] = 0x31; // [0] IMPLICIT -> universal SET, per RFC 5652 §5.4

  const signatureValue = await sign(dataToSign);

  const signerInfo = new SignerInfo({
    version: 1,
    sid: new IssuerAndSerialNumber({
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
    }),
    digestAlgorithm: new AlgorithmIdentifier({
      algorithmId: OID_SHA256,
      algorithmParams: new asn1js.Null(),
    }),
    signedAttrs,
    signatureAlgorithm: new AlgorithmIdentifier({
      algorithmId: OID_RSA_ENCRYPTION,
      algorithmParams: new asn1js.Null(),
    }),
    signature: new asn1js.OctetString({
      valueHex: toArrayBuffer(signatureValue),
    }),
  });

  const signedData = new SignedData({
    version: 1,
    digestAlgorithms: [
      new AlgorithmIdentifier({
        algorithmId: OID_SHA256,
        algorithmParams: new asn1js.Null(),
      }),
    ],
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: ContentInfo.DATA,
    }),
    certificates: [cert, ...extraCerts],
    signerInfos: [signerInfo],
  });

  const contentInfo = new ContentInfo({
    contentType: ContentInfo.SIGNED_DATA,
    content: signedData.toSchema(),
  });

  return Buffer.from(contentInfo.toSchema().toBER(false));
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}
