type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneShallow<T extends RecordLike>(obj: T): T {
	const out: RecordLike = {};
	for (const k of Object.keys(obj)) {
		out[k] = obj[k];
	}
	return out as T;
}

// Shallow merge: properties from override replace base; arrays replace entirely; nested objects are replaced (no deep merge)
function shallowMerge<T extends RecordLike, U extends RecordLike>(base: T, override: U): T & U {
	const result: RecordLike = cloneShallow(base);
	for (const key of Object.keys(override)) {
		(result as any)[key] = (override as any)[key];
	}
	return result as T & U;
}

function parseAtKey(key: string): { kind: ">=" | "<="; value: number } | null {
	if (key.startsWith(">=")) {
		const n = Number(key.slice(2));
		return Number.isFinite(n) ? { kind: ">=", value: n } : null;
	}
	if (key.startsWith("<=")) {
		const n = Number(key.slice(2));
		return Number.isFinite(n) ? { kind: "<=", value: n } : null;
	}
	return null;
}

function getOrderedOverrides(at: unknown, viewportWidth: number): RecordLike[] {
	if (!isRecord(at)) return [];
	const ge: Array<{ v: number; o: RecordLike }> = [];
	const le: Array<{ v: number; o: RecordLike }> = [];
	for (const key of Object.keys(at)) {
		const parsed = parseAtKey(key);
		if (!parsed) continue;
		const overrideValue = (at as any)[key];
		if (!isRecord(overrideValue)) continue;
		if (parsed.kind === ">=" && parsed.value <= viewportWidth) {
			ge.push({ v: parsed.value, o: overrideValue });
		} else if (parsed.kind === "<=" && parsed.value >= viewportWidth) {
			le.push({ v: parsed.value, o: overrideValue });
		}
	}
	ge.sort((a, b) => a.v - b.v); // ascending
	le.sort((a, b) => b.v - a.v); // descending
	return [...ge.map((x) => x.o), ...le.map((x) => x.o)];
}

function applyOverridesOnce<T extends RecordLike>(node: T, viewportWidth: number): T {
	const at = (node as any).at;
	const overrides = getOrderedOverrides(at, viewportWidth);
	if (overrides.length === 0) return node;
	let current: RecordLike = node;
	for (const ov of overrides) {
		current = shallowMerge(current, ov);
	}
	return current as T;
}

function mapChildrenRecursively(node: any, viewportWidth: number): any {
	// Recurse into known child containers
	if (Array.isArray(node?.children)) {
		node = { ...node, children: node.children.map((c: any) => applyResponsiveOverrides(c, viewportWidth)) };
	}
	if (node && node.child && typeof node.child === "object") {
		node = { ...node, child: applyResponsiveOverrides(node.child, viewportWidth) };
	}
	if (Array.isArray(node?.fields)) {
		node = { ...node, fields: node.fields.map((c: any) => applyResponsiveOverrides(c, viewportWidth)) };
	}
	if (Array.isArray(node?.actions)) {
		node = { ...node, actions: node.actions.map((c: any) => applyResponsiveOverrides(c, viewportWidth)) };
	}
	return node;
}

export function applyResponsiveOverrides<T>(node: T, viewportWidth: number): T {
	if (!isRecord(node)) return node;
	// First, apply overrides to this node shallowly
	const withSelf = applyOverridesOnce(node, viewportWidth);
	// Then, recurse into child containers so that children's own overrides are applied
	const withChildren = mapChildrenRecursively(withSelf, viewportWidth);
	return withChildren as T;
}

export function applyOverridesToTree<T>(root: T, viewport: string): T {
	const match = /^([0-9]+)x([0-9]+)$/.exec(viewport);
	const width = match ? Number(match[1]) : NaN;
	if (!Number.isFinite(width)) return root;
	return applyResponsiveOverrides(root as any, width);
}


