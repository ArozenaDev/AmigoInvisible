export interface GiftIdea {
	affiliateUrl: string;
	createdAt: string;
	groupId: string;
	id: string;
	imageUrl: string;
	participantId: string;
	sortOrder: number;
	title: string;
	updatedAt: string;
}

export interface GiftIdeaInput {
	affiliateUrl: string;
	imageUrl: string;
	title: string;
}

export function normalizeGiftIdeaInput(input: GiftIdeaInput): GiftIdeaInput | null {
	const title = input.title.trim();
	const affiliateUrl = normalizePublicHttpsUrl(input.affiliateUrl);
	const imageUrl = normalizePublicHttpsUrl(input.imageUrl);
	if (!title || title.length > 160 || !affiliateUrl || !imageUrl) {
		return null;
	}

	return { affiliateUrl, imageUrl, title };
}

function normalizePublicHttpsUrl(value: string): string | null {
	if (value.length > 2_048) {
		return null;
	}

	try {
		const url = new URL(value);
		const hostname = url.hostname.toLowerCase();
		if (
			url.protocol !== 'https:' ||
			url.username ||
			url.password ||
			!hostname ||
			hostname === 'localhost' ||
			hostname.endsWith('.localhost') ||
			hostname.includes(':') ||
			/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
		) {
			return null;
		}

		return url.toString();
	} catch {
		return null;
	}
}
