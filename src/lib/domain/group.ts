export interface GroupRecord {
	accessPasswordHash: string;
	activeEditionId: string | null;
	archivedAt: string | null;
	createdAt: string;
	id: string;
	name: string;
	slug: string;
	suggestedBudgetAmount: number | null;
	updatedAt: string;
}

export class GroupValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GroupValidationError';
	}
}

export function assertGroupRecord(group: GroupRecord): void {
	if (!group.id || !group.name.trim() || !group.accessPasswordHash || !isValidSlug(group.slug)) {
		throw new GroupValidationError('Los datos de familia no son válidos.');
	}

	if (
		group.suggestedBudgetAmount !== null &&
		(!Number.isFinite(group.suggestedBudgetAmount) || group.suggestedBudgetAmount < 0)
	) {
		throw new GroupValidationError('El presupuesto recomendado no es válido.');
	}
}

export function isValidSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
