import { environmentSchema } from '../dist/config/config.validation.js';

const results = [
	{
		name: 'runtime environment',
		result: environmentSchema.safeParse(process.env),
	},
];

const issues = results.flatMap(({ name, result }) =>
	result.success
		? []
		: result.error.issues.map(
				(issue) =>
					`${name}: ${issue.path.join('.') || 'environment'}: ${issue.message}`,
			),
);

if (issues.length > 0) {
	for (const issue of issues) console.error(issue);
	process.exit(78);
}
