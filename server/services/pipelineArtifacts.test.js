const { mergePipelineArtifacts, artifactsHaveContent } = require("./pipelineArtifacts")

describe("mergePipelineArtifacts", () => {
	test("ignores empty ticks and null incoming", () => {
		expect(mergePipelineArtifacts(null, null)).toBe(null)
		expect(mergePipelineArtifacts({ download: { files: [{ name: "a.mkv" }] } }, {})).toEqual({
			download: { files: [{ name: "a.mkv" }] },
		})
		expect(
			mergePipelineArtifacts(
				{ download: { files: [{ name: "a.mkv" }] } },
				{ download: { files: [] } }
			)
		).toEqual({ download: { files: [{ name: "a.mkv" }] } })
	})

	test("unions files by name and never shrinks", () => {
		const first = mergePipelineArtifacts(null, {
			download: {
				folderName: "the-matrix-1999-tmdb603",
				files: [{ name: "Movie.mkv", kind: "video", bytes: 10 }],
			},
		})
		const second = mergePipelineArtifacts(first, {
			download: {
				files: [{ name: "Movie.en.srt", kind: "subtitle" }],
			},
			encode: {
				files: [{ name: "Movie_1080p.mp4", kind: "video" }],
				subtitles: [{ name: "en_Movie.srt", language: "en" }],
			},
		})
		expect(second.download.files.map((f) => f.name).sort()).toEqual([
			"Movie.en.srt",
			"Movie.mkv",
		])
		expect(second.encode.files).toEqual([
			{ name: "Movie_1080p.mp4", kind: "video" },
		])
		const third = mergePipelineArtifacts(second, {
			download: { files: [{ name: "Movie.mkv", kind: "video", bytes: 99 }] },
		})
		expect(third.download.files).toHaveLength(2)
		expect(third.download.files.find((f) => f.name === "Movie.mkv").bytes).toBe(99)
	})

	test("does not let an error-only tick wipe inventories", () => {
		const kept = mergePipelineArtifacts(
			{
				encode: { files: [{ name: "a.mp4", kind: "video" }] },
			},
			{ download: {}, encode: { files: [] } }
		)
		expect(kept.encode.files).toEqual([{ name: "a.mp4", kind: "video" }])
	})

	test("accepts bare filename strings", () => {
		const merged = mergePipelineArtifacts(null, {
			upload: { files: ["ep1_1080p.mp4", "subs/en_ep1.srt"] },
		})
		expect(merged.upload.files).toEqual([
			{ name: "ep1_1080p.mp4", kind: "video" },
			{ name: "subs/en_ep1.srt", kind: "subtitle" },
		])
	})
})

describe("artifactsHaveContent", () => {
	test("is false for empty objects", () => {
		expect(artifactsHaveContent(null)).toBe(false)
		expect(artifactsHaveContent({})).toBe(false)
		expect(artifactsHaveContent({ download: { files: [] } })).toBe(false)
	})

	test("is true when a stage has names or files", () => {
		expect(artifactsHaveContent({ download: { torrentName: "X" } })).toBe(true)
		expect(artifactsHaveContent({ encode: { files: ["a.mp4"] } })).toBe(true)
	})
})
