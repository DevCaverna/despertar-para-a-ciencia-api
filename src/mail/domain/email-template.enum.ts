export enum EmailTemplate {
	EXAMPLE = 1,
}

export interface TemplateParamsMap {
	[EmailTemplate.EXAMPLE]: Record<string, unknown>;
}
