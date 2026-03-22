import { describe, expect, it } from 'vitest';
import {
	getPropertyByName,
	getFirstPropertyByName,
	getPropertyPlainText,
	getPropertyNamedValue,
	getPropertyNumberValue,
} from './property-utils.js';

describe('Notion property utils', () => {
	const page = {
		properties: {
			Title: {
				type: 'title',
				title: [{ plain_text: 'Hello' }, { plain_text: ' World' }],
			},
			Status: {
				type: 'status',
				status: { name: 'Published' },
			},
			Weight: {
				type: 'number',
				number: 7,
			},
			WeightText: {
				type: 'rich_text',
				rich_text: [{ plain_text: '42' }],
			},
		},
	};

	it('gets property by name', () => {
		expect(getPropertyByName(page, 'Title')).toEqual(page.properties.Title);
		expect(getPropertyByName(page, 'Missing')).toBeNull();
	});

	it('gets first existing property from candidate names', () => {
		expect(getFirstPropertyByName(page, ['Missing', 'Status'])).toEqual(page.properties.Status);
		expect(getFirstPropertyByName(page, ['Nope', 'Nothing'])).toBeNull();
	});

	it('extracts plain text from title/rich_text-like structures', () => {
		expect(getPropertyPlainText(page.properties.Title)).toBe('Hello World');
		expect(getPropertyPlainText({ rich_text: [{ plain_text: 'Text' }] })).toBe('Text');
		expect(getPropertyPlainText({ url: 'https://example.com' })).toBe('https://example.com');
	});

	it('extracts named value from select/status and falls back to text', () => {
		expect(getPropertyNamedValue(page.properties.Status)).toBe('Published');
		expect(getPropertyNamedValue(page.properties.Title)).toBe('Hello World');
	});

	it('extracts numeric values from number properties and numeric text', () => {
		expect(getPropertyNumberValue(page.properties.Weight)).toBe(7);
		expect(getPropertyNumberValue(page.properties.WeightText)).toBe(42);
		expect(getPropertyNumberValue(page.properties.Status)).toBeNull();
	});
});
