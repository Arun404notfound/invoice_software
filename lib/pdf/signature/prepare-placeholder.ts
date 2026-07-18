import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import {
  findByteRange,
  removeTrailingNewLine,
  convertBuffer,
} from "@signpdf/utils";

// Raw signature bytes reserved in the PDF for the CMS/PKCS#7 blob. A
// Watchdata Class-3 chain (leaf + intermediate + root, RSA-2048) typically
// runs a few KB; this leaves generous headroom.
const SIGNATURE_MAX_BYTES = 16384;

export interface PlaceholderInfo {
  /**
   * The PDF with `/ByteRange` filled in and the signature placeholder bytes
   * entirely removed -- i.e. exactly the buffer @signpdf/signpdf's `sign()`
   * would pass to a `Signer`. `contentsInsertOffset` is where the signature
   * hex needs to be spliced back in to produce the final signed PDF.
   */
  gapPdf: Buffer;
  contentsInsertOffset: number;
  placeholderHexLength: number;
  digest: Buffer;
  signingTime: Date;
}

export interface PlaceholderMeta {
  reason: string;
  contactInfo: string;
  name: string;
  location: string;
}

/**
 * Adds an empty digital-signature placeholder to a generated invoice PDF and
 * computes the SHA-256 digest that a signer needs to sign. Mirrors the byte
 * range algorithm in @signpdf/signpdf's `SignPdf.sign()`, split in two so the
 * actual signing (on the DSC holder's machine) can happen between this call
 * and `embedSignature`.
 */
export async function preparePlaceholder(
  pdfBytes: Buffer,
  meta: PlaceholderMeta,
): Promise<PlaceholderInfo> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const signingTime = new Date();

  pdflibAddPlaceholder({
    pdfDoc,
    reason: meta.reason,
    contactInfo: meta.contactInfo,
    name: meta.name,
    location: meta.location,
    signingTime,
    signatureLength: SIGNATURE_MAX_BYTES,
  });

  const placeholderPdf = Buffer.from(
    await pdfDoc.save({ useObjectStreams: false }),
  );

  let pdf = removeTrailingNewLine(convertBuffer(placeholderPdf, "PDF"));
  const { byteRangePlaceholder, byteRangePlaceholderPosition } =
    findByteRange(pdf);
  if (!byteRangePlaceholder || byteRangePlaceholderPosition === undefined) {
    throw new Error("No ByteRange placeholder found in generated PDF");
  }

  const byteRangeEnd =
    byteRangePlaceholderPosition + byteRangePlaceholder.length;
  const contentsTagPos = pdf.indexOf("/Contents ", byteRangeEnd);
  const placeholderPos = pdf.indexOf("<", contentsTagPos);
  const placeholderEnd = pdf.indexOf(">", placeholderPos);
  const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
  const placeholderHexLength = placeholderLengthWithBrackets - 2;

  const byteRange = [0, 0, 0, 0];
  byteRange[1] = placeholderPos;
  byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
  byteRange[3] = pdf.length - byteRange[2];

  let actualByteRange = `/ByteRange [${byteRange.join(" ")}]`;
  actualByteRange += " ".repeat(
    byteRangePlaceholder.length - actualByteRange.length,
  );

  pdf = Buffer.concat([
    pdf.subarray(0, byteRangePlaceholderPosition),
    Buffer.from(actualByteRange),
    pdf.subarray(byteRangeEnd),
  ]);

  // Remove the placeholder signature bytes -- this "gap" buffer is what the
  // digest is computed over, and what the final signature gets spliced back
  // into at `byteRange[1]`.
  const gapPdf = Buffer.concat([
    pdf.subarray(0, byteRange[1]),
    pdf.subarray(byteRange[2], byteRange[2] + byteRange[3]),
  ]);

  const digest = createHash("sha256").update(gapPdf).digest();

  return {
    gapPdf,
    contentsInsertOffset: byteRange[1],
    placeholderHexLength,
    digest,
    signingTime,
  };
}
