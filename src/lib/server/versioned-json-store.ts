/** A value read from a private JSON object together with its opaque version. */
export interface VersionedJson<T> {
	value: T;
	version: string;
}

/**
 * Generic versioned JSON interface for isolated tests or future adapters.
 * Production persistence uses PostgreSQL transactions instead.
 */
export interface VersionedJsonStore {
	read<T>(key: string): Promise<VersionedJson<T> | null>;
	create<T>(key: string, value: T): Promise<VersionedJson<T> | null>;
	writeIfVersion<T>(key: string, expectedVersion: string, value: T): Promise<VersionedJson<T> | null>;
}

export interface SuccessfulMutation<T, Result> {
	document: VersionedJson<T>;
	result: Result;
}

/**
 * Applies a mutation only after its replacement was persisted with a matching
 * version. Callers must return sensitive values from `result` only after this
 * function resolves successfully.
 */
export async function mutateWithRetries<T, Result>(
	store: VersionedJsonStore,
	key: string,
	mutation: (current: T) => { next: T; result: Result },
	maxAttempts = 3,
): Promise<SuccessfulMutation<T, Result> | null> {
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const current = await store.read<T>(key);
		if (current === null) {
			return null;
		}

		const { next, result } = mutation(current.value);
		const written = await store.writeIfVersion(key, current.version, next);
		if (written !== null) {
			return { document: written, result };
		}
	}

	return null;
}

/**
 * Process-local development/test store. It intentionally has no filesystem
 * backing and therefore cannot accidentally be used for real participant data.
 */
export class InMemoryVersionedJsonStore implements VersionedJsonStore {
	readonly #documents = new Map<string, VersionedJson<unknown>>();
	#versionCounter = 0;

	async read<T>(key: string): Promise<VersionedJson<T> | null> {
		const document = this.#documents.get(key);
		return document === undefined ? null : cloneVersioned(document as VersionedJson<T>);
	}

	async create<T>(key: string, value: T): Promise<VersionedJson<T> | null> {
		if (this.#documents.has(key)) {
			return null;
		}

		const document = this.createVersioned(value);
		this.#documents.set(key, document);
		return cloneVersioned(document);
	}

	async writeIfVersion<T>(
		key: string,
		expectedVersion: string,
		value: T,
	): Promise<VersionedJson<T> | null> {
		const current = this.#documents.get(key);
		if (current === undefined || current.version !== expectedVersion) {
			return null;
		}

		const document = this.createVersioned(value);
		this.#documents.set(key, document);
		return cloneVersioned(document);
	}

	private createVersioned<T>(value: T): VersionedJson<T> {
		this.#versionCounter += 1;
		return {
			value: structuredClone(value),
			version: `memory-${this.#versionCounter}`,
		};
	}
}

function cloneVersioned<T>(document: VersionedJson<T>): VersionedJson<T> {
	return {
		value: structuredClone(document.value),
		version: document.version,
	};
}
