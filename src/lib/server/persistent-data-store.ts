import { getLocalData, updateLocalData, type LocalDataState } from './local-json-store.ts';
import { readPostgresData, updatePostgresData } from './postgres-data-store.ts';

/** Local JSON remains the development default; hosted runtimes require PostgreSQL. */
export function usesPostgres(): boolean {
	return process.env.VERCEL === '1' || process.env.STORAGE_BACKEND === 'postgres';
}

export async function readPersistentData(): Promise<LocalDataState> {
	return usesPostgres() ? readPostgresData() : structuredClone(getLocalData());
}

export async function updatePersistentData<Result>(mutation: (draft: LocalDataState) => Result): Promise<Result> {
	return usesPostgres() ? updatePostgresData(mutation) : updateLocalData(mutation);
}
