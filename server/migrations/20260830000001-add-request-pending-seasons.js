"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("Requests")
		if (!table.pendingSeasons) {
			await queryInterface.addColumn("Requests", "pendingSeasons", {
				type: Sequelize.JSONB,
				allowNull: true,
			})
		}
	},

	down: async (queryInterface) => {
		await queryInterface.removeColumn("Requests", "pendingSeasons").catch(() => {})
	},
}
