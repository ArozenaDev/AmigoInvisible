import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HASH_ALGORITHM = 'scrypt';
const HASH_VERSION = 'v1';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

/**
 * Produces a portable, versioned scrypt hash. It is deliberately a server-only
 * utility: callers must put its result in a private environment variable or
 * a private group record, never in source code.
 */
export function hashPassword(password: string): string {
	assertPasswordInput(password);
	const salt = randomBytes(SALT_BYTES);
	const derivedKey = deriveKey(password, salt);

	return [
		HASH_ALGORITHM,
		HASH_VERSION,
		SCRYPT_COST,
		SCRYPT_BLOCK_SIZE,
		SCRYPT_PARALLELIZATION,
		salt.toString('base64url'),
		derivedKey.toString('base64url'),
	].join('$');
}

/**
 * Verifies a password without ever retaining or returning it. Invalid hash
 * formats fail closed instead of falling back to an unsafe comparison.
 */
export function verifyPassword(password: string, encodedHash: string): boolean {
	try {
		assertPasswordInput(password);
		const parsed = parseHash(encodedHash);
		const derivedKey = deriveKey(password, parsed.salt, parsed.cost, parsed.blockSize, parsed.parallelization);

		return derivedKey.length === parsed.hash.length && timingSafeEqual(derivedKey, parsed.hash);
	} catch {
		return false;
	}
}

/** Hashes a short participant PIN together with a server-only pepper. */
export function hashParticipantPin(pin: string, serverPepper: string): string {
	assertParticipantPin(pin);
	return hashPassword(`${serverPepper}:${pin}`);
}

export function verifyParticipantPin(pin: string, encodedHash: string, serverPepper: string): boolean {
	try {
		assertParticipantPin(pin);
		return verifyPassword(`${serverPepper}:${pin}`, encodedHash);
	} catch {
		return false;
	}
}

interface ParsedHash {
	blockSize: number;
	cost: number;
	hash: Buffer;
	parallelization: number;
	salt: Buffer;
}

function parseHash(encodedHash: string): ParsedHash {
	const [algorithm, version, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] = encodedHash.split('$');
	if (
		algorithm !== HASH_ALGORITHM ||
		version !== HASH_VERSION ||
		!costValue ||
		!blockSizeValue ||
		!parallelizationValue ||
		!saltValue ||
		!hashValue
	) {
		throw new Error('Formato de hash no compatible.');
	}

	const cost = Number(costValue);
	const blockSize = Number(blockSizeValue);
	const parallelization = Number(parallelizationValue);
	if (
		!Number.isSafeInteger(cost) ||
		!Number.isSafeInteger(blockSize) ||
		!Number.isSafeInteger(parallelization) ||
		cost < 2 ||
		blockSize < 1 ||
		parallelization < 1
	) {
		throw new Error('Parámetros de hash no válidos.');
	}

	const salt = Buffer.from(saltValue, 'base64url');
	const hash = Buffer.from(hashValue, 'base64url');
	if (salt.length < SALT_BYTES || hash.length !== KEY_BYTES) {
		throw new Error('Hash incompleto.');
	}

	return { blockSize, cost, hash, parallelization, salt };
}

function deriveKey(
	password: string,
	salt: Buffer,
	cost = SCRYPT_COST,
	blockSize = SCRYPT_BLOCK_SIZE,
	parallelization = SCRYPT_PARALLELIZATION,
): Buffer {
	return scryptSync(password, salt, KEY_BYTES, {
		N: cost,
		r: blockSize,
		p: parallelization,
		maxmem: SCRYPT_MAX_MEMORY,
	});
}

function assertPasswordInput(password: string): void {
	if (typeof password !== 'string' || password.length === 0 || password.length > 1024) {
		throw new Error('Contraseña no válida.');
	}
}

function assertParticipantPin(pin: string): void {
	if (!/^\d{4}$/.test(pin)) {
		throw new Error('PIN no válido.');
	}
}
