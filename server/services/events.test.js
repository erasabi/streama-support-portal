const { isUnchangedEvent } = require("./events")

describe("isUnchangedEvent", () => {
	test("skips when type and actor match the last event", () => {
		expect(
			isUnchangedEvent({ type: "downloading", actor: "pipeline" }, "downloading", "pipeline")
		).toBe(true)
	})

	test("records when stage or actor changes", () => {
		expect(
			isUnchangedEvent({ type: "downloading", actor: "pipeline" }, "encoding", "pipeline")
		).toBe(false)
		expect(
			isUnchangedEvent({ type: "downloading", actor: "pipeline" }, "downloading", "sortify")
		).toBe(false)
		expect(isUnchangedEvent(null, "downloading", "pipeline")).toBe(false)
	})
})
