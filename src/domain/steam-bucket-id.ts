export interface DecodedBucketId {
  defIndex?: number;
  paintKit?: number;
  quality?: number;
  musicKitId?: number;
}

function readVarint(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let shift = 0;
  let index = start;
  while (index < bytes.length && shift <= 49) {
    const byte = bytes[index];
    if (byte === undefined) break;
    index += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, index];
    shift += 7;
  }
  throw new Error("Truncated or oversized protobuf varint");
}

function skipField(bytes: Uint8Array, index: number, wireType: number): number {
  if (wireType === 0) return readVarint(bytes, index)[1];
  if (wireType === 1) {
    if (index + 8 > bytes.length) throw new Error("Truncated fixed64 field");
    return index + 8;
  }
  if (wireType === 2) {
    const [length, afterLength] = readVarint(bytes, index);
    const end = afterLength + length;
    if (end > bytes.length) throw new Error("Truncated length-delimited field");
    return end;
  }
  if (wireType === 5) {
    if (index + 4 > bytes.length) throw new Error("Truncated fixed32 field");
    return index + 4;
  }
  throw new Error(`Unsupported protobuf wire type ${wireType}`);
}

export function decodeBucketId(bucketId: string): DecodedBucketId {
  if (!/^G(?:[0-9a-fA-F]{2})+$/.test(bucketId)) {
    throw new Error("Bucket ID must be G followed by whole hexadecimal bytes");
  }

  const hex = bucketId.slice(1);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }

  const decoded: DecodedBucketId = {};
  let index = 0;
  while (index < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, index);
    index = afterTag;
    const fieldNumber = Math.floor(tag / 8);
    const wireType = tag & 7;
    if (fieldNumber === 0) throw new Error("Invalid protobuf field number 0");

    if (wireType === 0 && [3, 4, 6, 17].includes(fieldNumber)) {
      const [value, afterValue] = readVarint(bytes, index);
      index = afterValue;
      if (fieldNumber === 3) decoded.defIndex = value;
      if (fieldNumber === 4) decoded.paintKit = value;
      if (fieldNumber === 6) decoded.quality = value;
      if (fieldNumber === 17) decoded.musicKitId = value;
    } else {
      index = skipField(bytes, index, wireType);
    }
  }

  if (decoded.defIndex === undefined) {
    throw new Error("Bucket ID is missing def_index");
  }
  return decoded;
}
