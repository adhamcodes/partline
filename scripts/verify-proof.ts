import { loadSanitizedProof } from '../src/proof.js';

const { proof, integrity } = await loadSanitizedProof();
console.log(JSON.stringify({
  result: 'PASS',
  proofId: proof.proofId,
  filesVerified: integrity.files.length,
  algorithm: integrity.algorithm,
  canonicalization: integrity.canonicalization,
  bundleSha256: integrity.bundleSha256,
  callCount: proof.callCount,
  redialCount: proof.redialCount,
  supportedFields: proof.coverage.supported,
  requiredFields: proof.coverage.required,
  unknownFields: proof.coverage.unknown,
  consequentialAction: proof.purchaseOrReservation,
}));
