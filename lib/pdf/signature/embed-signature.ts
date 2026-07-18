import "server-only";

/**
 * Splices a raw CMS/PKCS#7 detached signature (as returned by the local DSC
 * signer bridge) into the `gapPdf` buffer produced by `preparePlaceholder`,
 * mirroring the tail end of @signpdf/signpdf's `SignPdf.sign()`.
 */
export function embedSignature(
  gapPdf: Buffer,
  contentsInsertOffset: number,
  placeholderHexLength: number,
  rawSignature: Buffer,
): Buffer {
  if (rawSignature.length * 2 > placeholderHexLength) {
    throw new Error(
      `Signature exceeds reserved placeholder: ${rawSignature.length * 2} > ${placeholderHexLength} hex chars`,
    );
  }

  let signatureHex = rawSignature.toString("hex");
  signatureHex += Buffer.alloc(
    placeholderHexLength / 2 - rawSignature.length,
  ).toString("hex");

  return Buffer.concat([
    gapPdf.subarray(0, contentsInsertOffset),
    Buffer.from(`<${signatureHex}>`),
    gapPdf.subarray(contentsInsertOffset),
  ]);
}
