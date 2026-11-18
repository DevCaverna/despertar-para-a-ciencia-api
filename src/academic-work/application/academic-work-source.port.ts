export const ACADEMIC_WORK_SOURCE_PORT = Symbol('AcademicWorkSourcePort');

export interface AcademicWorkQuery {
	sourceIdentifier: string;
	fromDate?: string;
	untilDate?: string;
	publicationType?: 'journal-article';
	requireAbstract?: boolean;
	cursor?: string;
	limit?: number;
}

export interface AcademicWorkCandidate {
	externalId: string;
	title: string;
	authors: string[];
	abstract?: string;
	publicationDate?: string;
	journal?: string;
	url?: string;
}

export interface AcademicWorkPage {
	items: AcademicWorkCandidate[];
	nextCursor?: string;
}

export interface AcademicWorkSourcePort {
	search(query: AcademicWorkQuery): Promise<AcademicWorkPage>;
}

export type AcademicWorkSourceErrorCode =
	| 'timeout'
	| 'unavailable'
	| 'invalid-response';

export class AcademicWorkSourceError extends Error {
	constructor(public readonly code: AcademicWorkSourceErrorCode) {
		super('Academic work source ' + code + '.');
		this.name = 'AcademicWorkSourceError';
	}
}
