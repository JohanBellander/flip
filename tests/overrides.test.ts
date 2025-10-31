import { describe, it, expect } from "vitest";
import { applyResponsiveOverrides, applyOverridesToTree } from "../src/overrides";

describe("responsive overrides engine (§5)", () => {
	it("applies ">=" ascending then "<=" descending by viewport width", () => {
		const node = {
			id: "t1",
			type: "Text",
			fontSize: 12,
			at: {
				">=320": { fontSize: 14 },
				">=768": { fontSize: 18 },
				"<=480": { fontSize: 13 },
				"<=320": { fontSize: 11 },
			},
		} as any;

		// W=500: applies >=320 (14); no <= buckets apply
		const w500 = applyResponsiveOverrides(node, 500);
		expect(w500.fontSize).toBe(14);

		// W=320: >=320 (14) then <=480 (13) then <=320 (11)
		const w320 = applyResponsiveOverrides(node, 320);
		expect(w320.fontSize).toBe(11);
	});

	it("replaces arrays and nested objects via shallow merge", () => {
		const stack = {
			id: "root",
			type: "Stack",
			gap: 8,
			children: [{ id: "a", type: "Text", text: "A" }],
			minSize: { w: 10, h: 20 },
			at: {
				">=600": {
					children: [
						{ id: "b", type: "Text", text: "B" },
						{ id: "c", type: "Text", text: "C" },
					],
					minSize: { w: 50 },
				},
			},
		} as any;

		const res = applyResponsiveOverrides(stack, 800);
		expect(res.children.map((n: any) => n.id)).toEqual(["b", "c"]);
		expect(res.minSize).toEqual({ w: 50 });
	});

	it("recurses into children and applies their own overrides", () => {
		const root = {
			id: "root",
			type: "Stack",
			children: [
				{
					id: "child",
					type: "Text",
					text: "Hi",
					fontSize: 12,
					at: { ">=700": { fontSize: 20 } },
				},
			],
		} as any;
		const res = applyResponsiveOverrides(root, 720);
		expect(res.children[0].fontSize).toBe(20);
	});

	it("accepts viewport string via applyOverridesToTree", () => {
		const node = { id: "t2", type: "Text", fontSize: 10, at: { ">=300": { fontSize: 15 } } } as any;
		const res = applyOverridesToTree(node, "320x640");
		expect((res as any).fontSize).toBe(15);
	});
});


