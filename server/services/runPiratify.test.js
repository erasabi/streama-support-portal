const { commandFromInput, fromRow, runPiratifyOnPrelanflix } = require("./runPiratify")

function memoryDb(initial) {
	const rows = new Map()
	if (initial) rows.set(initial.id, initial)
	return {
		PipelineDryRun: {
			async create(attrs) {
				const row = {
					id: "dr-1",
					status: attrs.status,
					payload: attrs.payload,
					result: null,
					error: null,
				}
				rows.set(row.id, row)
				return row
			},
			async findByPk(id) {
				return rows.get(id) || null
			},
		},
		_rows: rows,
	}
}

describe("commandFromInput", () => {
	test("always uses add --dry-run, never resolve, and episodes win over seasons", () => {
		expect(
			commandFromInput({
				folderName: "show-1999-tmdb1",
				title: "Show",
				year: "1999",
				episodes: ["S01E01"],
				seasons: ["1"],
			})
		).toEqual([
			"piratify",
			"add",
			"--dry-run",
			"--json",
			"-f",
			"show-1999-tmdb1",
			"--episodes",
			"S01E01",
			"--year",
			"1999",
			"Show",
		])
	})
})

describe("fromRow", () => {
	test("ready tickets are pending, not a failed lookup", () => {
		const out = fromRow({ id: "dr-1", status: "ready" }, ["piratify", "add", "--dry-run"])
		expect(out.status).toBe("pending")
		expect(out.ticketId).toBe("dr-1")
	})

	test("done tickets surface selected torrents and ranOn prelanflix", () => {
		const out = fromRow(
			{
				id: "dr-1",
				status: "done",
				result: {
					selected: [{ name: "Show.S01.1080p" }],
					searchQueries: [{ query: "show 1999" }],
				},
			},
			["piratify", "add", "--dry-run"]
		)
		expect(out.status).toBe("ok")
		expect(out.ranOn).toBe("prelanflix")
		expect(out.selected[0].name).toBe("Show.S01.1080p")
		expect(out.searchQueries[0].query).toBe("show 1999")
	})
})

describe("runPiratifyOnPrelanflix", () => {
	test("returns pending immediately so the HTTP request does not wait on the worker", async () => {
		const models = memoryDb()
		const out = await runPiratifyOnPrelanflix(
			{ title: "Show", year: "1999", seasons: ["1"], folderName: "show-1999-tmdb1" },
			{ db: models }
		)
		expect(out.status).toBe("pending")
		expect(out.ticketId).toBe("dr-1")
		expect(out.command).toContain("--dry-run")
		expect(models._rows.get("dr-1").status).toBe("ready")
	})

	test("returns the worker result when wait:true and the ticket is done", async () => {
		const models = memoryDb()
		const out = await runPiratifyOnPrelanflix(
			{ title: "Show", year: "1999", seasons: ["1"], folderName: "show-1999-tmdb1" },
			{
				db: models,
				wait: true,
				timeoutMs: 1000,
				pollMs: 10,
				sleep: async () => {
					const row = models._rows.get("dr-1")
					row.status = "done"
					row.result = {
						selected: [{ name: "Show.S01" }],
						missing: [],
						searchQueries: [{ query: "show 1999", result_count: 3 }],
					}
				},
			}
		)
		expect(out.status).toBe("ok")
		expect(out.ranOn).toBe("prelanflix")
		expect(out.selected[0].name).toBe("Show.S01")
		expect(out.command).toContain("--dry-run")
		expect(out.command).not.toContain("resolve")
		expect(models._rows.get("dr-1").payload.title).toBe("Show")
	})

	test("times out as unavailable if the worker never finishes", async () => {
		let now = 0
		const out = await runPiratifyOnPrelanflix(
			{ title: "Show" },
			{
				db: memoryDb(),
				wait: true,
				timeoutMs: 100,
				pollMs: 10,
				now: () => now,
				sleep: async () => {
					now = 200
				},
			}
		)
		expect(out.status).toBe("unavailable")
		expect(out.ranOn).toBe("prelanflix")
		expect(out.reason).toMatch(/next portal-worker tick/)
	})

	test("failed tickets are errors, not a silent skip", async () => {
		const models = memoryDb()
		const out = await runPiratifyOnPrelanflix(
			{ title: "Show" },
			{
				db: models,
				wait: true,
				timeoutMs: 1000,
				pollMs: 10,
				sleep: async () => {
					const row = models._rows.get("dr-1")
					row.status = "failed"
					row.error = "piratify missing"
				},
			}
		)
		expect(out.status).toBe("error")
		expect(out.error).toBe("piratify missing")
		expect(out.ranOn).toBe("prelanflix")
	})
})
