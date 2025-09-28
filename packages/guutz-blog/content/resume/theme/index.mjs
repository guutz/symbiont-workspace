import Handlebars from 'handlebars';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use createRequire to load existing CommonJS helper modules (so helpers can
// remain CommonJS). We keep Handlebars as an ESM import.
const require = createRequire(import.meta.url);
const { birthDate } = require(path.join(__dirname, 'theme', 'hbs-helpers', 'birth-date.js'));
const { dateHelpers } = require(path.join(__dirname, 'theme', 'hbs-helpers', 'date-helpers.js'));
const { paragraphSplit } = require(path.join(__dirname, 'theme', 'hbs-helpers', 'paragraph-split.js'));
const { toLowerCase } = require(path.join(__dirname, 'theme', 'hbs-helpers', 'to-lower-case.js'));
const { spaceToDash } = require(path.join(__dirname, 'theme', 'hbs-helpers', 'space-to-dash.js'));

const { MY, Y, DMY } = dateHelpers;

Handlebars.registerHelper('birthDate', birthDate);
Handlebars.registerHelper('MY', MY);
Handlebars.registerHelper('Y', Y);
Handlebars.registerHelper('DMY', DMY);
Handlebars.registerHelper('paragraphSplit', paragraphSplit);
Handlebars.registerHelper('toLowerCase', toLowerCase);
Handlebars.registerHelper('spaceToDash', spaceToDash);

export function render(resume) {
	const css = readFileSync(path.join(__dirname, 'style.css'), 'utf-8');
	const template = readFileSync(path.join(__dirname, 'resume.hbs'), 'utf-8');
	const partialsDir = path.join(__dirname, 'theme', 'partials');
	const filenamePartial = readdirSync(partialsDir);

	filenamePartial.forEach((filenamePartial) => {
		const matches = /^([^.]+).hbs$/.exec(filenamePartial);
		if (!matches) return;
		const name = matches[1];
		const filepath = path.join(partialsDir, filenamePartial);
		const template = readFileSync(filepath, 'utf8');
		Handlebars.registerPartial(name, template);
	});

	return Handlebars.compile(template)({
		css,
		resume,
	});
}

export const pdfRenderOptions = {
	margin: {
		top: '0.8 cm',
		bottom: '0.8 cm',
		left: '0.8 cm',
		right: '0.8 cm',
	},
};
