export const normalizeContainerNumber = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
