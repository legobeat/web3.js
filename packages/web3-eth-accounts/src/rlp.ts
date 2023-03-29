/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
// eslint-disable-next-line @typescript-eslint/ban-types
export type Input = string | number | bigint | Uint8Array | Array<Input> | null | undefined;

export type NestedUint8Array = Array<Uint8Array | NestedUint8Array>;
// Global symbols in both browsers and Node.js since v11
// See https://github.com/microsoft/TypeScript/issues/31535
declare const TextEncoder: any;
declare const TextDecoder: any;
export interface Decoded {
	data: Uint8Array | NestedUint8Array;
	remainder: Uint8Array;
}
/** Transform an integer into its hexadecimal value */
function numberToHex(integer: number | bigint): string {
	if (integer < 0) {
		throw new Error('Invalid integer as argument, must be unsigned!');
	}
	const hex = integer.toString(16);
	return hex.length % 2 ? `0${hex}` : hex;
}
function parseHexByte(hexByte: string): number {
	const byte = Number.parseInt(hexByte, 16);
	if (Number.isNaN(byte)) throw new Error('Invalid byte sequence');
	return byte;
}
function hexToBytes(hex: string): Uint8Array {
	if (typeof hex !== 'string') {
		throw new TypeError(`hexToBytes: expected string, got ${typeof hex}`);
	}
	if (hex.length % 2) throw new Error('hexToBytes: received invalid unpadded hex');
	const array = new Uint8Array(hex.length / 2);
	for (let i = 0; i < array.length; i += 1) {
		const j = i * 2;
		array[i] = parseHexByte(hex.slice(j, j + 2));
	}
	return array;
}
function encodeLength(len: number, offset: number): Uint8Array {
	if (len < 56) {
		return Uint8Array.from([len + offset]);
	}
	const hexLength = numberToHex(len);
	const lLength = hexLength.length / 2;
	const firstByte = numberToHex(offset + 55 + lLength);
	return Uint8Array.from(hexToBytes(firstByte + hexLength));
}
/** Concatenates two Uint8Arrays into one. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
	if (arrays.length === 1) return arrays[0];
	const length = arrays.reduce((a, arr) => a + arr.length, 0);
	const result = new Uint8Array(length);
	for (let i = 0, pad = 0; i < arrays.length; i += 1) {
		const arr = arrays[i];
		result.set(arr, pad);
		pad += arr.length;
	}
	return result;
}
function utf8ToBytes(utf: string): Uint8Array {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
	return new TextEncoder().encode(utf);
}

/** Pad a string to be even */
function padToEven(a: string): string {
	return a.length % 2 ? `0${a}` : a;
}

/** Check if a string is prefixed by 0x */
function isHexPrefixed(str: string): boolean {
	return str.length >= 2 && str.startsWith('0') && str[1] === 'x';
}

/** Removes 0x from a given String */
function stripHexPrefix(str: string): string {
	if (typeof str !== 'string') {
		return str;
	}
	return isHexPrefixed(str) ? str.slice(2) : str;
}

/** Transform anything into a Uint8Array */
function toBytes(v: Input): Uint8Array {
	if (v instanceof Uint8Array) {
		return v;
	}
	if (typeof v === 'string') {
		if (isHexPrefixed(v)) {
			return hexToBytes(padToEven(stripHexPrefix(v)));
		}
		return utf8ToBytes(v);
	}
	if (typeof v === 'number' || typeof v === 'bigint') {
		if (!v) {
			return Uint8Array.from([]);
		}
		return hexToBytes(numberToHex(v));
	}
	// eslint-disable-next-line no-null/no-null
	if (v === null || v === undefined) {
		return Uint8Array.from([]);
	}
	throw new Error(`toBytes: received unsupported type ${typeof v}`);
}
/**
 * RLP Encoding based on https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 * This function takes in data, converts it to Uint8Array if not,
 * and adds a length for recursion.
 * @param input Will be converted to Uint8Array
 * @returns Uint8Array of encoded data
 * */
export function encode(input: Input): Uint8Array {
	if (Array.isArray(input)) {
		const output: Uint8Array[] = [];
		let outputLength = 0;
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < input.length; i += 1) {
			const encoded = encode(input[i]);
			output.push(encoded);
			outputLength += encoded.length;
		}
		return concatBytes(encodeLength(outputLength, 192), ...output);
	}
	const inputBuf = toBytes(input);
	if (inputBuf.length === 1 && inputBuf[0] < 128) {
		return inputBuf;
	}
	return concatBytes(encodeLength(inputBuf.length, 128), inputBuf);
}

/**
 * Slices a Uint8Array, throws if the slice goes out-of-bounds of the Uint8Array.
 * E.g. `safeSlice(hexToBytes('aa'), 1, 2)` will throw.
 * @param input
 * @param start
 * @param end
 */
function safeSlice(input: Uint8Array, start: number, end: number) {
	if (end > input.length) {
		throw new Error('invalid RLP (safeSlice): end slice of Uint8Array out-of-bounds');
	}
	return input.slice(start, end);
}

const cachedHexes = Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0'));
function bytesToHex(uint8a: Uint8Array): string {
	// Pre-caching chars with `cachedHexes` speeds this up 6x
	let hex = '';
	// eslint-disable-next-line @typescript-eslint/prefer-for-of
	for (let i = 0; i < uint8a.length; i += 1) {
		hex += cachedHexes[uint8a[i]];
	}
	return hex;
}
/**
 * Parse integers. Check if there is no leading zeros
 * @param v The value to parse
 */
function decodeLength(v: Uint8Array): number {
	if (v[0] === 0) {
		throw new Error('invalid RLP: extra zeros');
	}
	return parseHexByte(bytesToHex(v));
}

/**
 * RLP Decoding based on https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 * @param input Will be converted to Uint8Array
 * @param stream Is the input a stream (false by default)
 * @returns decoded Array of Uint8Arrays containing the original message
 * */
export function decode(input: Input, stream?: false): Uint8Array | NestedUint8Array;
export function decode(input: Input, stream?: true): Decoded;
export function decode(input: Input, stream = false): Uint8Array | NestedUint8Array | Decoded {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,  @typescript-eslint/no-unsafe-member-access, no-null/no-null
	if (typeof input === 'undefined' || input === null || (input as any).length === 0) {
		return Uint8Array.from([]);
	}

	// eslint-disable-next-line no-use-before-define
	const inputBytes = toBytes(input);
	// eslint-disable-next-line no-use-before-define
	const decoded = _decode(inputBytes);

	if (stream) {
		return decoded;
	}
	if (decoded.remainder.length !== 0) {
		throw new Error('invalid RLP: remainder must be zero');
	}

	return decoded.data;
}

/** Decode an input with RLP */
function _decode(input: Uint8Array): Decoded {
	let length: number;
	let llength: number;
	let data: Uint8Array;
	let innerRemainder: Uint8Array;
	let d: Decoded;
	const decoded = [];
	const firstByte = input[0];

	if (firstByte <= 0x7f) {
		// a single byte whose value is in the [0x00, 0x7f] range, that byte is its own RLP encoding.
		return {
			data: input.slice(0, 1),
			remainder: input.slice(1),
		};
	}
	if (firstByte <= 0xb7) {
		// string is 0-55 bytes long. A single byte with value 0x80 plus the length of the string followed by the string
		// The range of the first byte is [0x80, 0xb7]
		length = firstByte - 0x7f;

		// set 0x80 null to 0
		if (firstByte === 0x80) {
			data = Uint8Array.from([]);
		} else {
			data = safeSlice(input, 1, length);
		}

		if (length === 2 && data[0] < 0x80) {
			throw new Error(
				'invalid RLP encoding: invalid prefix, single byte < 0x80 are not prefixed',
			);
		}

		return {
			data,
			remainder: input.slice(length),
		};
	}
	if (firstByte <= 0xbf) {
		// string is greater than 55 bytes long. A single byte with the value (0xb7 plus the length of the length),
		// followed by the length, followed by the string
		llength = firstByte - 0xb6;
		if (input.length - 1 < llength) {
			throw new Error('invalid RLP: not enough bytes for string length');
		}
		length = decodeLength(safeSlice(input, 1, llength));
		if (length <= 55) {
			throw new Error('invalid RLP: expected string length to be greater than 55');
		}
		data = safeSlice(input, llength, length + llength);

		return {
			data,
			remainder: input.slice(length + llength),
		};
	}
	if (firstByte <= 0xf7) {
		// a list between 0-55 bytes long
		length = firstByte - 0xbf;
		innerRemainder = safeSlice(input, 1, length);
		while (innerRemainder.length) {
			d = _decode(innerRemainder);
			decoded.push(d.data);
			innerRemainder = d.remainder;
		}

		return {
			data: decoded,
			remainder: input.slice(length),
		};
	}
	// a list over 55 bytes long
	llength = firstByte - 0xf6;
	length = decodeLength(safeSlice(input, 1, llength));
	if (length < 56) {
		throw new Error('invalid RLP: encoded list too short');
	}
	const totalLength = llength + length;
	if (totalLength > input.length) {
		throw new Error('invalid RLP: total length is larger than the data');
	}

	innerRemainder = safeSlice(input, llength, totalLength);

	while (innerRemainder.length) {
		d = _decode(innerRemainder);
		decoded.push(d.data);
		innerRemainder = d.remainder;
	}

	return {
		data: decoded,
		remainder: input.slice(totalLength),
	};
}

export const utils = {
	bytesToHex,
	concatBytes,
	hexToBytes,
	utf8ToBytes,
};

export const RLP = { encode, decode };