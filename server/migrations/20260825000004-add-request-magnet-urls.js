"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("Requests")
		if (!table.magnetUrls) {
			await queryInterface.addColumn("Requests", "magnetUrls", {
				type: Sequelize.JSONB,
				allowNull: true,
			})
		}
		// Backfill: seed the array from the existing single magnetUrl.
		await queryInterface.sequelize.query(
			`UPDATE "Requests"
			 SET "magnetUrls" = to_jsonb(ARRAY["magnetUrl"])
			 WHERE "magnetUrl" IS NOT NULL
			   AND ("magnetUrls" IS NULL)`
		)
	},

	down: async (queryInterface) => {
		await queryInterface.removeColumn("Requests", "magnetUrls").catch(() => {})
	},
}
