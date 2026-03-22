type NotionLikeProperty = Record<string, any> | null | undefined;
type NotionLikePage = { properties?: Record<string, any> } | null | undefined;

export function getPropertyByName(page: NotionLikePage, propertyName: string): NotionLikeProperty {
	if (!page?.properties || !propertyName) {
		return null;
	}

	return page.properties[propertyName] ?? null;
}

export function getFirstPropertyByName(page: NotionLikePage, propertyNames: string[]): NotionLikeProperty {
	if (!page?.properties || !Array.isArray(propertyNames)) {
		return null;
	}

	for (const propertyName of propertyNames) {
		const property = page.properties[propertyName];
		if (property) {
			return property;
		}
	}

	return null;
}

export function getPropertyPlainText(property: NotionLikeProperty): string | null {
	if (!property || typeof property !== 'object') {
		return null;
	}

	const richText = Array.isArray(property.rich_text)
		? property.rich_text
		: Array.isArray(property.title)
			? property.title
			: Array.isArray(property.caption)
				? property.caption
				: null;

	if (richText) {
		const text = richText
			.map((item: any) => item?.plain_text ?? '')
			.join('')
			.trim();

		return text || null;
	}

	if (typeof property.url === 'string' && property.url.trim()) {
		return property.url.trim();
	}

	if (typeof property.formula?.string === 'string' && property.formula.string.trim()) {
		return property.formula.string.trim();
	}

	return null;
}

export function getPropertyNamedValue(property: NotionLikeProperty): string | null {
	const optionName = property?.select?.name ?? property?.status?.name;
	if (typeof optionName === 'string' && optionName.trim()) {
		return optionName.trim();
	}

	return getPropertyPlainText(property);
}

export function getPropertyNumberValue(property: NotionLikeProperty): number | null {
	if (typeof property?.number === 'number') {
		return Number.isFinite(property.number) ? property.number : null;
	}

	const textValue = getPropertyNamedValue(property);
	if (!textValue) {
		return null;
	}

	const parsed = Number.parseInt(textValue, 10);
	return Number.isFinite(parsed) ? parsed : null;
}
