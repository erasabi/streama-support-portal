const { mediaHasVideo, fileLooksLikeVideo, findIdByApiId } = require("./streamaLibrary")

describe("fileLooksLikeVideo / mediaHasVideo", () => {
	test("Streama {id} stub counts as video", () => {
		expect(fileLooksLikeVideo({ id: 28355 })).toBe(true)
		expect(mediaHasVideo({ files: [{ id: 99 }] })).toBe(true)
	})

	test("srt is not video", () => {
		expect(
			fileLooksLikeVideo({
				originalFilename: "note.srt",
				contentType: "application/x-subrip",
			})
		).toBe(false)
		expect(
			mediaHasVideo({
				files: [{ originalFilename: "note.srt", contentType: "application/x-subrip" }],
			})
		).toBe(false)
	})

	test("deleted movie is not in library", () => {
		expect(mediaHasVideo({ deleted: true, files: [{ id: 1 }] })).toBe(false)
	})
})

describe("findIdByApiId", () => {
	test("uses Streama apiId filter when the index honors it", async () => {
		const paths = []
		const client = {
			getJson: async (path) => {
				paths.push(path)
				expect(path).toContain("apiId=69866")
				return { total: 1, list: [{ id: 1720, apiId: "69866" }] }
			},
		}
		expect(await findIdByApiId(client, "/tvShow/index.json", "69866")).toBe(1720)
		expect(paths).toHaveLength(1)
	})

	test("returns null from a filtered empty index without paging", async () => {
		let calls = 0
		const client = {
			getJson: async () => {
				calls += 1
				return { total: 0, list: [] }
			},
		}
		expect(await findIdByApiId(client, "/movie/index.json", 754)).toBeNull()
		expect(calls).toBe(1)
	})

	test("pages the index when Streama ignores apiId", async () => {
		const client = {
			getJson: async (path) => {
				if (path.includes("apiId=")) {
					return {
						total: 200,
						list: [
							{ id: 1, apiId: 111 },
							{ id: 2, apiId: 222 },
						],
					}
				}
				expect(path).toContain("offset=0")
				return {
					total: 2,
					list: [
						{ id: 10, apiId: 111 },
						{ id: 1720, apiId: "69866" },
					],
				}
			},
		}
		expect(await findIdByApiId(client, "/tvShow/index.json", "69866")).toBe(1720)
	})

	test("matches TMDB apiId in a paged Streama index", async () => {
		const client = {
			getJson: async (path) => {
				expect(path).toContain("/tvShow/index.json")
				expect(path).toContain("offset=0")
				return {
					total: 2,
					list: [
						{ id: 10, apiId: 111 },
						{ id: 1720, apiId: "69866" },
					],
				}
			},
		}
		expect(await findIdByApiId(client, "/tvShow/index.json", "69866")).toBe(1720)
	})

	test("returns null when the title is not in the index", async () => {
		const client = {
			getJson: async () => ({ total: 1, list: [{ id: 1, apiId: 99 }] }),
		}
		expect(await findIdByApiId(client, "/tvShow/index.json", 69866)).toBeNull()
	})

	test("stops a slow index scan at the deadline", async () => {
		await expect(
			findIdByApiId(
				{ getJson: async () => ({ total: 500, list: [{ id: 1, apiId: 99 }] }) },
				"/tvShow/index.json",
				1,
				{ deadline: Date.now() - 1 }
			)
		).rejects.toThrow(/timeout/)
	})
})
